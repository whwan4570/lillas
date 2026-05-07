// Product matching utility.
//
// Used by the Amazon -> Sephora/Ulta/Brand enrichment pipeline. The goal is to
// take a raw retailer payload (Amazon ProductSource) and rank candidate
// enrichment payloads (Sephora/Ulta/brand ProductSource) by how likely they
// describe the same canonical product.
//
// Matching is deliberately weighted across multiple signals so a single noisy
// field (e.g. a marketing-heavy Amazon title) cannot dominate the decision.
//
// Default thresholds:
//   confidence >= 0.88            -> auto_match
//   0.65 <= confidence < 0.88     -> needs_review
//   confidence <  0.65            -> rejected (kept only as weak candidate)

export const MATCH_THRESHOLDS = Object.freeze({
  AUTO: 0.88,
  REVIEW: 0.65
});

const DEFAULT_WEIGHTS = Object.freeze({
  brand: 0.3,
  name: 0.4,
  size: 0.15,
  category: 0.1,
  variant: 0.05
});

// Brand aliases. Keys are *normalized* (lowercased, punctuation-stripped).
// Values list normalized aliases that should also match the key.
const BRAND_ALIASES = Object.freeze({
  'kiehls': ['kiehls since 1851', 'kiehl s', 'kiehl'],
  'kiehls since 1851': ['kiehls', 'kiehl s', 'kiehl'],
  'paulas choice': ['paula s choice', 'paula choice'],
  'the ordinary': ['ordinary'],
  'ordinary': ['the ordinary'],
  'supergoop': ['supergoop'],
  'drunk elephant': ['drunkelephant'],
  'glow recipe': ['glowrecipe'],
  'fenty beauty': ['fenty', 'fenty skin'],
  'cerave': ['ce rave'],
  'la roche posay': ['la roche-posay', 'laroche posay', 'larocheposay'],
  'beauty of joseon': ['boj']
});

// Tokens we do not care about when comparing product names. They appear in
// retailer titles as marketing or shopping noise.
const NOISE_TOKENS = new Set([
  'with', 'for', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'by',
  'new', 'limited', 'edition', 'value', 'pack', 'set', 'kit', 'duo',
  'exclusive', 'best', 'seller', 'official', 'brand', 'authentic',
  'travel', 'size', 'gift', 'bundle', 'jumbo', 'mini', 'refill',
  'pa', 'ml', 'oz', 'fl', 'g', 'gram', 'grams'
]);

// Variant clue patterns. When two products disagree on a variant, that's a
// strong signal they're not the same SKU even if the title is otherwise
// similar (e.g. "SPF 40" vs "SPF 50", "Mini" vs full size, etc.).
const VARIANT_PATTERNS = Object.freeze([
  { key: 'spf', regex: /\bspf\s*(\d+\+?)/i },
  { key: 'fragranceFree', regex: /\bfragrance(?:[-\s])?free\b/i },
  { key: 'unscented', regex: /\bunscented\b/i },
  { key: 'mini', regex: /\bmini\b/i },
  { key: 'jumbo', regex: /\bjumbo\b/i },
  { key: 'refill', regex: /\brefill\b/i },
  { key: 'tinted', regex: /\btinted\b/i },
  { key: 'sensitive', regex: /\bsensitive\b/i }
]);

// Category groups - same group means the products are talking about the
// same kind of skincare item, even if individual labels differ.
const CATEGORY_GROUPS = Object.freeze([
  ['cleanser', 'face wash', 'gel cleanser', 'foam cleanser', 'makeup remover', 'micellar'],
  ['serum', 'essence', 'ampoule'],
  ['moisturizer', 'cream', 'lotion', 'gel cream', 'balm', 'water cream'],
  ['sunscreen', 'spf', 'sun screen', 'face sunscreen'],
  ['toner', 'mist'],
  ['mask', 'sheet mask', 'sleeping mask', 'overnight mask'],
  ['exfoliator', 'peel', 'scrub', 'aha', 'bha'],
  ['eye care', 'eye cream', 'eye serum']
]);

const SIZE_REGEX = /(\d+(?:\.\d+)?)\s*(ml|fl\s*oz|oz|g)\b/gi;

// ---------------------------------------------------------------------------
// Brand normalization
// ---------------------------------------------------------------------------

