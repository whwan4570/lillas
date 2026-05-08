// Product pipeline.
//
// Coordinates the end-to-end flow:
//   1. Import an Amazon product (raw retailer payload)         -> ProductSource
//   2. Import enrichment candidates (Sephora / Ulta / brand)   -> ProductSource
//   3. Score every (Amazon, candidate) pair                    -> ProductMatchCandidate
//   4. If the best score is >= AUTO threshold, enrich          -> Product, ProductIngredient, ProductFeatureSnapshot
//      otherwise keep weaker candidates for review             -> ProductMatchCandidate(needs_review)
//   5. Always create an Amazon Offer when a Product exists     -> Offer
//   6. Decide promotion status                                 -> Product.status / recommendationEligible
//
// All persistence goes through a `repo` interface so we can run the pipeline
// against either a Prisma database (production) or an in-memory store (tests).
// See `createInMemoryProductRepo()` below.

import { canonicalProductKey, rankCandidates } from './productMatching.mjs';
import {
  ingredientListConfidence,
  parseIngredientsList,
  pickCanonicalIngredientList
} from './ingredientNormalization.mjs';

export const PRODUCT_STATUS = Object.freeze({
  DRAFT: 'draft',
  COMPARISON_ONLY: 'comparison_only',
  ACTIVE: 'active',
  REJECTED: 'rejected'
});

export const INGREDIENT_CONFIDENCE_THRESHOLD = 0.55;
const ENRICHMENT_RETAILERS = new Set(['sephora', 'ulta', 'brand_official']);

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

export async function runImportAndEnrichPipeline({
  amazonSource,
  candidateSources = [],
  repo,
  now = () => new Date(),
  // When set, the candidate matching this enrichment source id is treated as
  // an auto-match regardless of its computed confidence. Used by the admin
  // "approve" flow to manually promote a needs_review candidate.
  forceApplyEnrichmentSourceId = null
} = {}) {
  if (!amazonSource) throw new Error('runImportAndEnrichPipeline requires an amazonSource');
  if (!repo) throw new Error('runImportAndEnrichPipeline requires a repo');
  if (amazonSource.retailer !== 'amazon') {
    throw new Error(`amazonSource.retailer must be "amazon" (got "${amazonSource.retailer}")`);
  }

  const persistedAmazon = await repo.upsertProductSource(amazonSource);
  const persistedCandidates = [];
  for (const candidate of candidateSources) {
    if (!ENRICHMENT_RETAILERS.has(candidate.retailer)) continue;
    persistedCandidates.push(await repo.upsertProductSource(candidate));
  }

  const ranked = rankCandidates(persistedAmazon, persistedCandidates);

  let forcedEntry = null;
  if (forceApplyEnrichmentSourceId != null) {
    forcedEntry = ranked.find((entry) => entry.candidate?.id === forceApplyEnrichmentSourceId) ?? null;
    if (forcedEntry) {
      forcedEntry.decision = 'auto_match';
      forcedEntry.reasons = [...(forcedEntry.reasons ?? []), 'manual_override'];
    }
  }

  // Persist all candidates with their (possibly overridden) scores so reviewers
  // can audit later.
  for (const entry of ranked) {
    await repo.upsertMatchCandidate({
      amazonSourceId: persistedAmazon.id,
      enrichmentSourceId: entry.candidate.id,
      confidence: entry.confidence,
      decision: entry.decision,
      reasons: entry.reasons,
      warnings: entry.warnings,
      breakdown: entry.breakdown,
      createdAt: now()
    });
  }

  // When the caller forces a specific enrichment source, that candidate becomes
  // the effective top regardless of its raw confidence rank.
  const top = forcedEntry ?? ranked[0] ?? null;
  const autoEnrichable = Boolean(top && top.decision === 'auto_match');

  const product = await ensureProduct({
    repo,
    amazonSource: persistedAmazon,
    enrichment: autoEnrichable ? top.candidate : null,
    now
  });

  // Always link the Amazon source to the product.
  await repo.linkProductSource(persistedAmazon.id, product.id);

  // Always add/refresh the Amazon offer - even comparison-only products need
  // a working purchase URL.
  const offer = await repo.upsertOffer(buildOfferFromAmazon(persistedAmazon, product, now));

  let ingredientsResult = null;
  let snapshot = null;

  if (autoEnrichable) {
    await repo.linkProductSource(top.candidate.id, product.id);
    await repo.markMatchApplied({
      amazonSourceId: persistedAmazon.id,
      enrichmentSourceId: top.candidate.id,
      appliedAt: now()
    });

    ingredientsResult = await persistIngredientsFromSources({
      product,
      enrichmentSources: persistedCandidates,
      repo
    });

    snapshot = await persistFeatureSnapshot({
      product,
      enrichmentSource: top.candidate,
      repo
    });
  }

  const promotion = decidePromotion({
    product,
    amazonSource: persistedAmazon,
    offer,
    ingredientsResult,
    topCandidate: top
  });
  const updatedProduct = await repo.updateProductStatus(product.id, promotion);

  return {
    product: updatedProduct,
    amazonSource: persistedAmazon,
    candidates: ranked,
    topCandidate: top,
    offer,
    ingredients: ingredientsResult,
    featureSnapshot: snapshot,
    promotion
  };
}

