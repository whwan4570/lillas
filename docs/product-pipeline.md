# Product import & enrichment pipeline

This document describes how Amazon, Sephora, Ulta, and official brand data
flow through the catalog pipeline to produce the canonical `Product` rows
that power both ingredient-based recommendations and price comparison.

The design follows two hard rules:

1. Raw retailer data and app-ready data are stored separately.
2. Manual review is an exception queue, not the default path.

## Sources of truth

| Role           | Retailers                | Trust                            |
| -------------- | ------------------------ | -------------------------------- |
| Discovery      | Amazon (primary)         | Source of ASINs, prices, images, |
|                |                          | review signal, purchase URL.     |
| Enrichment     | Sephora, Ulta, brand     | Source of INCI ingredients,      |
|                | official site            | "what it is", skin types,        |
|                |                          | concerns, formulation, clinical  |
|                |                          | claims.                          |

We never trust a single source blindly. Two-source overlap is what unlocks
the `ACTIVE` (recommendation-eligible) status.

## Data model

```
ImportedProduct          (legacy Sephora raw cache - kept for compatibility)

ProductSource            (raw retailer record, one row per ASIN/SKU/slug)
   |
   | matched against
   v
ProductMatchCandidate    (Amazon source <-> enrichment source, with score)
   |
   | applied when confidence >= AUTO threshold
   v
Product                  (canonical, app-readable)
   |- Offer               (price + URL per retailer)
   |- ProductIngredient   (ordered INCI list with source + confidence)
   |- ProductFeatureSnapshot (per-source features: whatItIs, skinTypes...)
```

`ProductSource.retailer` is one of `amazon | sephora | ulta | brand_official`.
A `Product` is created/updated when an Amazon `ProductSource` is imported,
and is linked back to all sources that contributed to it via
`ProductSource.productId`.

## Pipeline stages

The full flow lives in `server/productPipeline.mjs`
(`runImportAndEnrichPipeline`). All persistence is delegated to a `repo`
adapter so the same code runs against a Prisma database (production) or an
in-memory store (tests + the demo runner).

### 1. Import

`server/productSourceAdapters.mjs` exports four adapters:

- `amazonItemToProductSource(raw)` - shape matches the Amazon Product
  Advertising / Creators API response. Anything that produces the same
  payload (mock fixture, internal mirror) is fine. **No HTML scraping.**
- `sephoraImportedToProductSource(raw)` - accepts both the standardized
  product from `server/sephoraSchema.mjs` and existing `ImportedProduct`
  rows.
- `ultaItemToProductSource(raw)` - placeholder for an Ulta provider.
- `brandOfficialToProductSource(raw)` - generic brand-site adapter.

Each adapter normalizes the payload into a `ProductSource` row (with
`sizeMl` / `sizeOz` parsed via `parseSize`) and persists it via
`repo.upsertProductSource(...)`.

### 2. Match

For every Amazon import, `rankCandidates(amazonSource, candidates)` from
`server/productMatching.mjs` scores each enrichment candidate. The score is
a weighted blend:

| Signal     | Weight | Notes                                           |
| ---------- | ------ | ----------------------------------------------- |
| Brand      | 0.30   | Normalized + alias map, then Levenshtein.       |
| Name       | 0.40   | Token-set Dice coefficient over normalized name |
|            |        | with marketing noise removed.                   |
| Size       | 0.15   | ml/oz/g extracted from name+sizeRaw.            |
| Category   | 0.10   | Group-based equivalence (e.g. cleanser==face   |
|            |        | wash).                                          |
| Variant    | 0.05   | SPF, fragrance-free, mini, refill, tinted, ... |

Decision thresholds:

- `confidence >= 0.88` and brand/name strong enough -> `auto_match`
- `0.65 <= confidence < 0.88`                       -> `needs_review`
- `confidence <  0.65`                              -> `rejected`

Every (Amazon, candidate) pair is persisted as a `ProductMatchCandidate`
row, with `confidence`, `decision`, `reasonsJson`, `warningsJson`, and a
per-signal `breakdownJson`. Reviewers can later inspect why a match landed
where it did.

### 3. Enrich

If the top candidate's decision is `auto_match`, the pipeline:

- Links both sources to the canonical `Product`.
- Marks the `ProductMatchCandidate` as `appliedAt = now`.
- Parses `ingredientsText` from every candidate (not just the top one) via
  `parseIngredientsList`, picks the highest-confidence list with
  `pickCanonicalIngredientList`, and writes ordered `ProductIngredient`
  rows with `position`, `source`, `confidence`, and `rawText`.
- Captures the source's source-specific descriptive fields (whatItIs,
  formulation, skin types, concerns, highlights) into a
  `ProductFeatureSnapshot` row keyed by `(productId, source)`.

If multiple sources disagree on the ingredient list, only the highest-
confidence list is written but warnings of the form
`ingredient_disagreement:sephora_vs_brand_official:0.42` are added so that
the audit trail makes the conflict visible.

### 4. Offer

An `Offer` row is always created/updated for the Amazon source (regardless
of whether enrichment succeeded), so price comparison works even when we
cannot recommend the product.

### 5. Promote

`decidePromotion(...)` evaluates quality rules:

- **`draft`**            - missing canonical name, brand, image, or offer.
- **`comparison_only`**  - has Amazon offer + image, but no reliable
  enrichment or no parsed ingredients. Still safe to compare prices.
- **`active`**           - has reliable enrichment **and** ingredients with
  source confidence >= `INGREDIENT_CONFIDENCE_THRESHOLD`. Sets
  `recommendationEligible = true`.
- **`rejected`**         - reserved for explicit moderation actions
  (e.g. flagged unsafe content). Pipeline never auto-rejects here.

## Running the demo

The demo runs entirely in-memory, with no database connection:

```bash
pnpm import:pipeline:demo
```

This pipes three Amazon imports (Supergoop sunscreen, The Ordinary serum,
generic Vit C) through the matcher, prints decisions/confidence/breakdown,
and dumps the resulting state.

## Tests

- `server/productMatching.test.mjs` - normalization, similarity, variant
  detection, full confidence scoring, candidate ranking.
- `server/ingredientNormalization.test.mjs` - INCI parsing, alias
  resolution, multi-source disagreement.
- `server/productPipeline.test.mjs` - end-to-end pipeline against the
  in-memory repo, including the comparison-only and rejected paths.

Run them with:

```bash
pnpm test
```

## Swapping in real data

Production wiring is just a matter of swapping the in-memory repo for a
Prisma-backed repo that implements the same interface
(`upsertProductSource`, `linkProductSource`, `findProductBySlug`,
`createProduct`, `updateProduct`, `updateProductStatus`,
`upsertMatchCandidate`, `markMatchApplied`, `upsertOffer`,
`upsertIngredient`, `upsertProductIngredient`,
`upsertProductFeatureSnapshot`). The matching utilities and pipeline stay
identical.

When the Amazon Creators API (or whichever official Amazon provider lands)
goes live, only `amazonItemToProductSource` needs to change - it expects
the existing PA-API GetItems shape but accepts overrides directly. There
is **no HTML scraping** in the pipeline path; all retailer access is
abstracted behind adapter functions.
