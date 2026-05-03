// Sephora standardized product schema v1.
//
// All raw products coming from the live crawler or the text importer go through
// `standardizeProduct(...)` before persistence. This guarantees a stable shape,
// consistent units, and a quality score for downstream consumers.

export const SEPHORA_SCHEMA_VERSION = 2;

export const REQUIRED_FIELDS = Object.freeze([
  'sourceItemId',
  'name',
  'brand',
  'priceAmount',
  'ratingValue',
  'reviewCount',
  'size'
]);

export const RECOMMENDED_FIELDS = Object.freeze([
  'priceCurrency',
  'lovesCount',
  'highlights',
  'imageUrls',
  'ingredientsText',
  'whatItIs',
  'skinTypes',
  'skincareConcerns'
]);

const HTML_TAG_REGEX = /<[^>]+>/g;
const ENTITY_MAP = {
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' '
};

const SMART_QUOTE_MAP = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"'
};

export function decodeEntities(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/&[a-z#0-9]+;/gi, (match) => ENTITY_MAP[match] ?? match);
}

export function stripHtml(value) {
  if (typeof value !== 'string') return value;
  return value.replace(HTML_TAG_REGEX, ' ');
}

export function normalizeWhitespace(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeQuotes(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[\u2018\u2019\u201C\u201D]/g, (match) => SMART_QUOTE_MAP[match] ?? match);
}

export function cleanText(value) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  }
  const cleaned = normalizeWhitespace(normalizeQuotes(decodeEntities(stripHtml(value))));
  return cleaned || null;
}

export function normalizeBrand(value) {
  return cleanText(value);
}

export function normalizeName(value) {
  return cleanText(value);
}

export function clampPrice(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

export function clampRating(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 5) return null;
  return Math.round(num * 10) / 10;
}

export function clampInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

export function parseSize(rawSize) {
  const text = cleanText(rawSize);
  if (!text) return { raw: null, ml: null, oz: null };
  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*m\s*l/i);
  const ozMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*)?oz/i);
  return {
    raw: text,
    ml: mlMatch ? Number(mlMatch[1]) : null,
    oz: ozMatch ? Number(ozMatch[1]) : null
  };
}

export function normalizeArrayOfStrings(values, { max = 50 } = {}) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const item of values) {
    const cleaned = cleanText(item);
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
    if (result.length >= max) break;
  }
  return result;
}

export function normalizeImageUrls(values, { max = 12 } = {}) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    let value = raw.trim();
    if (!value) continue;
    if (value.startsWith('//')) value = `https:${value}`;
    if (!/^https?:\/\//i.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeNamedItems(items, { max = 12 } = {}) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const name = cleanText(item.name);
    if (!name) continue;
    const description = cleanText(item.description) ?? '';
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, description });
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeMentioned(items, { max = 12 } = {}) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const label = cleanText(item.label);
    if (!label) continue;
    const count = clampInt(item.count, { min: 0 });
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, count: count ?? 0 });
    if (out.length >= max) break;
  }
  return out;
}

export function validateRequired(product) {
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = product?.[field];
    if (value == null) return true;
    if (typeof value === 'string' && !value.trim()) return true;
    return false;
  });
  return { ok: missing.length === 0, missing };
}

const QUALITY_WEIGHTS = {
  sourceItemId: 10,
  name: 12,
  brand: 10,
  priceAmount: 10,
  ratingValue: 8,
  reviewCount: 8,
  size: 6,
  imageUrls: 8,
  highlights: 6,
  whatItIs: 6,
  ingredientsText: 8,
  skinTypes: 4,
  skincareConcerns: 4
};

export function computeQualityScore(product) {
  let total = 0;
  let earned = 0;
  for (const [field, weight] of Object.entries(QUALITY_WEIGHTS)) {
    total += weight;
    const value = product?.[field];
    const filled = Array.isArray(value)
      ? value.length > 0
      : typeof value === 'string'
        ? value.trim().length > 0
        : value != null;
    if (filled) earned += weight;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

export function standardizeProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== 'object') {
    throw new Error('standardizeProduct requires a product object');
  }
  const sourceItemId = cleanText(rawProduct.sourceItemId);
  const name = normalizeName(rawProduct.name);
  const brand = normalizeBrand(rawProduct.brand);
  const sizeInfo = parseSize(rawProduct.size);

  const product = {
    schemaVersion: SEPHORA_SCHEMA_VERSION,
    source: cleanText(rawProduct.source) || 'sephora',
    sourceItemId,
    sourceUrl: cleanText(rawProduct.sourceUrl),
    name,
    brand,
    priceAmount: clampPrice(rawProduct.priceAmount),
    priceCurrency:
      cleanText(rawProduct.priceCurrency) || (rawProduct.priceAmount != null ? 'USD' : null),
    priceMinAmount: clampPrice(rawProduct.priceMinAmount),
    priceMaxAmount: clampPrice(rawProduct.priceMaxAmount),
    autoReplenishPriceAmount: clampPrice(rawProduct.autoReplenishPriceAmount),
    ratingValue: clampRating(rawProduct.ratingValue),
    reviewCount: clampInt(rawProduct.reviewCount),
    questionCount: clampInt(rawProduct.questionCount),
    lovesCount: clampInt(rawProduct.lovesCount),
    recommendedPercent: clampInt(rawProduct.recommendedPercent, { min: 0, max: 100 }),
    size: sizeInfo.raw,
    sizeMl: sizeInfo.ml,
    sizeOz: sizeInfo.oz,
    formulation: cleanText(rawProduct.formulation),
    exclusiveLabel: cleanText(rawProduct.exclusiveLabel),
    whatItIs: cleanText(rawProduct.whatItIs),
    whatElse: cleanText(rawProduct.whatElse),
    cleanAtSephora: cleanText(rawProduct.cleanAtSephora),
    ingredientsText: cleanText(rawProduct.ingredientsText),
    inciIngredients: normalizeArrayOfStrings(rawProduct.inciIngredients, { max: 200 }),
    skinTypes: normalizeArrayOfStrings(rawProduct.skinTypes),
    skincareConcerns: normalizeArrayOfStrings(rawProduct.skincareConcerns),
    highlights: normalizeArrayOfStrings(rawProduct.highlights),
    imageLabels: normalizeArrayOfStrings(rawProduct.imageLabels),
    imageUrls: normalizeImageUrls(rawProduct.imageUrls),
    highlightedIngredients: normalizeNamedItems(rawProduct.highlightedIngredients),
    ingredientCallouts: normalizeArrayOfStrings(rawProduct.ingredientCallouts),
    clinicalResults: normalizeNamedItems(rawProduct.clinicalResults, { max: 30 }),
    prosMentioned: normalizeMentioned(rawProduct.prosMentioned),
    consMentioned: normalizeMentioned(rawProduct.consMentioned),
    rawText: typeof rawProduct.rawText === 'string' ? rawProduct.rawText : '',
    crawledAt: cleanText(rawProduct.crawledAt) || new Date().toISOString()
  };

  const { ok, missing } = validateRequired(product);
  product.qualityScore = computeQualityScore(product);
  product.warnings = ok ? [] : missing.map((field) => `missing:${field}`);
  return product;
}