async function ensureProduct({ repo, amazonSource, enrichment, now }) {
  const brand = enrichment?.brand ?? amazonSource.brand ?? '';
  const name = enrichment?.name ?? amazonSource.name ?? '';
  // Prefer enrichment size hints (Sephora/Ulta/brand are usually more
  // accurate than Amazon's free-form title), but fall back to Amazon when
  // enrichment is missing or weak. Same canonicalProductKey across retailers
  // means the same canonical Product.
  const sizeMl = enrichment?.sizeMl ?? amazonSource.sizeMl ?? null;
  const sizeOz = enrichment?.sizeOz ?? amazonSource.sizeOz ?? null;
  const sizeRaw = enrichment?.sizeRaw ?? amazonSource.sizeRaw ?? `${enrichment?.name ?? ''} ${amazonSource.name ?? ''}`;
  const slug = canonicalProductKey({ brand, name, sizeMl, sizeOz, sizeRaw });
  const existing = await repo.findProductBySlug(slug);
  if (existing) {
    if (enrichment && (existing.canonicalBrand !== brand || existing.canonicalName !== name)) {
      return repo.updateProduct(existing.id, {
        canonicalBrand: brand || existing.canonicalBrand,
        canonicalName: name || existing.canonicalName,
        category: enrichment.category ?? existing.category,
        sizeMl: enrichment.sizeMl ?? existing.sizeMl,
        sizeOz: enrichment.sizeOz ?? existing.sizeOz,
        imageUrl: existing.imageUrl ?? enrichment.imageUrl ?? amazonSource.imageUrl
      });
    }
    return existing;
  }
  return repo.createProduct({
    slug,
    canonicalBrand: brand,
    canonicalName: name,
    category: enrichment?.category ?? amazonSource.category ?? null,
    sizeMl: enrichment?.sizeMl ?? amazonSource.sizeMl ?? null,
    sizeOz: enrichment?.sizeOz ?? amazonSource.sizeOz ?? null,
    imageUrl: amazonSource.imageUrl ?? enrichment?.imageUrl ?? null,
    description: enrichment?.rawJson?.whatItIs ?? null,
    status: PRODUCT_STATUS.DRAFT,
    recommendationEligible: false,
    warningsJson: '[]',
    createdAt: now(),
    updatedAt: now()
  });
}

function buildOfferFromAmazon(amazonSource, product, now) {
  return {
    productId: product.id,
    retailer: 'amazon',
    sourceItemId: amazonSource.sourceItemId,
    url: amazonSource.sourceUrl ?? '',
    priceAmount: amazonSource.priceAmount ?? null,
    priceCurrency: amazonSource.priceCurrency ?? null,
    inStock: true,
    fetchedAt: now()
  };
}

