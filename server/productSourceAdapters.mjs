// Retailer source adapters.
//
// Each adapter shapes raw retailer payloads into the unified `ProductSource`
// row format. The pipeline only ever reads ProductSource rows, so swapping
// the upstream provider (Amazon Product Advertising API, Amazon Creators
// API, Sephora live crawler, an Ulta scraper, an in-house brand sync ...)
// is just a matter of providing a new adapter that emits the same shape.
//
// We deliberately avoid any HTTP / Playwright code here. Network fetching
// is the responsibility of the caller. This keeps the import flow easy to
// unit-test with mock payloads.

import { parseSize } from './sephoraSchema.mjs';

const ALLOWED_RETAILERS = new Set(['amazon', 'sephora', 'ulta', 'brand_official']);

function trim(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function asFloat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return String(value);
}

function buildProductSource({ retailer, sourceItemId, sourceUrl = null, brand = null, name = null, category = null, size = null, imageUrl = null, priceAmount = null, priceCurrency = null, ingredientsText = null, inciIngredients = [], rawJson = {}, schemaVersion = 1, fetchedAt = null }) {
  if (!ALLOWED_RETAILERS.has(retailer)) {
    throw new Error(`Unknown retailer "${retailer}". Allowed: ${[...ALLOWED_RETAILERS].join(', ')}`);
  }
  const id = trim(sourceItemId);
  if (!id) throw new Error(`ProductSource for "${retailer}" requires a sourceItemId.`);
  const sizeInfo = parseSize(size);
  return {
    retailer,
    sourceItemId: id,
    sourceUrl: trim(sourceUrl),
    brand: asString(brand),
    name: asString(name),
    category: asString(category),
    sizeRaw: sizeInfo.raw,
    sizeMl: sizeInfo.ml,
    sizeOz: sizeInfo.oz,
    imageUrl: trim(imageUrl),
    priceAmount: asFloat(priceAmount),
    priceCurrency: trim(priceCurrency) || (asFloat(priceAmount) != null ? 'USD' : null),
    ingredientsText: asString(ingredientsText),
    inciIngredients: Array.isArray(inciIngredients) ? inciIngredients.filter(Boolean).map(String) : [],
    rawJson: rawJson ?? {},
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    schemaVersion
  };
}

// ---------------------------------------------------------------------------
// Amazon adapter
//
// `raw` is shaped to match the response of the Amazon Product Advertising API
// `GetItems` operation (or the future Creators API equivalent). Anything that
// can produce the same shape (mock, fixture, scraped result) is acceptable.
// ---------------------------------------------------------------------------

export function amazonItemToProductSource(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('amazonItemToProductSource expects an object');
  }
  const asin = trim(raw.ASIN ?? raw.asin ?? raw.sourceItemId);
  if (!asin) throw new Error('Amazon source requires an ASIN.');

  const title = asString(raw.ItemInfo?.Title?.DisplayValue ?? raw.title ?? raw.name);
  const brand = asString(
    raw.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ??
      raw.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ??
      raw.brand
  );
  const url = trim(raw.DetailPageURL ?? raw.detailPageUrl ?? raw.url);
  const image = trim(raw.Images?.Primary?.Large?.URL ?? raw.image ?? raw.imageUrl);
  const offer = raw.Offers?.Listings?.[0] ?? raw.offer ?? null;
  const priceAmount = asFloat(offer?.Price?.Amount ?? raw.priceAmount ?? raw.price);
  const priceCurrency = trim(offer?.Price?.Currency ?? raw.priceCurrency) || (priceAmount != null ? 'USD' : null);

  const sizeFeature = (raw.ItemInfo?.Features?.DisplayValues ?? [])
    .map(asString)
    .filter(Boolean)
    .find((line) => /\d+\s*(?:ml|oz|fl\s*oz|g)\b/i.test(line));

  const size = asString(raw.size ?? raw.sizeRaw ?? sizeFeature);
  const category = asString(
    raw.ItemInfo?.Classifications?.ProductGroup?.DisplayValue ??
      raw.category
  );

  return buildProductSource({
    retailer: 'amazon',
    sourceItemId: asin,
    sourceUrl: url,
    brand,
    name: title,
    category,
    size,
    imageUrl: image,
    priceAmount,
    priceCurrency,
    ingredientsText: asString(raw.ingredientsText ?? raw.IngredientsText),
    inciIngredients: raw.inciIngredients ?? [],
    rawJson: raw,
    schemaVersion: 1
  });
}

