import { z } from 'zod';
import { isValidPassword } from './security.mjs';

const trimmedString = (max) => z.string().trim().max(max);
const optionalTrimmedString = (max) =>
  z.preprocess((value) => (value == null ? '' : value), trimmedString(max));
const stringArray = (maxItems = 40, maxLen = 80) =>
  z.array(trimmedString(maxLen)).max(maxItems).default([]).transform((items) => items.filter(Boolean));

export const registerSchema = z.object({
  name: trimmedString(60).min(1),
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().refine(isValidPassword, {
    message: 'Password must be at least 8 characters and include one letter and one number.'
  }),
  skinType: optionalTrimmedString(80).transform((value) => value || 'Not set')
});

export const loginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1)
});

export const updateMeSchema = z.object({
  name: optionalTrimmedString(60),
  skinType: optionalTrimmedString(80),
  avatar: optionalTrimmedString(3_000_000)
});

export const savedProductsSchema = z.object({
  productIds: z
    .array(z.coerce.number())
    .max(200)
    .default([])
    .transform((ids) => [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))
    ])
});

export const recentProductSchema = z.object({
  productId: z.coerce.number().int().positive()
});

export const skinTestAnswersSchema = z.object({
  skinType: optionalTrimmedString(60),
  concerns: stringArray(),
  sensitivity: optionalTrimmedString(60),
  routine: optionalTrimmedString(60),
  budget: optionalTrimmedString(40),
  preferredIngredients: stringArray(),
  avoidIngredients: stringArray(),
  preferredBrands: stringArray(40, 60)
});

export const passwordResetRequestSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase())
});

export const passwordResetSchema = z.object({
  token: trimmedString(200).min(1),
  password: z.string().refine(isValidPassword, {
    message: 'Password must be at least 8 characters and include one letter and one number.'
  })
});

export const verifyEmailSchema = z.object({
  token: trimmedString(200).min(1)
});

const imageUrlSchema = z
  .string()
  .trim()
  .max(4_000_000)
  .refine((value) => value.startsWith('data:image/') || /^https?:\/\//.test(value), {
    message: 'Image must be a data image URL or http(s) URL.'
  });

export const productAttachmentSchema = z.object({
  productId: z.coerce.number().int().positive(),
  name: trimmedString(160),
  brand: trimmedString(120),
  image: z.string().trim().max(2048).default(''),
  fitScore: z.coerce.number().finite(),
  reasons: stringArray(8, 240),
  warning: z.string().trim().max(240).nullable().default(null)
});

export const createPostSchema = z.object({
  title: optionalTrimmedString(120).transform((value) => value || 'My skincare note'),
  content: optionalTrimmedString(4000),
  productAttachments: z.array(productAttachmentSchema).max(3).default([]),
  images: z.array(imageUrlSchema).max(4).default([])
});

export const commentSchema = z.object({
  content: trimmedString(1000).min(1)
});

export const restoreBackupSchema = z.object({
  backup: z.object({
    users: z.array(z.unknown()),
    posts: z.array(z.unknown())
  }).passthrough()
});

export const sephoraTextImportSchema = z.object({
  rawText: trimmedString(80_000).min(100),
  sourceUrl: optionalTrimmedString(2048),
  sourceItemId: optionalTrimmedString(80),
  name: optionalTrimmedString(180),
  brand: optionalTrimmedString(120)
});

const sephoraItemIdSchema = trimmedString(80)
  .refine((value) => /^[A-Za-z0-9_-]+$/.test(value), {
    message: 'Sephora item id must be alphanumeric (letters, numbers, dash, underscore).'
  });