async function persistIngredientsFromSources({ product, enrichmentSources, repo }) {
  const parsedBySource = enrichmentSources
    .filter((src) => typeof src.ingredientsText === 'string' && src.ingredientsText.trim())
    .map((src) => ({
      source: src.retailer,
      sourceId: src.id,
      text: src.ingredientsText,
      parsed: parseIngredientsList(src.ingredientsText)
    }))
    .filter((entry) => entry.parsed.length > 0);

  const { chosen, warnings } = pickCanonicalIngredientList(parsedBySource);
  if (!chosen) {
    return { chosen: null, parsed: [], confidence: 0, warnings: ['no_ingredient_text'], persisted: 0 };
  }

  const confidence = ingredientListConfidence(chosen.parsed, chosen.text);

  if (confidence < INGREDIENT_CONFIDENCE_THRESHOLD) {
    return {
      chosen: chosen.source,
      parsed: chosen.parsed,
      confidence,
      warnings: [...warnings, `ingredient_confidence_low:${confidence.toFixed(2)}`],
      persisted: 0
    };
  }

  const items = [];
  for (const entry of chosen.parsed) {
    const ingredient = await repo.upsertIngredient({
      canonicalName: entry.canonical,
      inciName: entry.raw,
      aliasesJson: '[]'
    });
    items.push({
      ingredientId: ingredient.id,
      position: entry.position,
      confidence,
      rawText: entry.raw
    });
  }

  // Atomic replace per (product, source) so re-running the pipeline with a
  // different chosen list (e.g. shorter Sephora vs richer brand) cannot leave
  // stale ProductIngredient rows behind.
  await repo.replaceProductIngredients({
    productId: product.id,
    source: chosen.source,
    items
  });

  return {
    chosen: chosen.source,
    parsed: chosen.parsed,
    confidence,
    warnings,
    persisted: items.length
  };
}

async function persistFeatureSnapshot({ product, enrichmentSource, repo }) {
  const raw = enrichmentSource.rawJson ?? {};
  const skinTypes = Array.isArray(raw.skinTypes) ? raw.skinTypes : [];
  const concerns = Array.isArray(raw.skincareConcerns) ? raw.skincareConcerns : [];
  const highlights = Array.isArray(raw.highlights) ? raw.highlights : [];

  if (!raw.whatItIs && !skinTypes.length && !concerns.length && !highlights.length) {
    return null;
  }

  return repo.upsertProductFeatureSnapshot({
    productId: product.id,
    source: enrichmentSource.retailer,
    whatItIs: raw.whatItIs ?? null,
    formulation: raw.formulation ?? null,
    description: raw.whatElse ?? null,
    skinTypesJson: JSON.stringify(skinTypes),
    concernsJson: JSON.stringify(concerns),
    highlightsJson: JSON.stringify(highlights),
    capturedAt: new Date()
  });
}

// ---------------------------------------------------------------------------
// Promotion rules
// ---------------------------------------------------------------------------

