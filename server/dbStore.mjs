import { PrismaClient } from '@prisma/client';
import { hashPassword } from './security.mjs';

export const prisma = new PrismaClient();

export function nowIso() {
  return new Date().toISOString();
}

export function detectDatabaseProvider() {
  const url = String(process.env.DATABASE_URL ?? '');
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  return 'sqlite';
}

const DB_PROVIDER = detectDatabaseProvider();

export function seedData() {
  return {
    users: [
      {
        id: 'sarah-kim',
        name: 'Sarah Kim',
        email: 'sarah@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Dry - Sensitive',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
        emailVerified: false,
        createdAt: nowIso()
      },
      {
        id: 'emma-chen',
        name: 'Emma Chen',
        email: 'emma@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Combination - Acne-Prone',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
        emailVerified: false,
        createdAt: nowIso()
      },
      {
        id: 'jessica-park',
        name: 'Jessica Park',
        email: 'jessica@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Oily - Large Pores',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
        emailVerified: false,
        createdAt: nowIso()
      },
      {
        id: 'mia-rodriguez',
        name: 'Mia Rodriguez',
        email: 'mia@lillasy.com',
        passwordHash: hashPassword('demo1234'),
        skinType: 'Sensitive - Rosacea',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
        emailVerified: false,
        createdAt: nowIso()
      }
    ],
    posts: [
      {
        id: 1,
        authorId: 'sarah-kim',
        title: 'My 3-month glow-up journey with hydrating essences',
        content:
          'After struggling with dehydrated skin for years, I finally found the perfect routine. The key was layering multiple hydrating products and being consistent.',
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
    skinTests: [],
    passwordResetTokens: [],
    emailVerificationTokens: [],
    nextPostId: 3,
    nextCommentId: 1
  };
}

export function normalizeDb(db) {
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.posts)) db.posts = [];
  if (!Array.isArray(db.savedProducts)) db.savedProducts = [];
  if (!Array.isArray(db.recentProducts)) db.recentProducts = [];
  if (!Array.isArray(db.follows)) db.follows = [];
  if (!Array.isArray(db.likes)) db.likes = [];
  if (!Array.isArray(db.comments)) db.comments = [];
  if (!Array.isArray(db.skinTests)) db.skinTests = [];
  if (!Array.isArray(db.passwordResetTokens)) db.passwordResetTokens = [];
  if (!Array.isArray(db.emailVerificationTokens)) db.emailVerificationTokens = [];
  if (!Number.isFinite(db.nextPostId)) {
    db.nextPostId = Math.max(0, ...db.posts.map((post) => Number(post.id) || 0)) + 1;
  }
  if (!Number.isFinite(db.nextCommentId)) {
    db.nextCommentId = Math.max(0, ...db.comments.map((comment) => Number(comment.id) || 0)) + 1;
  }
  for (const user of db.users) {
    if (typeof user.emailVerified !== 'boolean') {
      user.emailVerified = Boolean(user.googleSub);
    }
  }
  return db;
}

export async function ensureDb() {
  await ensureSqlSchema();
  const count = await prisma.user.count();
  if (count > 0) return;
  await writeDb(seedData());
}

