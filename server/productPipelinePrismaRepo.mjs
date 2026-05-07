// Prisma-backed implementation of the product-pipeline repo interface.
//
// Mirrors the in-memory repo defined in `productPipeline.mjs` so the same
// `runImportAndEnrichPipeline(...)` works against either backend.
//
// Idempotency contracts (matched to the Prisma schema):
//   - ProductSource           unique on (retailer, sourceItemId)
//   - Product                 unique on slug
//   - ProductMatchCandidate   unique on (amazonSourceId, enrichmentSourceId)
//   - Offer                   unique on (productId, retailer, sourceItemId)
//   - Ingredient              unique on canonicalName
//   - ProductIngredient       unique on (productId, ingredientId, source);
//                             replaced atomically per (productId, source).
//   - ProductFeatureSnapshot  unique on (productId, source)
//
// Re-running the pipeline against the same payloads is therefore safe -
// repeated upserts mutate existing rows instead of creating duplicates.

import { prisma } from './dbStore.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringifyJson(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function toFloat(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function productSourceWriteRow(payload) {
  return {
    retailer: payload.retailer,
    sourceItemId: payload.sourceItemId,
    sourceUrl: payload.sourceUrl ?? null,
    brand: payload.brand ?? null,
    name: payload.name ?? null,
    category: payload.category ?? null,
    sizeRaw: payload.sizeRaw ?? null,
    sizeMl: toFloat(payload.sizeMl),
    sizeOz: toFloat(payload.sizeOz),
    imageUrl: payload.imageUrl ?? null,
    priceAmount: toFloat(payload.priceAmount),
    priceCurrency: payload.priceCurrency ?? null,
    ingredientsText: payload.ingredientsText ?? null,
    inciIngredientsJson: stringifyJson(payload.inciIngredients ?? []),
    rawJson: stringifyJson(payload.rawJson ?? {}),
    fetchedAt: toDate(payload.fetchedAt) ?? new Date(),
    schemaVersion: Number.isFinite(Number(payload.schemaVersion)) ? Number(payload.schemaVersion) : 1
  };
}

// Prisma -> in-pipeline shape. The pipeline expects `inciIngredients` as an
// array and `rawJson` as an object (it indexes into `rawJson.skinTypes` etc.).
function productSourceReadRow(row) {
  if (!row) return null;
  return {
    ...row,
    inciIngredients: parseJson(row.inciIngredientsJson, []),
    rawJson: parseJson(row.rawJson, {})
  };
}

// ---------------------------------------------------------------------------
// Repo factory
// ---------------------------------------------------------------------------