export function decidePromotion({ product, amazonSource, offer, ingredientsResult, topCandidate }) {
  const warnings = [];
  const reasons = [];

  const hasName = Boolean(product?.canonicalName?.trim());
  const hasBrand = Boolean(product?.canonicalBrand?.trim());
  const hasImage = Boolean(product?.imageUrl);
  const hasPurchasableOffer = Boolean(offer?.url);

  if (!hasName) warnings.push('missing_name');
  if (!hasBrand) warnings.push('missing_brand');
  if (!hasImage) warnings.push('missing_image');
  if (!hasPurchasableOffer) warnings.push('missing_offer');

  const ingredientsConfidence = ingredientsResult?.confidence ?? 0;
  const ingredientsPersisted = (ingredientsResult?.persisted ?? 0) > 0;
  const reliableEnrichment = topCandidate && topCandidate.decision === 'auto_match';

  let status;
  let recommendationEligible = false;

  if (!hasName || !hasBrand || !hasImage || !hasPurchasableOffer) {
    status = PRODUCT_STATUS.DRAFT;
  } else if (reliableEnrichment && ingredientsPersisted && ingredientsConfidence >= INGREDIENT_CONFIDENCE_THRESHOLD) {
    status = PRODUCT_STATUS.ACTIVE;
    recommendationEligible = true;
    reasons.push('has_ingredients', 'has_offer', 'reliable_enrichment');
  } else {
    status = PRODUCT_STATUS.COMPARISON_ONLY;
    reasons.push('has_offer');
    if (!ingredientsPersisted) reasons.push('no_ingredients');
    if (!reliableEnrichment) reasons.push('no_reliable_enrichment');
  }

  if (ingredientsResult?.warnings?.length) warnings.push(...ingredientsResult.warnings);
  if (topCandidate?.warnings?.length) warnings.push(...topCandidate.warnings.map((w) => `match:${w}`));

  return {
    status,
    recommendationEligible,
    warnings,
    reasons
  };
}

// ---------------------------------------------------------------------------
// In-memory repo for tests / demos
// ---------------------------------------------------------------------------

