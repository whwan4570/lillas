import { createServer } from 'node:http';
import { config } from './config.mjs';
import {
  deleteSephoraTarget,
  ensureDb,
  listImportedProducts,
  listPipelineRuns,
  listSephoraTargets,
  nowIso,
  prisma,
  readDb,
  upsertImportedProduct,
  upsertSephoraTarget,
  writeDb
} from './dbStore.mjs';
import { json, parseBody, redirect } from './http.mjs';
import { parseSephoraProductText } from './productImport.mjs';
import { runImportAndEnrichPipeline } from './productPipeline.mjs';
import { createPrismaProductRepo } from './productPipelinePrismaRepo.mjs';
import {
  discoverCandidateSources,
  materializeProductSourceFromDbRow,
  reprocessAmazonSources,
  safeParseJson,
  toPipelineResultDto
} from './productPipelineReprocessor.mjs';
import { startProductPipelineScheduler } from './productPipelineScheduler.mjs';
import {
  amazonItemToProductSource,
  brandOfficialToProductSource,
  sephoraImportedToProductSource,
  ultaItemToProductSource
} from './productSourceAdapters.mjs';
import { standardizeProduct } from './sephoraSchema.mjs';
import { listRecentSephoraRuns, runSephoraCrawl } from './sephoraRunner.mjs';
import { startSephoraScheduler } from './sephoraScheduler.mjs';
import {
  generateResetToken,
  hashPassword,
  makeOAuthState,
  readOAuthState,
  signToken,
  verifyPassword,
  verifyToken
} from './security.mjs';
import {
  commentSchema,
  createPostSchema,
  loginSchema,
  parseOrThrow,
  passwordResetRequestSchema,
  passwordResetSchema,
  pipelineReprocessSchema,
  pipelineReviewQuerySchema,
  pipelineRunSchema,
  recentProductSchema,
  registerSchema,
  restoreBackupSchema,
  savedProductsSchema,
  sephoraCrawlOptionsSchema,
  sephoraTargetSchema,
  sephoraTextImportSchema,
  skinTestAnswersSchema,
  updateMeSchema,
  verifyEmailSchema
} from './validation.mjs';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop';
const pipelineRepo = createPrismaProductRepo(prisma);

function getAuthUser(req, db) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = verifyToken(token, config.tokenSecret);
  if (!userId) return null;
  return db.users.find((user) => user.id === userId) ?? null;
}

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    skinType: user.skinType,
    avatar: user.avatar,
    emailVerified: Boolean(user.emailVerified || user.googleSub)
  };
}

function toPostDto(post, db, authUserId) {
  const author = db.users.find((user) => user.id === post.authorId);
  const likes = db.likes.filter((like) => like.postId === post.id);
  const comments = db.comments
    .filter((comment) => comment.postId === post.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    id: post.id,
    authorId: post.authorId,
    author: author?.name ?? 'Unknown',
    avatar: author?.avatar ?? '',
    skinType: author?.skinType ?? 'Unknown',
    timeAgo: new Date(post.createdAt).toLocaleString(),
    title: post.title,
    content: post.content,
    images: post.images ?? [],
    likes: likes.length,
    comments: comments.length,
    tags: post.tags ?? [],
    isLiked: authUserId ? likes.some((like) => like.userId === authUserId) : false,
    isSaved: false,
    sponsored: Boolean(post.sponsored),
    productAttachments: post.productAttachments ?? [],
    commentItems: comments.slice(0, 5).map((comment) => {
      const user = db.users.find((candidate) => candidate.id === comment.userId);
      return {
        id: comment.id,
        authorId: comment.userId,
        author: user?.name ?? 'Unknown',
        avatar: user?.avatar ?? '',
        content: comment.content,
        createdAt: comment.createdAt
      };
    })
  };
}

function getUserSkinTest(db, userId) {
  return db.skinTests.find((row) => row.userId === userId)?.answers ?? null;
}