export function createPrismaProductRepo(client = prisma) {
  return {
    // ----- ProductSource ----------------------------------------------------

    async upsertProductSource(payload) {
      const data = productSourceWriteRow(payload);
      const row = await client.productSource.upsert({
        where: {
          retailer_sourceItemId: {
            retailer: data.retailer,
            sourceItemId: data.sourceItemId
          }
        },
        update: data,
        create: data
      });
      return productSourceReadRow(row);
    },

    async linkProductSource(productSourceId, productId) {
      const row = await client.productSource.update({
        where: { id: productSourceId },
        data: { productId }
      });
      return productSourceReadRow(row);
    },

    // ----- Product ----------------------------------------------------------

    async findProductBySlug(slug) {
      const row = await client.product.findUnique({ where: { slug } });
      return row ?? null;
    },

    async createProduct(payload) {
      return client.product.create({
        data: {
          slug: payload.slug,
          canonicalName: payload.canonicalName ?? '',
          canonicalBrand: payload.canonicalBrand ?? '',
          category: payload.category ?? null,
          status: payload.status ?? 'draft',
          recommendationEligible: Boolean(payload.recommendationEligible),
          imageUrl: payload.imageUrl ?? null,
          sizeMl: toFloat(payload.sizeMl),
          sizeOz: toFloat(payload.sizeOz),
          description: payload.description ?? null,
          warningsJson: payload.warningsJson ?? '[]'
        }
      });
    },

    async updateProduct(productId, patch) {
      const data = {};
      if (patch.canonicalBrand != null) data.canonicalBrand = patch.canonicalBrand;
      if (patch.canonicalName != null) data.canonicalName = patch.canonicalName;
      if (patch.category !== undefined) data.category = patch.category;
      if (patch.imageUrl !== undefined) data.imageUrl = patch.imageUrl;
      if (patch.sizeMl !== undefined) data.sizeMl = toFloat(patch.sizeMl);
      if (patch.sizeOz !== undefined) data.sizeOz = toFloat(patch.sizeOz);
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.recommendationEligible !== undefined) {
        data.recommendationEligible = Boolean(patch.recommendationEligible);
      }
      if (patch.warningsJson !== undefined) data.warningsJson = patch.warningsJson;
      return client.product.update({ where: { id: productId }, data });
    },

    async updateProductStatus(productId, { status, recommendationEligible, warnings }) {
      return client.product.update({
        where: { id: productId },
        data: {
          status: status ?? 'draft',
          recommendationEligible: Boolean(recommendationEligible),
          warningsJson: stringifyJson(warnings ?? [])
        }
      });
    },

    // ----- ProductMatchCandidate -------------------------------------------

    async upsertMatchCandidate(payload) {
      const data = {
        amazonSourceId: payload.amazonSourceId,
        enrichmentSourceId: payload.enrichmentSourceId,
        confidence: toFloat(payload.confidence) ?? 0,
        decision: payload.decision ?? 'rejected',
        reasonsJson: stringifyJson(payload.reasons ?? []),
        warningsJson: stringifyJson(payload.warnings ?? []),
        breakdownJson: stringifyJson(payload.breakdown ?? {})
      };
      return client.productMatchCandidate.upsert({
        where: {
          amazonSourceId_enrichmentSourceId: {
            amazonSourceId: data.amazonSourceId,
            enrichmentSourceId: data.enrichmentSourceId
          }
        },
        update: data,
        create: data
      });
    },

    async markMatchApplied({ amazonSourceId, enrichmentSourceId, appliedAt }) {
      return client.productMatchCandidate.update({
        where: {
          amazonSourceId_enrichmentSourceId: {
            amazonSourceId,
            enrichmentSourceId
          }
        },
        data: { appliedAt: toDate(appliedAt) ?? new Date() }
      });
    },

    // ----- Offer ------------------------------------------------------------

    async upsertOffer(payload) {
      const data = {
        productId: payload.productId,
        retailer: payload.retailer,
        // Schema field is non-null with default ''. Coerce here so callers
        // that pass null do not break the compound unique upsert.
        sourceItemId: payload.sourceItemId ?? '',
        url: payload.url ?? '',
        priceAmount: toFloat(payload.priceAmount),
        priceCurrency: payload.priceCurrency ?? null,
        inStock: payload.inStock !== false,
        fetchedAt: toDate(payload.fetchedAt) ?? new Date()
      };
      return client.offer.upsert({
        where: {
          productId_retailer_sourceItemId: {
            productId: data.productId,
            retailer: data.retailer,
            sourceItemId: data.sourceItemId
          }
        },
        update: data,
        create: data
      });
    },

    // ----- Ingredient & ProductIngredient -----------------------------------

    async upsertIngredient(payload) {
      const data = {
        canonicalName: payload.canonicalName,
        inciName: payload.inciName ?? null,
        aliasesJson: payload.aliasesJson ?? '[]',
        category: payload.category ?? null
      };
      return client.ingredient.upsert({
        where: { canonicalName: data.canonicalName },
        update: { inciName: data.inciName, aliasesJson: data.aliasesJson, category: data.category },
        create: data
      });
    },

    async replaceProductIngredients({ productId, source, items }) {
      // Replace all ProductIngredient rows for (productId, source) atomically.
      return client.$transaction(async (tx) => {
        await tx.productIngredient.deleteMany({ where: { productId, source } });
        const list = Array.isArray(items) ? items : [];
        if (list.length > 0) {
          await tx.productIngredient.createMany({
            data: list.map((item) => ({
              productId,
              ingredientId: item.ingredientId,
              source,
              position: item.position,
              confidence: toFloat(item.confidence) ?? 0,
              rawText: item.rawText ?? null
            })),
            skipDuplicates: true
          });
        }
        return tx.productIngredient.findMany({
          where: { productId, source },
          orderBy: { position: 'asc' }
        });
      });
    },

    // ----- ProductFeatureSnapshot ------------------------------------------

    async upsertProductFeatureSnapshot(payload) {
      const data = {
        productId: payload.productId,
        source: payload.source,
        whatItIs: payload.whatItIs ?? null,
        formulation: payload.formulation ?? null,
        description: payload.description ?? null,
        skinTypesJson: payload.skinTypesJson ?? '[]',
        concernsJson: payload.concernsJson ?? '[]',
        highlightsJson: payload.highlightsJson ?? '[]',
        capturedAt: toDate(payload.capturedAt) ?? new Date()
      };
      return client.productFeatureSnapshot.upsert({
        where: {
          productId_source: {
            productId: data.productId,
            source: data.source
          }
        },
        update: data,
        create: data
      });
    }
  };
}