// ---------------------------------------------------------------------------
// Sephora adapter
//
// Accepts either:
//   - the Sephora-standardized payload from `standardizeProduct(...)`
//   - an existing `ImportedProduct` row coming from the legacy Sephora pipeline
// ---------------------------------------------------------------------------

export function sephoraImportedToProductSource(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('sephoraImportedToProductSource expects an object');
  }
  const itemId = trim(raw.sourceItemId ?? raw.itemId ?? raw.id);
  if (!itemId) throw new Error('Sephora source requires sourceItemId.');

  return buildProductSource({
    retailer: 'sephora',
    sourceItemId: itemId,
    sourceUrl: raw.sourceUrl,
    brand: raw.brand,
    name: raw.name,
    category: raw.category ?? raw.formulation ?? null,
    size: raw.size ?? null,
    imageUrl: Array.isArray(raw.imageUrls) ? raw.imageUrls[0] : raw.imageUrl,
    priceAmount: raw.priceAmount,
    priceCurrency: raw.priceCurrency,
    ingredientsText: raw.ingredientsText,
    inciIngredients: raw.inciIngredients,
    rawJson: raw,
    schemaVersion: raw.schemaVersion ?? 2
  });
}

// ---------------------------------------------------------------------------
// Ulta adapter
//
// Shape mirrors what an Ulta product detail JSON would yield (currently
// fetched via private API or static dataset). Adjust this adapter when the
// real provider lands.
// ---------------------------------------------------------------------------

export function ultaItemToProductSource(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ultaItemToProductSource expects an object');
  }
  const sku = trim(raw.skuId ?? raw.sku ?? raw.sourceItemId);
  if (!sku) throw new Error('Ulta source requires sku.');

  return buildProductSource({
    retailer: 'ulta',
    sourceItemId: sku,
    sourceUrl: raw.url ?? raw.sourceUrl,
    brand: raw.brand ?? raw.brandName,
    name: raw.name ?? raw.displayName,
    category: raw.category ?? raw.productType,
    size: raw.size ?? raw.sizeText,
    imageUrl: raw.imageUrl ?? raw.heroImage,
    priceAmount: raw.price ?? raw.priceAmount,
    priceCurrency: raw.currency ?? raw.priceCurrency,
    ingredientsText: raw.ingredients ?? raw.ingredientsText,
    inciIngredients: raw.inciIngredients ?? [],
    rawJson: raw
  });
}

// ---------------------------------------------------------------------------
// Brand-official adapter
//
// Brand websites are unstructured. Callers parse them however they like and
// hand a normalized object here.
// ---------------------------------------------------------------------------

export function brandOfficialToProductSource(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('brandOfficialToProductSource expects an object');
  }
  const id = trim(raw.sourceItemId ?? raw.slug ?? raw.id);
  if (!id) throw new Error('Brand-official source requires sourceItemId or slug.');
  return buildProductSource({
    retailer: 'brand_official',
    sourceItemId: id,
    sourceUrl: raw.url ?? raw.sourceUrl,
    brand: raw.brand,
    name: raw.name,
    category: raw.category,
    size: raw.size,
    imageUrl: raw.imageUrl,
    priceAmount: raw.priceAmount,
    priceCurrency: raw.priceCurrency,
    ingredientsText: raw.ingredientsText,
    inciIngredients: raw.inciIngredients ?? [],
    rawJson: raw
  });
}

export const ADAPTERS = Object.freeze({
  amazon: amazonItemToProductSource,
  sephora: sephoraImportedToProductSource,
  ulta: ultaItemToProductSource,
  brand_official: brandOfficialToProductSource
});
