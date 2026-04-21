import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnvFromFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFromFile();

const DB_PATH = join(__dirname, 'db.json');
const PORT = Number(process.env.PORT ?? 8787);
const TOKEN_SECRET = process.env.TOKEN_SECRET ?? 'lillasy-dev-secret';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ?? `http://localhost:${PORT}/api/auth/google/callback`;

function nowIso() {
  return new Date().toISOString();
}

function seedData() {
  return {
    users: [
      {
        id: 'sarah-kim',
        name: 'Sarah Kim',
        email: 'sarah@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Dry · Sensitive',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
        createdAt: nowIso()
      },
      {
        id: 'emma-chen',
        name: 'Emma Chen',
        email: 'emma@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Combination · Acne-Prone',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
        createdAt: nowIso()
      },
      {
        id: 'jessica-park',
        name: 'Jessica Park',
        email: 'jessica@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Oily · Large Pores',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
        createdAt: nowIso()
      },
      {
        id: 'mia-rodriguez',
        name: 'Mia Rodriguez',
        email: 'mia@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Sensitive · Rosacea',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
        createdAt: nowIso()
      }
    ],
    posts: [
      {
        id: 1,
        authorId: 'sarah-kim',
        title: 'My 3-month glow-up journey with hydrating essences',
        content:
          "After struggling with dehydrated skin for years, I finally found the perfect routine. The key was layering multiple hydrating products and being consistent.",
        images: [
          'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop',
          'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400&h=400&fit=crop'
        ],
        tags: ['Hydration', 'Before & After', 'Dry Skin'],
        sponsored: false,
        productAttachments: [],
        createdAt: nowIso()
      },
      {
        id: 2,
        authorId: 'emma-chen',
        title: 'Vitamin C serums: Which one is actually worth it?',
        content:
          "I've tested 12 different vitamin C serums over the past year. Here's my honest breakdown of which ones delivered results.",
        images: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop'],
        tags: ['Vitamin C', 'Product Review', 'Brightening'],
        sponsored: false,
        productAttachments: [],
        createdAt: nowIso()
      }
    ],
    follows: [],
    likes: [],
    comments: [],
    savedProducts: [],
    recentProducts: [],
    nextPostId: 3,
    nextCommentId: 1
  };
}

function normalizeDb(db) {
  if (!Array.isArray(db.savedProducts)) db.savedProducts = [];
  if (!Array.isArray(db.recentProducts)) db.recentProducts = [];
  if (!Array.isArray(db.follows)) db.follows = [];
  if (!Array.isArray(db.likes)) db.likes = [];
  if (!Array.isArray(db.comments)) db.comments = [];
  return db;
}

function ensureDb() {
  if (!existsSync(__dirname)) mkdirSync(__dirname, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify(seedData(), null, 2), 'utf8');
}

function readDb() {
  ensureDb();
  return normalizeDb(JSON.parse(readFileSync(DB_PATH, 'utf8')));
}

function writeDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const attempt = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  const left = Buffer.from(hash, 'hex');
  const right = Buffer.from(attempt, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function signToken(userId) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `${userId}.${exp}`;
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, expStr, signature] = raw.split('.');
    if (!userId || !expStr || !signature) return null;
    const payload = `${userId}.${expStr}`;
    const expected = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (expected !== signature) return null;
    if (Number(expStr) < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}

function makeOAuthState(page = 'dashboard') {
  const exp = Date.now() + 1000 * 60 * 10;
  const nonce = randomBytes(8).toString('hex');
  const payload = JSON.stringify({ page, exp, nonce });
  const payloadEncoded = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = createHmac('sha256', TOKEN_SECRET).update(payloadEncoded).digest('hex');
  return `${payloadEncoded}.${signature}`;
}