export async function readDb() {
  await ensureSqlSchema();
  const [
    users,
    posts,
    comments,
    likes,
    follows,
    savedProducts,
    recentProducts,
    skinTests,
    passwordResetTokens,
    emailVerificationTokens,
    counters
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.post.findMany(),
    prisma.comment.findMany(),
    prisma.like.findMany(),
    prisma.follow.findMany(),
    prisma.savedProduct.findMany(),
    prisma.recentProduct.findMany(),
    prisma.skinTest.findMany(),
    prisma.passwordResetToken.findMany(),
    prisma.emailVerificationToken.findMany(),
    prisma.counter.findMany()
  ]);

  const counterMap = new Map(counters.map((counter) => [counter.key, counter.value]));
  return normalizeDb({
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString()
    })),
    posts: posts.map((post) => ({
      id: post.id,
      authorId: post.authorId,
      title: post.title,
      content: post.content,
      images: parseJson(post.imagesJson, []),
      tags: parseJson(post.tagsJson, []),
      sponsored: post.sponsored,
      productAttachments: parseJson(post.productAttachmentsJson, []),
      createdAt: post.createdAt.toISOString()
    })),
    comments: comments.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt.toISOString()
    })),
    likes,
    follows,
    savedProducts: savedProducts.map((row) => ({
      userId: row.userId,
      productIds: parseJson(row.productIdsJson, [])
    })),
    recentProducts: recentProducts.map((row) => ({
      userId: row.userId,
      productIds: parseJson(row.productIdsJson, [])
    })),
    skinTests: skinTests.map((row) => ({
      userId: row.userId,
      answers: parseJson(row.answersJson, null),
      updatedAt: row.updatedAt.toISOString()
    })),
    passwordResetTokens: passwordResetTokens.map((token) => ({
      ...token,
      exp: Number(token.exp)
    })),
    emailVerificationTokens: emailVerificationTokens.map((token) => ({
      ...token,
      exp: Number(token.exp)
    })),
    nextPostId: counterMap.get('nextPostId'),
    nextCommentId: counterMap.get('nextCommentId')
  });
}

export async function writeDb(db) {
  await ensureSqlSchema();
  const normalized = normalizeDb(db);
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.skinTest.deleteMany();
    await tx.recentProduct.deleteMany();
    await tx.savedProduct.deleteMany();
    await tx.follow.deleteMany();
    await tx.like.deleteMany();
    await tx.comment.deleteMany();
    await tx.post.deleteMany();
    await tx.user.deleteMany();
    await tx.counter.deleteMany();

    if (normalized.users.length) {
      await tx.user.createMany({
        data: normalized.users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          passwordHash: user.passwordHash ?? '',
          skinType: user.skinType ?? 'Not set',
          avatar: user.avatar ?? '',
          emailVerified: Boolean(user.emailVerified || user.googleSub),
          googleSub: user.googleSub ?? null,
          createdAt: toDate(user.createdAt)
        }))
      });
    }

    if (normalized.posts.length) {
      await tx.post.createMany({
        data: normalized.posts.map((post) => ({
          id: Number(post.id),
          authorId: post.authorId,
          title: post.title,
          content: post.content,
          imagesJson: stringifyJson(post.images ?? []),
          tagsJson: stringifyJson(post.tags ?? []),
          sponsored: Boolean(post.sponsored),
          productAttachmentsJson: stringifyJson(post.productAttachments ?? []),
          createdAt: toDate(post.createdAt)
        }))
      });
    }

    if (normalized.comments.length) {
      await tx.comment.createMany({
        data: normalized.comments.map((comment) => ({
          id: Number(comment.id),
          postId: Number(comment.postId),
          userId: comment.userId,
          content: comment.content,
          createdAt: toDate(comment.createdAt)
        }))
      });
    }

    if (normalized.likes.length) {
      await tx.like.createMany({
        data: normalized.likes.map((like) => ({
          postId: Number(like.postId),
          userId: like.userId
        }))
      });
    }

    if (normalized.follows.length) {
      await tx.follow.createMany({
        data: normalized.follows.map((follow) => ({
          followerId: follow.followerId,
          followingId: follow.followingId
        }))
      });
    }

    if (normalized.savedProducts.length) {
      await tx.savedProduct.createMany({
        data: normalized.savedProducts.map((row) => ({
          userId: row.userId,
          productIdsJson: stringifyJson(row.productIds ?? [])
        }))
      });
    }

    if (normalized.recentProducts.length) {
      await tx.recentProduct.createMany({
        data: normalized.recentProducts.map((row) => ({
          userId: row.userId,
          productIdsJson: stringifyJson(row.productIds ?? [])
        }))
      });
    }

    if (normalized.skinTests.length) {
      await tx.skinTest.createMany({
        data: normalized.skinTests.map((row) => ({
          userId: row.userId,
          answersJson: stringifyJson(row.answers ?? null),
          updatedAt: toDate(row.updatedAt)
        }))
      });
    }

    if (normalized.passwordResetTokens.length) {
      await tx.passwordResetToken.createMany({
        data: normalized.passwordResetTokens.map((token) => ({
          token: token.token,
          userId: token.userId,
          exp: BigInt(token.exp),
          usedAt: token.usedAt ?? null,
          createdAt: token.createdAt ?? nowIso()
        }))
      });
    }

    if (normalized.emailVerificationTokens.length) {
      await tx.emailVerificationToken.createMany({
        data: normalized.emailVerificationTokens.map((token) => ({
          token: token.token,
          userId: token.userId,
          exp: BigInt(token.exp),
          usedAt: token.usedAt ?? null,
          createdAt: token.createdAt ?? nowIso()
        }))
      });
    }

    await tx.counter.createMany({
      data: [
        { key: 'nextPostId', value: normalized.nextPostId },
        { key: 'nextCommentId', value: normalized.nextCommentId }
      ]
    });
  });
}