export function normalizeBrand(raw) {
  if (typeof raw !== 'string') return '';
  let value = raw.toLowerCase();
  value = value.replace(/[\u2018\u2019\u201C\u201D\u2032]/g, "'");
  value = value.replace(/&/g, ' and ');
  value = value.replace(/[^a-z0-9'\s]/g, ' ');
  value = value.replace(/'/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

export function brandKey(raw) {
  return normalizeBrand(raw).replace(/\s+/g, '');
}

export function brandSimilarity(a, b) {
  const na = normalizeBrand(a);
  const nb = normalizeBrand(b);
  if (!na || !nb) return 0;

  const ka = na.replace(/\s+/g, '');
  const kb = nb.replace(/\s+/g, '');
  if (ka === kb) return 1;

  const aliasesA = BRAND_ALIASES[na] ?? [];
  const aliasesB = BRAND_ALIASES[nb] ?? [];
  if (aliasesA.some((alias) => alias.replace(/\s+/g, '') === kb)) return 1;
  if (aliasesB.some((alias) => alias.replace(/\s+/g, '') === ka)) return 1;

  if (ka.includes(kb) || kb.includes(ka)) {
    const longer = ka.length >= kb.length ? ka : kb;
    const shorter = ka.length >= kb.length ? kb : ka;
    return Math.max(0.85, shorter.length / longer.length);
  }

  const ratio = stringSimilarity(ka, kb);
  return ratio >= 0.85 ? ratio : 0;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

export function normalizeProductName(raw) {
  if (typeof raw !== 'string') return '';
  let value = raw.toLowerCase();
  value = value.replace(/[\u2018\u2019\u201C\u201D]/g, "'");
  value = value.replace(/\([^)]*\)/g, ' ');
  value = value.replace(/\d+(?:\.\d+)?\s*(?:ml|fl\s*oz|oz|g|grams)\b/gi, ' ');
  value = value.replace(/\b(?:value\s+size|jumbo\s+size|travel\s+size|gift\s+set|new|limited\s+edition|exclusive)\b/gi, ' ');
  value = value.replace(/[^a-z0-9+%/\s]/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

export function tokenizeName(raw) {
  return normalizeProductName(raw)
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !NOISE_TOKENS.has(tok));
}

export function diceCoefficient(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection += 1;
  return (2 * intersection) / (setA.size + setB.size);
}

export function jaccard(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length && !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Size extraction & similarity
// ---------------------------------------------------------------------------

export function extractSizes(raw) {
  const out = { ml: null, oz: null, g: null };
  if (typeof raw !== 'string') return out;
  for (const match of raw.matchAll(SIZE_REGEX)) {
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value)) continue;
    const unit = match[2].toLowerCase().replace(/\s+/g, '');
    if (unit === 'ml' && out.ml == null) out.ml = value;
    if ((unit === 'oz' || unit === 'floz') && out.oz == null) out.oz = value;
    if (unit === 'g' && out.g == null) out.g = value;
  }
  if (out.ml == null && out.oz != null) out.ml = Math.round(out.oz * 29.5735 * 100) / 100;
  if (out.oz == null && out.ml != null) out.oz = Math.round((out.ml / 29.5735) * 100) / 100;
  return out;
}

export function sizeSimilarity(a, b) {
  const sa = extractSizes(a ?? '');
  const sb = extractSizes(b ?? '');
  const aHas = sa.ml != null || sa.oz != null || sa.g != null;
  const bHas = sb.ml != null || sb.oz != null || sb.g != null;
  if (!aHas || !bHas) return 0.5;
  const ratios = [];
  if (sa.ml != null && sb.ml != null) ratios.push(closeness(sa.ml, sb.ml));
  if (sa.oz != null && sb.oz != null) ratios.push(closeness(sa.oz, sb.oz));
  if (sa.g != null && sb.g != null) ratios.push(closeness(sa.g, sb.g));
  if (!ratios.length) return 0.4;
  return Math.max(...ratios);
}

function closeness(a, b) {
  if (a === 0 && b === 0) return 1;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return max === 0 ? 0 : min / max;
}

// ---------------------------------------------------------------------------
// Variant clue compatibility
// ---------------------------------------------------------------------------

export function extractVariantClues(raw) {
  const text = String(raw ?? '').toLowerCase();
  const out = {};
  for (const { key, regex } of VARIANT_PATTERNS) {
    const match = regex.exec(text);
    if (match) out[key] = match[1] != null ? match[1] : true;
  }
  return out;
}

export function variantCompatibility(a, b) {
  const ca = extractVariantClues(a);
  const cb = extractVariantClues(b);
  const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  if (!keys.size) return 1;
  let score = 0;
  let total = 0;
  for (const key of keys) {
    total += 1;
    const va = ca[key];
    const vb = cb[key];
    if (va == null || vb == null) {
      // Only one side mentioned the clue. Don't penalize too hard.
      score += 0.6;
      continue;
    }
    if (String(va) === String(vb)) score += 1;
  }
  return total === 0 ? 1 : score / total;
}

// ---------------------------------------------------------------------------
// Category compatibility
// ---------------------------------------------------------------------------

export function categoryGroup(category) {
  if (typeof category !== 'string' || !category.trim()) return null;
  const lower = category.toLowerCase();
  for (const group of CATEGORY_GROUPS) {
    if (group.some((label) => lower.includes(label))) return group[0];
  }
  return null;
}

export function categoryCompatibility(a, b) {
  if (!a && !b) return 0.6;
  const ga = categoryGroup(a);
  const gb = categoryGroup(b);
  if (!ga || !gb) return 0.6;
  return ga === gb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

function readSize(source) {
  if (!source) return '';
  return [source.sizeRaw, source.size, source.name]
    .filter((v) => typeof v === 'string')
    .join(' ');
}

export function computeMatchConfidence(amazonSource, candidateSource, opts = {}) {
  if (!amazonSource || !candidateSource) {
    return {
      confidence: 0,
      decision: 'rejected',
      reasons: [],
      warnings: ['missing_input'],
      breakdown: { brand: 0, name: 0, size: 0, category: 0, variant: 0 }
    };
  }

  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };

  const brandScore = brandSimilarity(amazonSource.brand, candidateSource.brand);
  const aTokens = tokenizeName(amazonSource.name ?? '');
  const bTokens = tokenizeName(candidateSource.name ?? '');
  const nameScore = diceCoefficient(aTokens, bTokens);
  const sizeScore = sizeSimilarity(readSize(amazonSource), readSize(candidateSource));
  const categoryScore = categoryCompatibility(amazonSource.category, candidateSource.category);
  const variantScore = variantCompatibility(
    `${amazonSource.name ?? ''} ${readSize(amazonSource)}`,
    `${candidateSource.name ?? ''} ${readSize(candidateSource)}`
  );

  const reasons = [];
  const warnings = [];

  if (brandScore >= 0.99) reasons.push('brand_exact');
  else if (brandScore >= 0.85) reasons.push(`brand_alias:${round(brandScore)}`);
  else warnings.push('brand_mismatch');

  if (nameScore >= 0.7) reasons.push(`name_token_match:${round(nameScore)}`);
  else if (nameScore >= 0.45) warnings.push(`name_loose:${round(nameScore)}`);
  else warnings.push('name_too_different');

  if (sizeScore >= 0.95) reasons.push('size_match');
  else if (sizeScore < 0.7) warnings.push(`size_mismatch:${round(sizeScore)}`);

  if (categoryScore === 1) reasons.push('category_match');
  else if (categoryScore < 0.5) warnings.push('category_mismatch');

  if (variantScore < 0.7) warnings.push('variant_mismatch');

  const confidence =
    weights.brand * brandScore +
    weights.name * nameScore +
    weights.size * sizeScore +
    weights.category * categoryScore +
    weights.variant * variantScore;

  let decision;
  if (confidence >= MATCH_THRESHOLDS.AUTO && brandScore >= 0.85 && nameScore >= 0.55) {
    decision = 'auto_match';
  } else if (confidence >= MATCH_THRESHOLDS.REVIEW) {
    decision = 'needs_review';
  } else {
    decision = 'rejected';
  }

  return {
    confidence: round(confidence),
    decision,
    reasons,
    warnings,
    breakdown: {
      brand: round(brandScore),
      name: round(nameScore),
      size: round(sizeScore),
      category: round(categoryScore),
      variant: round(variantScore)
    }
  };
}

export function rankCandidates(amazonSource, candidates, opts = {}) {
  if (!Array.isArray(candidates)) return [];
  const ranked = candidates.map((candidate) => ({
    candidate,
    ...computeMatchConfidence(amazonSource, candidate, opts)
  }));
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}

// ---------------------------------------------------------------------------
// Canonical product key
//
// Used by the pipeline to compute `Product.slug`. Built from three buckets:
//   1. normalizedBrand   - lowercased + alias-aware
//   2. normalizedName    - marketing/size noise stripped via normalizeProductName
//   3. normalizedSizeGroup - size bucket (ml preferred, oz fallback) + variant
//
// Why all three? `brand + name` alone collapses different SKU sizes
// (50 ml regular vs 15 ml mini) into the same Product. ASIN-based keys are
// retailer-specific and prevent us from joining the same canonical product
// across Amazon / Sephora / Ulta / official-brand offers. Brand + name + size
// group is retailer-neutral and SKU-aware.
//
// Two products with the same `canonicalProductKey(...)` are treated as the
// same canonical product.

const VARIANT_SLUG_KEYS = Object.freeze(['mini', 'jumbo', 'refill', 'travel']);

function detectSizeVariant(text) {
  if (!text) return null;
  const clues = extractVariantClues(text);
  const matched = VARIANT_SLUG_KEYS.filter((key) => clues[key]);
  return matched.length ? matched.sort().join('-') : null;
}

function bucketMl(ml) {
  const n = Number(ml);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Below 100 ml: snap to nearest 5 ml. Above: nearest 25 ml. This collapses
  // tiny ml/oz conversion noise (e.g. 1.7 fl oz = 50.27 ml) but keeps real
  // size differences distinct.
  return n < 100 ? Math.max(1, Math.round(n / 5) * 5) : Math.round(n / 25) * 25;
}

function bucketOz(oz) {
  const n = Number(oz);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 4 ? Math.round(n * 2) / 2 : Math.round(n);
}

export function sizeGroupKey({ sizeMl, sizeOz, sizeRaw } = {}) {
  const ml = bucketMl(sizeMl);
  const oz = bucketOz(sizeOz);
  const variant = detectSizeVariant(sizeRaw);
  let base;
  if (ml != null) base = `${ml}ml`;
  else if (oz != null) base = `${formatOz(oz)}oz`;
  else base = 'nosize';
  return variant ? `${base}-${variant}` : base;
}

function formatOz(value) {
  // Drop trailing ".0" so 1.5oz / 1oz both look natural in the slug.
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.?0+$/, '');
}

export function canonicalProductKey({ brand, name, sizeMl, sizeOz, sizeRaw } = {}) {
  const normalizedBrand = normalizeBrand(brand);
  const normalizedNameRaw = normalizeProductName(name);
  // Amazon titles often start with the brand ("Supergoop! Mineral Unseen ...");
  // Sephora/Ulta typically don't. Strip the leading brand tokens so the slug
  // is identical regardless of which retailer's name we use.
  const normalizedNameNoBrand = stripBrandPrefix(normalizedNameRaw, normalizedBrand);
  const normBrand = slugToken(normalizedBrand);
  const normName = slugToken(normalizedNameNoBrand);
  if (!normBrand && !normName) {
    // No identifying text at all - fall back to a synthetic, time-stamped
    // slug so the pipeline can still create a row to track later.
    return `product-${Date.now()}`;
  }
  const normSize = slugToken(sizeGroupKey({ sizeMl, sizeOz, sizeRaw }));
  const parts = [normBrand, normName, normSize].filter(Boolean);
  // Double-dash between the three logical buckets so they stay visually
  // separable in admin UIs / logs but the slug remains URL-safe.
  return parts.join('--').slice(0, 200);
}

function slugToken(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripBrandPrefix(name, normalizedBrand) {
  if (!name || !normalizedBrand) return name;
  const tokens = normalizedBrand.split(/\s+/).filter(Boolean);
  let working = String(name).trim();
  for (const token of tokens) {
    const re = new RegExp(`^${escapeRegExp(token)}(?:\\s+|$)`, 'i');
    if (!re.test(working)) break;
    working = working.replace(re, '').trim();
  }
  return working;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

function stringSimilarity(a, b) {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.length) return 1;
  const distance = levenshtein(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