export function createInMemoryProductRepo() {
  let nextId = 1;
  const productSources = new Map();
  const productSourceByRetailerKey = new Map();
  const products = new Map();
  const productsBySlug = new Map();
  const matchCandidates = new Map();
  const matchCandidateByPair = new Map();
  const offers = new Map();
  const ingredients = new Map();
  const ingredientByName = new Map();
  const productIngredients = new Map();
  const productIngredientByKey = new Map();
  const featureSnapshots = new Map();
  const featureSnapshotByKey = new Map();

  function id() {
    const next = nextId;
    nextId += 1;
    return next;
  }

  return {
    nextId() {
      return nextId;
    },

    async upsertProductSource(payload) {
      const key = `${payload.retailer}:${payload.sourceItemId}`;
      const existingId = productSourceByRetailerKey.get(key);
      if (existingId != null) {
        const merged = {
          ...productSources.get(existingId),
          ...payload,
          id: existingId,
          updatedAt: new Date()
        };
        productSources.set(existingId, merged);
        return merged;
      }
      const newId = id();
      const row = {
        ...payload,
        id: newId,
        productId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      productSources.set(newId, row);
      productSourceByRetailerKey.set(key, newId);
      return row;
    },

    async linkProductSource(productSourceId, productId) {
      const row = productSources.get(productSourceId);
      if (!row) return null;
      row.productId = productId;
      row.updatedAt = new Date();
      return row;
    },

    async findProductBySlug(slug) {
      const productId = productsBySlug.get(slug);
      return productId != null ? products.get(productId) ?? null : null;
    },

    async createProduct(payload) {
      const newId = id();
      const row = {
        ...payload,
        id: newId,
        createdAt: payload.createdAt ?? new Date(),
        updatedAt: payload.updatedAt ?? new Date()
      };
      products.set(newId, row);
      productsBySlug.set(row.slug, newId);
      return row;
    },

    async updateProduct(productId, patch) {
      const row = products.get(productId);
      if (!row) return null;
      const merged = { ...row, ...patch, updatedAt: new Date() };
      products.set(productId, merged);
      productsBySlug.set(merged.slug, productId);
      return merged;
    },

    async updateProductStatus(productId, { status, recommendationEligible, warnings }) {
      const row = products.get(productId);
      if (!row) return null;
      const merged = {
        ...row,
        status,
        recommendationEligible,
        warningsJson: JSON.stringify(warnings ?? []),
        updatedAt: new Date()
      };
      products.set(productId, merged);
      return merged;
    },

    async upsertMatchCandidate(payload) {
      const key = `${payload.amazonSourceId}:${payload.enrichmentSourceId}`;
      const existingId = matchCandidateByPair.get(key);
      const row = {
        amazonSourceId: payload.amazonSourceId,
        enrichmentSourceId: payload.enrichmentSourceId,
        confidence: payload.confidence,
        decision: payload.decision,
        reasonsJson: JSON.stringify(payload.reasons ?? []),
        warningsJson: JSON.stringify(payload.warnings ?? []),
        breakdownJson: JSON.stringify(payload.breakdown ?? {}),
        appliedAt: null,
        createdAt: payload.createdAt ?? new Date(),
        updatedAt: new Date()
      };
      if (existingId != null) {
        const merged = { ...matchCandidates.get(existingId), ...row, id: existingId };
        matchCandidates.set(existingId, merged);
        return merged;
      }
      const newId = id();
      const finalRow = { ...row, id: newId };
      matchCandidates.set(newId, finalRow);
      matchCandidateByPair.set(key, newId);
      return finalRow;
    },

    async markMatchApplied({ amazonSourceId, enrichmentSourceId, appliedAt }) {
      const key = `${amazonSourceId}:${enrichmentSourceId}`;
      const candidateId = matchCandidateByPair.get(key);
      if (candidateId == null) return null;
      const row = matchCandidates.get(candidateId);
      const merged = { ...row, appliedAt: appliedAt ?? new Date(), updatedAt: new Date() };
      matchCandidates.set(candidateId, merged);
      return merged;
    },

    async upsertOffer(payload) {
      const key = `${payload.productId}:${payload.retailer}:${payload.sourceItemId ?? ''}`;
      const existing = offers.get(key);
      const row = {
        ...existing,
        ...payload,
        id: existing?.id ?? id(),
        updatedAt: new Date()
      };
      offers.set(key, row);
      return row;
    },

    async upsertIngredient(payload) {
      const key = payload.canonicalName;
      const existingId = ingredientByName.get(key);
      if (existingId != null) {
        const merged = { ...ingredients.get(existingId), ...payload, id: existingId, updatedAt: new Date() };
        ingredients.set(existingId, merged);
        return merged;
      }
      const newId = id();
      const row = {
        ...payload,
        id: newId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      ingredients.set(newId, row);
      ingredientByName.set(key, newId);
      return row;
    },

    async replaceProductIngredients({ productId, source, items }) {
      // Drop existing rows for (productId, source) before inserting the new
      // batch. Mirrors the Prisma repo's transactional replace semantic.
      for (const [existingId, row] of productIngredients) {
        if (row.productId === productId && row.source === source) {
          productIngredients.delete(existingId);
          productIngredientByKey.delete(`${row.productId}:${row.ingredientId}:${row.source}`);
        }
      }
      const inserted = [];
      for (const item of items ?? []) {
        const newId = id();
        const row = {
          id: newId,
          productId,
          ingredientId: item.ingredientId,
          source,
          position: item.position,
          confidence: item.confidence,
          rawText: item.rawText ?? null,
          createdAt: new Date()
        };
        productIngredients.set(newId, row);
        productIngredientByKey.set(`${productId}:${item.ingredientId}:${source}`, newId);
        inserted.push(row);
      }
      return inserted;
    },

    async upsertProductFeatureSnapshot(payload) {
      const key = `${payload.productId}:${payload.source}`;
      const existingId = featureSnapshotByKey.get(key);
      if (existingId != null) {
        const merged = { ...featureSnapshots.get(existingId), ...payload, id: existingId };
        featureSnapshots.set(existingId, merged);
        return merged;
      }
      const newId = id();
      const row = { ...payload, id: newId };
      featureSnapshots.set(newId, row);
      featureSnapshotByKey.set(key, newId);
      return row;
    },

    // Test helpers ----------------------------------------------------------

    _state() {
      return {
        products: [...products.values()],
        productSources: [...productSources.values()],
        matchCandidates: [...matchCandidates.values()],
        offers: [...offers.values()],
        ingredients: [...ingredients.values()],
        productIngredients: [...productIngredients.values()],
        featureSnapshots: [...featureSnapshots.values()]
      };
    }
  };
}