function importedProductColumns(product) {
  return {
    source: product.source,
    sourceItemId: product.sourceItemId,
    name: product.name ?? null,
    brand: product.brand ?? null,
    priceAmount: product.priceAmount ?? null,
    priceCurrency: product.priceCurrency ?? null,
    priceMinAmount: product.priceMinAmount ?? null,
    priceMaxAmount: product.priceMaxAmount ?? null,
    autoReplenishPriceAmount: product.autoReplenishPriceAmount ?? null,
    ratingValue: product.ratingValue ?? null,
    reviewCount: product.reviewCount ?? null,
    questionCount: product.questionCount ?? null,
    lovesCount: product.lovesCount ?? null,
    recommendedPercent: product.recommendedPercent ?? null,
    prosMentionedJson: stringifyJson(product.prosMentioned ?? []),
    consMentionedJson: stringifyJson(product.consMentioned ?? []),
    size: product.size ?? null,
    imageLabelsJson: stringifyJson(product.imageLabels ?? []),
    imageUrlsJson: stringifyJson(product.imageUrls ?? []),
    highlightsJson: stringifyJson(product.highlights ?? []),
    exclusiveLabel: product.exclusiveLabel ?? null,
    whatItIs: product.whatItIs ?? null,
    skinTypesJson: stringifyJson(product.skinTypes ?? []),
    skincareConcernsJson: stringifyJson(product.skincareConcerns ?? []),
    formulation: product.formulation ?? null,
    highlightedJson: stringifyJson(product.highlightedIngredients ?? []),
    ingredientCalloutsJson: stringifyJson(product.ingredientCallouts ?? []),
    whatElse: product.whatElse ?? null,
    clinicalResultsJson: stringifyJson(product.clinicalResults ?? []),
    cleanAtSephora: product.cleanAtSephora ?? null,
    ingredientsText: product.ingredientsText ?? null,
    inciIngredientsJson: stringifyJson(product.inciIngredients ?? []),
    sourceUrl: product.sourceUrl ?? null,
    rawText: product.rawText ?? '',
    crawledAt: product.crawledAt ? toDate(product.crawledAt) : null
  };
}

export async function upsertImportedProduct(product) {
  await ensureSqlSchema();
  if (!product?.sourceItemId) {
    throw new Error('upsertImportedProduct requires sourceItemId');
  }
  const data = importedProductColumns(product);
  const row = await prisma.importedProduct.upsert({
    where: { sourceItemId: product.sourceItemId },
    update: data,
    create: data
  });
  return toImportedProductDto(row);
}