function readOAuthState(state) {
  if (!state || !state.includes('.')) return null;
  const [payloadEncoded, signature] = state.split('.');
  if (!payloadEncoded || !signature) return null;
  const expected = createHmac('sha256', TOKEN_SECRET).update(payloadEncoded).digest('hex');
  if (expected !== signature) return null;
  try {
    const raw = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
    const payload = JSON.parse(raw);
    if (Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthUser(req, db) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = verifyToken(token);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 12_000_000) reject(new Error('Body too large (max 12MB)'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function toPostDto(post, db, authUserId) {
  const author = db.users.find((u) => u.id === post.authorId);
  const likes = db.likes.filter((l) => l.postId === post.id);
  const comments = db.comments
    .filter((c) => c.postId === post.id)
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
    isLiked: authUserId ? likes.some((l) => l.userId === authUserId) : false,
    isSaved: false,
    sponsored: Boolean(post.sponsored),
    productAttachments: post.productAttachments ?? [],
    commentItems: comments.slice(0, 5).map((comment) => {
      const user = db.users.find((u) => u.id === comment.userId);
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

function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    skinType: user.skinType,
    avatar: user.avatar
  };
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
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (url.pathname === '/api/health') return json(res, 200, { ok: true });

  const db = readDb();

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const body = await parseBody(req);
      const name = String(body.name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const skinType = String(body.skinType ?? 'Not set');
      if (!name || !email || password.length < 6) {
        return json(res, 400, { error: 'Invalid registration payload' });
      }
      if (db.users.some((u) => u.email.toLowerCase() === email)) {
        return json(res, 409, { error: 'Email already exists' });
      }
      const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      const user = {
        id,
        name,
        email,
        passwordHash: hashPassword(password),
        skinType,
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
        createdAt: nowIso()
      };
      db.users.push(user);
      writeDb(db);
      const token = signToken(user.id);
      return json(res, 201, { token, user: toUserDto(user) });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const body = await parseBody(req);
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const user = db.users.find((u) => u.email.toLowerCase() === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return json(res, 401, { error: 'Invalid credentials' });
      }
      const token = signToken(user.id);
      return json(res, 200, { token, user: toUserDto(user) });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
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
      const body = await parseBody(req);
      const nextName = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
      const nextSkinType = typeof body.skinType === 'string' ? body.skinType.trim().slice(0, 80) : '';
      const nextAvatar = typeof body.avatar === 'string' ? body.avatar.trim() : '';

      if (nextName) authUser.name = nextName;
      if (nextSkinType) authUser.skinType = nextSkinType;
      if (nextAvatar) {
        const isDataUrl = nextAvatar.startsWith('data:image/') && nextAvatar.length < 3_000_000;
        const isHttp = /^https?:\/\//.test(nextAvatar) && nextAvatar.length < 1024;
        if (isDataUrl || isHttp) {
          authUser.avatar = nextAvatar;
        }
      }
      writeDb(db);
      return json(res, 200, { user: toUserDto(authUser) });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/user/saved') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const row = db.savedProducts.find((r) => r.userId === authUser.id);
    return json(res, 200, { productIds: row?.productIds ?? [] });
  }

  if (req.method === 'POST' && url.pathname === '/api/user/saved') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const rawIds = Array.isArray(body.productIds) ? body.productIds : [];
      const productIds = rawIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .slice(0, 200);
      const existing = db.savedProducts.find((r) => r.userId === authUser.id);
      if (existing) {
        existing.productIds = productIds;
      } else {
        db.savedProducts.push({ userId: authUser.id, productIds });
      }
      writeDb(db);
      return json(res, 200, { productIds });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/user/recents') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const row = db.recentProducts.find((r) => r.userId === authUser.id);
    return json(res, 200, { productIds: row?.productIds ?? [] });
  }

  if (req.method === 'POST' && url.pathname === '/api/user/recents') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const productId = Number(body.productId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return json(res, 400, { error: 'Invalid productId' });
      }
      const row = db.recentProducts.find((r) => r.userId === authUser.id);
      const current = row?.productIds ?? [];
      const next = [productId, ...current.filter((id) => id !== productId)].slice(0, 20);
      if (row) {
        row.productIds = next;
      } else {
        db.recentProducts.push({ userId: authUser.id, productIds: next });
      }
      writeDb(db);
      return json(res, 200, { productIds: next });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/google/start') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      const failUrl = new URL(FRONTEND_ORIGIN);
      failUrl.searchParams.set('auth_error', 'Google OAuth is not configured on server.');
      return redirect(res, failUrl.toString());
    }
    const page = sanitizePage(url.searchParams.get('page'));
    const state = makeOAuthState(page);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
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
    const failUrl = new URL(FRONTEND_ORIGIN);

    if (error) {
      failUrl.searchParams.set('auth_error', `Google login failed: ${error}`);
      return redirect(res, failUrl.toString());
    }

    const statePayload = readOAuthState(state ?? '');
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
      if (!googleSub || !email) {
        throw new Error('Google profile is missing required fields.');
      }

      let user =
        db.users.find((u) => u.googleSub === googleSub) ??
        db.users.find((u) => u.email.toLowerCase() === email);

      if (!user) {
        const id = `google-${googleSub.slice(0, 16)}`;
        user = {
          id,
          name,
          email,
          passwordHash: '',
          skinType: 'Not set',
          avatar: picture || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
          googleSub,
          createdAt: nowIso()
        };
        db.users.push(user);
      } else {
        user.googleSub = googleSub;
        user.name = user.name || name;
        user.avatar = user.avatar || picture;
      }

      writeDb(db);
      const token = signToken(user.id);
      const successUrl = new URL(FRONTEND_ORIGIN);
      successUrl.searchParams.set('auth_token', token);
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

  if (req.method === 'POST' && url.pathname === '/api/admin/restore') {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    try {
      const body = await parseBody(req);
      const backup = body?.backup;
      if (!backup || !Array.isArray(backup.users) || !Array.isArray(backup.posts)) {
        return json(res, 400, { error: 'Invalid backup payload' });
      }
      writeDb(backup);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/community/feed') {
    const authUser = getAuthUser(req, db);
    const authUserId = authUser?.id ?? null;
    const followingAuthorIds = authUserId
      ? db.follows.filter((f) => f.followerId === authUserId).map((f) => f.followingId)
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
      const body = await parseBody(req);
      const content = String(body.content ?? '').trim();
      const title = String(body.title ?? '').trim() || 'My skincare note';
      const attachments = Array.isArray(body.productAttachments) ? body.productAttachments.slice(0, 3) : [];
      const rawImages = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
      const images = rawImages
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) =>
          entry.length > 0 &&
          entry.length < 4_000_000 &&
          (entry.startsWith('data:image/') || /^https?:\/\//.test(entry))
        );
      if (!content && attachments.length === 0 && images.length === 0) {
        return json(res, 400, { error: 'Post content is empty' });
      }

      const post = {
        id: db.nextPostId++,
        authorId: authUser.id,
        title,
        content,
        images,
        tags: ['My Post', ...(attachments.length ? ['Product Pick'] : ['Routine'])],
        sponsored: false,
        productAttachments: attachments,
        createdAt: nowIso()
      };
      db.posts.push(post);
      writeDb(db);
      return json(res, 201, { post: toPostDto(post, db, authUser.id) });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'POST' && /^\/api\/community\/posts\/\d+\/like$/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const postId = Number(url.pathname.split('/')[4]);
    const exists = db.likes.find((l) => l.postId === postId && l.userId === authUser.id);
    if (exists) {
      db.likes = db.likes.filter((l) => !(l.postId === postId && l.userId === authUser.id));
    } else {
      db.likes.push({ postId, userId: authUser.id });
    }
    writeDb(db);
    const post = db.posts.find((p) => p.id === postId);
    if (!post) return json(res, 404, { error: 'Post not found' });
    return json(res, 200, { post: toPostDto(post, db, authUser.id) });
  }

  if (req.method === 'POST' && /^\/api\/community\/posts\/\d+\/comments$/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const postId = Number(url.pathname.split('/')[4]);
    const post = db.posts.find((p) => p.id === postId);
    if (!post) return json(res, 404, { error: 'Post not found' });
    try {
      const body = await parseBody(req);
      const content = String(body.content ?? '').trim();
      if (!content) return json(res, 400, { error: 'Comment is empty' });
      db.comments.push({
        id: db.nextCommentId++,
        postId,
        userId: authUser.id,
        content,
        createdAt: nowIso()
      });
      writeDb(db);
      return json(res, 201, { post: toPostDto(post, db, authUser.id) });
    } catch (error) {
      return json(res, 400, { error: String(error.message ?? error) });
    }
  }

  if (req.method === 'POST' && /^\/api\/community\/follow\/.+/.test(url.pathname)) {
    const authUser = getAuthUser(req, db);
    if (!authUser) return json(res, 401, { error: 'Unauthorized' });
    const authorId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    if (!authorId || !db.users.some((u) => u.id === authorId) || authorId === authUser.id) {
      return json(res, 400, { error: 'Invalid author target' });
    }

    const exists = db.follows.find((f) => f.followerId === authUser.id && f.followingId === authorId);
    if (exists) {
      db.follows = db.follows.filter((f) => !(f.followerId === authUser.id && f.followingId === authorId));
    } else {
      db.follows.push({ followerId: authUser.id, followingId: authorId });
    }
    writeDb(db);
    const followingAuthorIds = db.follows
      .filter((f) => f.followerId === authUser.id)
      .map((f) => f.followingId);
    return json(res, 200, { followingAuthorIds });
  }

  return json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  ensureDb();
  console.log(`lillasy backend listening on http://localhost:${PORT}`);
});