function pruneExpiredTokens(db) {
  const now = Date.now();
  db.passwordResetTokens = db.passwordResetTokens.filter(
    (entry) => Number(entry.exp) > now && !entry.usedAt
  );
  db.emailVerificationTokens = db.emailVerificationTokens.filter(
    (entry) => Number(entry.exp) > now && !entry.usedAt
  );
}

function deriveSkinType(answers) {
  const type = (answers.skinType ?? '').trim();
  const sensitivity = (answers.sensitivity ?? '').trim();
  if (!type) return '';
  const typeTitle = type.charAt(0).toUpperCase() + type.slice(1);
  if (!sensitivity || sensitivity.toLowerCase() === 'none') return typeTitle;
  const sensTitle = sensitivity.charAt(0).toUpperCase() + sensitivity.slice(1);
  return `${typeTitle} - ${sensTitle}`;
}

function sanitizePage(rawPage) {
  const page = String(rawPage ?? '').trim().toLowerCase();
  const allowed = new Set([
    'home',
    'skin-test',
    'products',
    'recommendations',
    'product-detail',
    'comparison',
    'community',
    'following-manage',
    'dashboard'
  ]);
  return allowed.has(page) ? page : 'dashboard';
}

async function exchangeGoogleCodeForTokens(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: config.googleRedirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }
  return response.json();
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google userinfo failed: ${text}`);
  }
  return response.json();
}

async function readValidatedBody(req, schema) {
  return parseOrThrow(schema, await parseBody(req));
}

function badRequest(res, error) {
  return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });

  const db = await readDb();

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const { name, email, password, skinType } = await readValidatedBody(req, registerSchema);
      const existingUser = db.users.find((user) => user.email.toLowerCase() === email);
      if (existingUser) {
        // Allow google-only accounts to be upgraded to password login without
        // creating a duplicate user row.
        if (!existingUser.passwordHash && existingUser.googleSub) {
          existingUser.passwordHash = hashPassword(password);
          existingUser.name = existingUser.name || name;
          existingUser.skinType =
            existingUser.skinType && existingUser.skinType !== 'Not set'
              ? existingUser.skinType
              : skinType;
          existingUser.emailVerified = true;
          await writeDb(db);
          return json(res, 200, {
            token: signToken(existingUser.id, config.tokenSecret),
            user: toUserDto(existingUser),
            upgradedFromGoogleOnly: true
          });
        }
        return json(res, 409, { error: 'Email already exists' });
      }
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      const user = {
        id,
        name,
        email,
        passwordHash: hashPassword(password),
        skinType,
        avatar: DEFAULT_AVATAR,
        emailVerified: false,
        createdAt: nowIso()
      };
      db.users.push(user);
      await writeDb(db);
      return json(res, 201, {
        token: signToken(user.id, config.tokenSecret),
        user: toUserDto(user)
      });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const { email, password } = await readValidatedBody(req, loginSchema);
      const user = db.users.find((candidate) => candidate.email.toLowerCase() === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return json(res, 401, { error: 'Invalid credentials' });
      }
      return json(res, 200, {
        token: signToken(user.id, config.tokenSecret),
        user: toUserDto(user)
      });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { user: toUserDto(authUser) });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/auth/me') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const { name, skinType, avatar } = await readValidatedBody(req, updateMeSchema);
      if (name) authUser.name = name;
      if (skinType) authUser.skinType = skinType;
      if (avatar) {
        const isDataUrl = avatar.startsWith('data:image/') && avatar.length < 3_000_000;
        const isHttp = /^https?:\/\//.test(avatar) && avatar.length < 1024;
        if (isDataUrl || isHttp) authUser.avatar = avatar;
      }
      await writeDb(db);
      return json(res, 200, { user: toUserDto(authUser) });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/user/saved') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const row = db.savedProducts.find((entry) => entry.userId === authUser.id);
    return json(res, 200, { productIds: row?.productIds ?? [] });
  }

  if (req.method === 'POST' && url.pathname === '/api/user/saved') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const { productIds } = await readValidatedBody(req, savedProductsSchema);
      const existing = db.savedProducts.find((entry) => entry.userId === authUser.id);
      if (existing) existing.productIds = productIds;
      else db.savedProducts.push({ userId: authUser.id, productIds });
      await writeDb(db);
      return json(res, 200, { productIds });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/user/recents') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const row = db.recentProducts.find((entry) => entry.userId === authUser.id);
    return json(res, 200, { productIds: row?.productIds ?? [] });
  }

  if (req.method === 'POST' && url.pathname === '/api/user/recents') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const { productId } = await readValidatedBody(req, recentProductSchema);
      const row = db.recentProducts.find((entry) => entry.userId === authUser.id);
      const current = row?.productIds ?? [];
      const productIds = [productId, ...current.filter((id) => id !== productId)].slice(0, 20);
      if (row) row.productIds = productIds;
      else db.recentProducts.push({ userId: authUser.id, productIds });
      await writeDb(db);
      return json(res, 200, { productIds });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/user/skin-test') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { answers: getUserSkinTest(db, authUser.id) });
  }

  if ((req.method === 'POST' || req.method === 'PATCH') && url.pathname === '/api/user/skin-test') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const answers = parseOrThrow(skinTestAnswersSchema, body?.answers ?? body);
      const row = db.skinTests.find((entry) => entry.userId === authUser.id);
      const updatedAt = nowIso();
      if (row) {
        row.answers = answers;
        row.updatedAt = updatedAt;
      } else {
        db.skinTests.push({ userId: authUser.id, answers, updatedAt });
      }
      const derived = deriveSkinType(answers);
      if (derived) authUser.skinType = derived;
      await writeDb(db);
      return json(res, 200, { answers, user: toUserDto(authUser) });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'DELETE' && url.pathname === '/api/user/skin-test') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    db.skinTests = db.skinTests.filter((row) => row.userId !== authUser.id);
    await writeDb(db);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/password/request-reset') {
    try {
      const { email } = await readValidatedBody(req, passwordResetRequestSchema);
      pruneExpiredTokens(db);
      const user = db.users.find((candidate) => candidate.email.toLowerCase() === email);
      const response = { ok: true };
      if (user) {
        const resetToken = generateResetToken();
        db.passwordResetTokens.push({
          token: resetToken,
          userId: user.id,
          exp: Date.now() + 1000 * 60 * 30,
          usedAt: null,
          createdAt: nowIso()
        });
        await writeDb(db);
        const resetUrl = new URL(config.frontendOrigin);
        resetUrl.searchParams.set('reset_token', resetToken);
        console.log(`[password-reset] ${email} -> ${resetUrl.toString()}`);
        if (config.exposeDevTokens) {
          response.devResetToken = resetToken;
          response.devResetUrl = resetUrl.toString();
        }
      } else {
        console.log(`[password-reset] requested for unknown email: ${email}`);
      }
      return json(res, 200, response);
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/password/reset') {
    try {
      const { token, password } = await readValidatedBody(req, passwordResetSchema);
      pruneExpiredTokens(db);
      const entry = db.passwordResetTokens.find((row) => row.token === token && !row.usedAt);
      if (!entry || Number(entry.exp) < Date.now()) {
        return json(res, 400, { error: 'Reset token is invalid or expired' });
      }
      const user = db.users.find((candidate) => candidate.id === entry.userId);
      if (!user) return json(res, 400, { error: 'User not found' });
      user.passwordHash = hashPassword(password);
      entry.usedAt = nowIso();
      await writeDb(db);
      return json(res, 200, {
        token: signToken(user.id, config.tokenSecret),
        user: toUserDto(user)
      });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/email/request-verify') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    pruneExpiredTokens(db);
    if (authUser.emailVerified) {
      return json(res, 200, { ok: true, alreadyVerified: true });
    }
    const verifyToken = generateResetToken();
    db.emailVerificationTokens.push({
      token: verifyToken,
      userId: authUser.id,
      exp: Date.now() + 1000 * 60 * 60 * 24,
      usedAt: null,
      createdAt: nowIso()
    });
    await writeDb(db);
    const verifyUrl = new URL(config.frontendOrigin);
    verifyUrl.searchParams.set('verify_token', verifyToken);
    console.log(`[email-verify] ${authUser.email} -> ${verifyUrl.toString()}`);
    const response = { ok: true };
    if (config.exposeDevTokens) {
      response.devVerifyToken = verifyToken;
      response.devVerifyUrl = verifyUrl.toString();
    }
    return json(res, 200, response);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/email/verify') {
    try {
      const { token } = await readValidatedBody(req, verifyEmailSchema);
      pruneExpiredTokens(db);
      const entry = db.emailVerificationTokens.find((row) => row.token === token && !row.usedAt);
      if (!entry || Number(entry.exp) < Date.now()) {
        return json(res, 400, { error: 'Verification token is invalid or expired' });
      }
      const user = db.users.find((candidate) => candidate.id === entry.userId);
      if (!user) return json(res, 400, { error: 'User not found' });
      user.emailVerified = true;
      entry.usedAt = nowIso();
      await writeDb(db);
      return json(res, 200, { user: toUserDto(user) });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/google/start') {
    if (!config.googleClientId || !config.googleClientSecret) {
      const failUrl = new URL(config.frontendOrigin);
      failUrl.searchParams.set('auth_error', 'Google OAuth is not configured on server.');
      return redirect(res, failUrl.toString());
    }
    const page = sanitizePage(url.searchParams.get('page'));
    const state = makeOAuthState(page, config.tokenSecret);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.googleClientId);
    authUrl.searchParams.set('redirect_uri', config.googleRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'select_account');
    return redirect(res, authUrl.toString());
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/google/callback') {
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const failUrl = new URL(config.frontendOrigin);

    if (error) {
      failUrl.searchParams.set('auth_error', `Google login failed: ${error}`);
      return redirect(res, failUrl.toString());
    }

    const statePayload = readOAuthState(state ?? '', config.tokenSecret);
    if (!statePayload) {
      failUrl.searchParams.set('auth_error', 'Invalid or expired Google login state.');
      return redirect(res, failUrl.toString());
    }

    if (!code) {
      failUrl.searchParams.set('auth_error', 'Google login did not return authorization code.');
      return redirect(res, failUrl.toString());
    }

    try {
      const tokenResult = await exchangeGoogleCodeForTokens(code);
      const googleUser = await fetchGoogleUserInfo(tokenResult.access_token);
      const googleSub = String(googleUser.sub ?? '').trim();
      const email = String(googleUser.email ?? '').trim().toLowerCase();
      const name = String(googleUser.name ?? '').trim() || 'Google User';
      const picture = String(googleUser.picture ?? '').trim();
      if (!googleSub || !email) throw new Error('Google profile is missing required fields.');

      let user =
        db.users.find((candidate) => candidate.googleSub === googleSub) ??
        db.users.find((candidate) => candidate.email.toLowerCase() === email);

      if (!user) {
        user = {
          id: `google-${googleSub.slice(0, 16)}`,
          name,
          email,
          passwordHash: '',
          skinType: 'Not set',
          avatar: picture || DEFAULT_AVATAR,
          googleSub,
          emailVerified: true,
          createdAt: nowIso()
        };
        db.users.push(user);
      } else {
        user.googleSub = googleSub;
        user.name = user.name || name;
        user.avatar = user.avatar || picture;
        user.emailVerified = true;
      }

      await writeDb(db);
      const successUrl = new URL(config.frontendOrigin);
      successUrl.searchParams.set('auth_token', signToken(user.id, config.tokenSecret));
      successUrl.searchParams.set('page', sanitizePage(statePayload.page));
      return redirect(res, successUrl.toString());
    } catch (callbackError) {
      failUrl.searchParams.set(
        'auth_error',
        callbackError instanceof Error ? callbackError.message : 'Google authentication failed.'
      );
      return redirect(res, failUrl.toString());
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/backup') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { backup: db, exportedAt: nowIso() });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/imported-products') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const products = await listImportedProducts(limit);
    return json(res, 200, { products });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/import/sephora-text') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const payload = await readValidatedBody(req, sephoraTextImportSchema);
      const parsed = parseSephoraProductText(payload.rawText, {
        sourceItemId: payload.sourceItemId || undefined,
        sourceUrl: payload.sourceUrl || undefined,
        name: payload.name || undefined,
        brand: payload.brand || undefined
      });
      if (!parsed.sourceItemId) {
        return json(res, 400, { error: 'Could not find Sephora item id in text.' });
      }
      const standardized = standardizeProduct(parsed);
      const product = await upsertImportedProduct(standardized);
      return json(res, 201, {
        product,
        quality: { score: standardized.qualityScore, warnings: standardized.warnings }
      });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/sephora/targets') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const targets = await listSephoraTargets();
    return json(res, 200, { targets });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/sephora/targets') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const payload = await readValidatedBody(req, sephoraTargetSchema);
      const target = await upsertSephoraTarget(payload);
      return json(res, 201, { target });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'DELETE' && /^\/api\/admin\/sephora\/targets\/[^/]+$/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const sourceItemId = decodeURIComponent(url.pathname.split('/').pop() ?? '').trim();
    if (!sourceItemId) return json(res, 400, { error: 'sourceItemId is required.' });
    await deleteSephoraTarget(sourceItemId);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/sephora/run') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req).catch(() => ({}));
      const options = parseOrThrow(sephoraCrawlOptionsSchema, body ?? {});
      const summary = await runSephoraCrawl({ trigger: 'admin', ...options });
      return json(res, 200, { run: summary });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/sephora/runs') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const runs = await listRecentSephoraRuns(limit);
    return json(res, 200, { runs });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/pipeline/run') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const payload = await readValidatedBody(req, pipelineRunSchema);
      const amazonSource = amazonItemToProductSource(payload.amazon);

      const adapterByRetailer = {
        sephora: sephoraImportedToProductSource,
        ulta: ultaItemToProductSource,
        brand_official: brandOfficialToProductSource
      };
      const explicitCandidates = payload.candidates.map((candidate) =>
        adapterByRetailer[candidate.retailer](candidate.payload)
      );
      const discovered = payload.autoDiscoverCandidates
        ? await discoverCandidateSources(amazonSource, payload.candidateLimit)
        : [];

      const deduped = [];
      const seen = new Set();
      for (const candidate of [...explicitCandidates, ...discovered]) {
        const key = `${candidate.retailer}:${candidate.sourceItemId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(candidate);
      }

      const result = await runImportAndEnrichPipeline({
        amazonSource,
        candidateSources: deduped,
        repo: pipelineRepo
      });

      return json(res, 200, toPipelineResultDto(result));
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/pipeline/review-candidates') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const query = parseOrThrow(pipelineReviewQuerySchema, {
        limit: url.searchParams.get('limit') ?? 50
      });
      const rows = await prisma.productMatchCandidate.findMany({
        where: { decision: 'needs_review' },
        orderBy: { updatedAt: 'desc' },
        take: query.limit
      });
      const sourceIds = [
        ...new Set(rows.flatMap((row) => [row.amazonSourceId, row.enrichmentSourceId]))
      ];
      const sources = sourceIds.length
        ? await prisma.productSource.findMany({ where: { id: { in: sourceIds } } })
        : [];
      const sourceMap = new Map(sources.map((source) => [source.id, materializeProductSourceFromDbRow(source)]));

      const items = rows.map((row) => ({
        id: row.id,
        confidence: row.confidence,
        decision: row.decision,
        reasons: safeParseJson(row.reasonsJson, []),
        warnings: safeParseJson(row.warningsJson, []),
        breakdown: safeParseJson(row.breakdownJson, {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        amazonSource: sourceMap.get(row.amazonSourceId) ?? null,
        enrichmentSource: sourceMap.get(row.enrichmentSourceId) ?? null
      }));

      return json(res, 200, { items });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/pipeline/runs') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const query = parseOrThrow(pipelineReviewQuerySchema, {
        limit: url.searchParams.get('limit') ?? 20
      });
      const runs = await listPipelineRuns({ limit: query.limit });
      return json(res, 200, { runs });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/pipeline/reprocess') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req).catch(() => ({}));
      const payload = parseOrThrow(pipelineReprocessSchema, body ?? {});
      const summary = await reprocessAmazonSources({
        limit: payload.limit,
        statuses: payload.statuses,
        autoDiscoverCandidates: payload.autoDiscoverCandidates,
        candidateLimit: payload.candidateLimit,
        trigger: 'admin',
        logger: console
      });
      return json(res, 200, summary);
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/restore') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const { backup } = await readValidatedBody(req, restoreBackupSchema);
      await writeDb(backup);
      return json(res, 200, { ok: true });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/community/feed') {
    const authUser = getAuthUser(req, db);
    const authUserId = authUser?.id ?? null;
    const followingAuthorIds = authUserId
      ? db.follows.filter((follow) => follow.followerId === authUserId).map((follow) => follow.followingId)
      : [];
    const posts = db.posts
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((post) => toPostDto(post, db, authUserId));
    const creators = db.users.map((user) => ({
      authorId: user.id,
      author: user.name,
      skinType: user.skinType,
      avatar: user.avatar
    }));
    return json(res, 200, { posts, creators, followingAuthorIds });
  }

  if (req.method === 'POST' && url.pathname === '/api/community/posts') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const { title, content, productAttachments, images } = await readValidatedBody(req, createPostSchema);
      if (!content && productAttachments.length === 0 && images.length === 0) {
        return json(res, 400, { error: 'Post content is empty' });
      }
      const post = {
        id: db.nextPostId++,
        authorId: authUser.id,
        title,
        content,
        images,
        tags: ['My Post', ...(productAttachments.length ? ['Product Pick'] : ['Routine'])],
        sponsored: false,
        productAttachments,
        createdAt: nowIso()
      };
      db.posts.push(post);
      await writeDb(db);
      return json(res, 201, { post: toPostDto(post, db, authUser.id) });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && /^\/api\/community\/posts\/\d+\/like$/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const postId = Number(url.pathname.split('/')[4]);
    const post = db.posts.find((candidate) => candidate.id === postId);
    if (!post) return json(res, 404, { error: 'Post not found' });
    const exists = db.likes.find((like) => like.postId === postId && like.userId === authUser.id);
    if (exists) db.likes = db.likes.filter((like) => !(like.postId === postId && like.userId === authUser.id));
    else db.likes.push({ postId, userId: authUser.id });
    await writeDb(db);
    return json(res, 200, { post: toPostDto(post, db, authUser.id) });
  }

  if (req.method === 'POST' && /^\/api\/community\/posts\/\d+\/comments$/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const postId = Number(url.pathname.split('/')[4]);
    const post = db.posts.find((candidate) => candidate.id === postId);
    if (!post) return json(res, 404, { error: 'Post not found' });
    try {
      const { content } = await readValidatedBody(req, commentSchema);
      db.comments.push({
        id: db.nextCommentId++,
        postId,
        userId: authUser.id,
        content,
        createdAt: nowIso()
      });
      await writeDb(db);
      return json(res, 201, { post: toPostDto(post, db, authUser.id) });
    } catch (error) {
      return badRequest(res, error);
    }
  }

  if (req.method === 'POST' && /^\/api\/community\/follow\/.+/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const authorId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    if (!authorId || !db.users.some((user) => user.id === authorId) || authorId === authUser.id) {
      return json(res, 400, { error: 'Invalid author target' });
    }
    const exists = db.follows.find(
      (follow) => follow.followerId === authUser.id && follow.followingId === authorId
    );
    if (exists) {
      db.follows = db.follows.filter(
        (follow) => !(follow.followerId === authUser.id && follow.followingId === authorId)
      );
    } else {
      db.follows.push({ followerId: authUser.id, followingId: authorId });
    }
    await writeDb(db);
    const followingAuthorIds = db.follows
      .filter((follow) => follow.followerId === authUser.id)
      .map((follow) => follow.followingId);
    return json(res, 200, { followingAuthorIds });
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(config.port, async () => {
  await ensureDb();
  console.log(`lillasy backend listening on http://localhost:${config.port}`);
  startSephoraScheduler({ logger: console });
  startProductPipelineScheduler({ logger: console });
});