export async function listImportedProducts(limit = 50) {
  await ensureSqlSchema();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = await prisma.importedProduct.findMany({
    orderBy: { updatedAt: 'desc' },
    take: safeLimit
  });
  return rows.map(toImportedProductDto);
}

function parseJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function toDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function getImportedProductBySourceItemId(sourceItemId) {
  const row = await prisma.importedProduct.findUnique({ where: { sourceItemId } });
  return row ? toImportedProductDto(row) : null;
}

export async function listSephoraTargets({ enabledOnly = false } = {}) {
  await ensureSqlSchema();
  const rows = await prisma.sephoraTarget.findMany({
    where: enabledOnly ? { enabled: true } : undefined,
    orderBy: { createdAt: 'asc' }
  });
  return rows.map(toSephoraTargetDto);
}

export async function upsertSephoraTarget({ sourceItemId, sourceUrl = null, label = null, enabled = true }) {
  await ensureSqlSchema();
  if (!sourceItemId) throw new Error('sourceItemId is required');
  const existing = await prisma.sephoraTarget.findUnique({ where: { sourceItemId } });
  const row = await prisma.sephoraTarget.upsert({
    where: { sourceItemId },
    update: {
      sourceUrl: sourceUrl ?? existing?.sourceUrl ?? null,
      label: label ?? existing?.label ?? null,
      enabled: Boolean(enabled)
    },
    create: {
      sourceItemId,
      sourceUrl: sourceUrl ?? null,
      label: label ?? null,
      enabled: Boolean(enabled)
    }
  });
  return toSephoraTargetDto(row);
}

export async function deleteSephoraTarget(sourceItemId) {
  await ensureSqlSchema();
  await prisma.sephoraTarget.delete({ where: { sourceItemId } }).catch(() => null);
  return { ok: true };
}

export async function recordTargetCrawl(sourceItemId, { status, errorMessage = null }) {
  await ensureSqlSchema();
  await prisma.sephoraTarget.update({
    where: { sourceItemId },
    data: {
      lastCrawledAt: new Date(),
      lastStatus: status,
      lastError: errorMessage ? String(errorMessage).slice(0, 1000) : null
    }
  }).catch(() => null);
}