function deriveSephoraItemIdFromUrl(url) {
  if (!url) return null;
  const match = String(url).match(/\/P(\d+)(?:[?#/]|$)/i);
  return match ? match[1] : null;
}

export const sephoraTargetSchema = z
  .object({
    sourceItemId: optionalTrimmedString(80),
    sourceUrl: optionalTrimmedString(2048),
    label: optionalTrimmedString(160),
    enabled: z.coerce.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    const trimmedUrl = (value.sourceUrl ?? '').trim();
    if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
      ctx.addIssue({ code: 'custom', message: 'sourceUrl must be an http(s) URL.', path: ['sourceUrl'] });
    }
    let id = (value.sourceItemId ?? '').trim();
    if (!id && trimmedUrl) {
      id = deriveSephoraItemIdFromUrl(trimmedUrl) ?? '';
    }
    if (!id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either a Sephora item id or a Sephora product URL containing /P<id>.',
        path: ['sourceItemId']
      });
      return;
    }
    const parsed = sephoraItemIdSchema.safeParse(id);
    if (!parsed.success) {
      ctx.addIssue({
        code: 'custom',
        message: parsed.error.issues[0]?.message ?? 'Invalid Sephora item id.',
        path: ['sourceItemId']
      });
      return;
    }
    value.sourceItemId = parsed.data;
    value.sourceUrl = trimmedUrl || null;
    value.label = (value.label ?? '').trim() || null;
  });

export const sephoraCrawlOptionsSchema = z.object({
  requestDelayMs: z.coerce.number().int().min(0).max(60_000).optional(),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000).optional(),
  maxRetries: z.coerce.number().int().min(1).max(10).optional()
}).default({});

const pipelineRetailerEnum = z.enum(['sephora', 'ulta', 'brand_official']);
const unknownObjectSchema = z.object({}).passthrough();

export const pipelineRunSchema = z.object({
  amazon: unknownObjectSchema,
  candidates: z
    .array(
      z.object({
        retailer: pipelineRetailerEnum,
        payload: unknownObjectSchema
      })
    )
    .max(200)
    .default([]),
  autoDiscoverCandidates: z.coerce.boolean().default(true),
  candidateLimit: z.coerce.number().int().min(1).max(300).default(60)
});

export const pipelineReviewQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const pipelineReprocessStatusEnum = z.enum(['comparison_only', 'needs_review', 'draft', 'active', 'rejected']);

export const pipelineReprocessSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  statuses: z.array(pipelineReprocessStatusEnum).max(10).default(['comparison_only']),
  autoDiscoverCandidates: z.coerce.boolean().default(true),
  candidateLimit: z.coerce.number().int().min(1).max(300).default(60)
});

// Lightweight Amazon item used by the batch ingestion endpoint. The caller
// supplies normalized fields; the backend reshapes them into the raw payload
// shape that `amazonItemToProductSource` expects.
export const amazonIngestItemSchema = z
  .object({
    asin: z.string().trim().min(3).max(32),
    title: z.string().trim().min(1).max(500),
    brand: z.string().trim().min(1).max(200).optional(),
    url: z.string().trim().url().optional(),
    priceAmount: z.coerce.number().positive().max(100_000).optional(),
    priceCurrency: z.string().trim().min(3).max(3).optional(),
    imageUrl: z.string().trim().url().optional(),
    category: z.string().trim().max(200).optional(),
    size: z.string().trim().max(200).optional(),
    ingredientsText: z.string().trim().max(20_000).optional()
  })
  .strict();

export const amazonBatchIngestSchema = z.object({
  items: z.array(amazonIngestItemSchema).min(1).max(100),
  autoDiscoverCandidates: z.coerce.boolean().default(true),
  candidateLimit: z.coerce.number().int().min(1).max(300).default(60)
});

export const matchCandidateApproveSchema = z.object({
  candidateLimit: z.coerce.number().int().min(1).max(300).default(60)
});

// Manual trigger for the daily Amazon refresh fallback. All fields are
// optional; defaults match the scheduler so the admin "Run now" button does
// the same work as one tick of the background loop.
export const amazonRefreshSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  delayMs: z.coerce.number().int().min(0).max(60000).default(4000),
  onlyLinked: z.coerce.boolean().default(true)
});

// Used by the PA API admin endpoint - the caller only needs to send ASINs;
// the backend resolves brand/title/image/price/size via PA API and feeds
// them into the existing batch ingestion logic.
export const amazonAsinFetchSchema = z.object({
  asins: z
    .array(z.string().trim().min(3).max(32))
    .min(1)
    .max(10),
  autoDiscoverCandidates: z.coerce.boolean().default(true),
  candidateLimit: z.coerce.number().int().min(1).max(300).default(60),
  marketplace: z.string().trim().min(3).max(40).optional()
});

export function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  const message = result.error.issues.map((issue) => issue.message).join('; ');
  throw new Error(message || 'Invalid payload');
}