function toSephoraTargetDto(row) {
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    sourceUrl: row.sourceUrl,
    label: row.label,
    enabled: Boolean(row.enabled),
    lastCrawledAt: toIsoString(row.lastCrawledAt),
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

export async function startCrawlerRun({ source, trigger }) {
  await ensureSqlSchema();
  const row = await prisma.crawlerRun.create({
    data: {
      source,
      trigger,
      status: 'running',
      processed: 0,
      succeeded: 0,
      failed: 0
    }
  });
  return toCrawlerRunDto(row);
}

export async function finishCrawlerRun(runId, { status, processed, succeeded, failed, errorMessage = null }) {
  await ensureSqlSchema();
  await prisma.crawlerRun.update({
    where: { id: Number(runId) },
    data: {
      completedAt: new Date(),
      status,
      processed: Number(processed) || 0,
      succeeded: Number(succeeded) || 0,
      failed: Number(failed) || 0,
      errorMessage: errorMessage ? String(errorMessage).slice(0, 1000) : null
    }
  });
}

export async function listCrawlerRuns({ source = 'sephora', limit = 20 } = {}) {
  await ensureSqlSchema();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const rows = await prisma.crawlerRun.findMany({
    where: { source },
    orderBy: { id: 'desc' },
    take: safeLimit
  });
  return rows.map(toCrawlerRunDto);
}

export async function getLastSuccessfulCrawlerRun(source = 'sephora') {
  await ensureSqlSchema();
  const row = await prisma.crawlerRun.findFirst({
    where: { source, status: { in: ['completed', 'partial'] } },
    orderBy: { id: 'desc' }
  });
  return row ? toCrawlerRunDto(row) : null;
}

function toCrawlerRunDto(row) {
  return {
    id: row.id,
    source: row.source,
    trigger: row.trigger,
    status: row.status,
    processed: row.processed,
    succeeded: row.succeeded,
    failed: row.failed,
    errorMessage: row.errorMessage,
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoString(row.completedAt)
  };
}

function toImportedProductDto(row) {
  return {
    id: row.id,
    source: row.source,
    sourceItemId: row.sourceItemId,
    name: row.name,
    brand: row.brand,
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency,
    priceMinAmount: row.priceMinAmount,
    priceMaxAmount: row.priceMaxAmount,
    autoReplenishPriceAmount: row.autoReplenishPriceAmount,
    ratingValue: row.ratingValue,
    reviewCount: row.reviewCount,
    questionCount: row.questionCount,
    lovesCount: row.lovesCount,
    recommendedPercent: row.recommendedPercent,
    prosMentioned: parseJson(row.prosMentionedJson, []),
    consMentioned: parseJson(row.consMentionedJson, []),
    size: row.size,
    imageLabels: parseJson(row.imageLabelsJson, []),
    imageUrls: parseJson(row.imageUrlsJson, []),
    highlights: parseJson(row.highlightsJson, []),
    exclusiveLabel: row.exclusiveLabel,
    whatItIs: row.whatItIs,
    skinTypes: parseJson(row.skinTypesJson, []),
    skincareConcerns: parseJson(row.skincareConcernsJson, []),
    formulation: row.formulation,
    highlightedIngredients: parseJson(row.highlightedJson, []),
    ingredientCallouts: parseJson(row.ingredientCalloutsJson, []),
    whatElse: row.whatElse,
    clinicalResults: parseJson(row.clinicalResultsJson, []),
    cleanAtSephora: row.cleanAtSephora,
    ingredientsText: row.ingredientsText,
    inciIngredients: parseJson(row.inciIngredientsJson, []),
    sourceUrl: row.sourceUrl,
    rawText: row.rawText,
    crawledAt: toIsoString(row.crawledAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

let ensureSqlSchemaPromise = null;

async function ensureSqlSchema() {
  if (DB_PROVIDER !== 'sqlite') return;
  if (!ensureSqlSchemaPromise) {
    ensureSqlSchemaPromise = ensureSqlSchemaSqlite().catch((error) => {
      ensureSqlSchemaPromise = null;
      throw error;
    });
  }
  return ensureSqlSchemaPromise;
}

async function ensureSqlSchemaSqlite() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      "skinType" TEXT NOT NULL,
      "avatar" TEXT NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      "googleSub" TEXT UNIQUE,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Post" (
      "id" INTEGER NOT NULL PRIMARY KEY,
      "authorId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "imagesJson" TEXT NOT NULL DEFAULT '[]',
      "tagsJson" TEXT NOT NULL DEFAULT '[]',
      "sponsored" BOOLEAN NOT NULL DEFAULT false,
      "productAttachmentsJson" TEXT NOT NULL DEFAULT '[]',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Comment" (
      "id" INTEGER NOT NULL PRIMARY KEY,
      "postId" INTEGER NOT NULL,
      "userId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Like" (
      "postId" INTEGER NOT NULL,
      "userId" TEXT NOT NULL,
      PRIMARY KEY ("postId", "userId")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Follow" (
      "followerId" TEXT NOT NULL,
      "followingId" TEXT NOT NULL,
      PRIMARY KEY ("followerId", "followingId")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SavedProduct" (
      "userId" TEXT NOT NULL PRIMARY KEY,
      "productIdsJson" TEXT NOT NULL DEFAULT '[]'
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RecentProduct" (
      "userId" TEXT NOT NULL PRIMARY KEY,
      "productIdsJson" TEXT NOT NULL DEFAULT '[]'
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SkinTest" (
      "userId" TEXT NOT NULL PRIMARY KEY,
      "answersJson" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
      "token" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "exp" BIGINT NOT NULL,
      "usedAt" TEXT,
      "createdAt" TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
      "token" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "exp" BIGINT NOT NULL,
      "usedAt" TEXT,
      "createdAt" TEXT NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Counter" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" INTEGER NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ImportedProduct" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "source" TEXT NOT NULL,
      "sourceItemId" TEXT NOT NULL UNIQUE,
      "name" TEXT,
      "brand" TEXT,
      "priceAmount" REAL,
      "priceCurrency" TEXT,
      "priceMinAmount" REAL,
      "priceMaxAmount" REAL,
      "autoReplenishPriceAmount" REAL,
      "ratingValue" REAL,
      "reviewCount" INTEGER,
      "questionCount" INTEGER,
      "lovesCount" INTEGER,
      "recommendedPercent" INTEGER,
      "prosMentionedJson" TEXT NOT NULL DEFAULT '[]',
      "consMentionedJson" TEXT NOT NULL DEFAULT '[]',
      "size" TEXT,
      "imageLabelsJson" TEXT NOT NULL DEFAULT '[]',
      "imageUrlsJson" TEXT NOT NULL DEFAULT '[]',
      "highlightsJson" TEXT NOT NULL DEFAULT '[]',
      "exclusiveLabel" TEXT,
      "whatItIs" TEXT,
      "skinTypesJson" TEXT NOT NULL DEFAULT '[]',
      "skincareConcernsJson" TEXT NOT NULL DEFAULT '[]',
      "formulation" TEXT,
      "highlightedJson" TEXT NOT NULL DEFAULT '[]',
      "ingredientCalloutsJson" TEXT NOT NULL DEFAULT '[]',
      "whatElse" TEXT,
      "clinicalResultsJson" TEXT NOT NULL DEFAULT '[]',
      "cleanAtSephora" TEXT,
      "ingredientsText" TEXT,
      "inciIngredientsJson" TEXT NOT NULL DEFAULT '[]',
      "sourceUrl" TEXT,
      "rawText" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureColumn('ImportedProduct', 'priceAmount', 'REAL');
  await ensureColumn('ImportedProduct', 'priceCurrency', 'TEXT');
  await ensureColumn('ImportedProduct', 'priceMinAmount', 'REAL');
  await ensureColumn('ImportedProduct', 'priceMaxAmount', 'REAL');
  await ensureColumn('ImportedProduct', 'autoReplenishPriceAmount', 'REAL');
  await ensureColumn('ImportedProduct', 'ratingValue', 'REAL');
  await ensureColumn('ImportedProduct', 'reviewCount', 'INTEGER');
  await ensureColumn('ImportedProduct', 'questionCount', 'INTEGER');
  await ensureColumn('ImportedProduct', 'lovesCount', 'INTEGER');
  await ensureColumn('ImportedProduct', 'recommendedPercent', 'INTEGER');
  await ensureColumn('ImportedProduct', 'prosMentionedJson', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('ImportedProduct', 'consMentionedJson', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('ImportedProduct', 'size', 'TEXT');
  await ensureColumn('ImportedProduct', 'imageLabelsJson', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('ImportedProduct', 'imageUrlsJson', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('ImportedProduct', 'highlightsJson', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('ImportedProduct', 'crawledAt', 'DATETIME');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SephoraTarget" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "sourceItemId" TEXT NOT NULL UNIQUE,
      "sourceUrl" TEXT,
      "label" TEXT,
      "enabled" BOOLEAN NOT NULL DEFAULT 1,
      "lastCrawledAt" DATETIME,
      "lastStatus" TEXT,
      "lastError" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CrawlerRun" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "source" TEXT NOT NULL,
      "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" DATETIME,
      "status" TEXT NOT NULL,
      "trigger" TEXT NOT NULL,
      "processed" INTEGER NOT NULL DEFAULT 0,
      "succeeded" INTEGER NOT NULL DEFAULT 0,
      "failed" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT
    )
  `);
}

async function ensureColumn(table, column, definition) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  if (columns.some((entry) => entry.name === column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
}
