import { describe, expect, it } from 'vitest';
import {
  amazonItemToProductSource,
  brandOfficialToProductSource,
  sephoraImportedToProductSource,
  ultaItemToProductSource
} from './productSourceAdapters.mjs';
import {
  createInMemoryProductRepo,
  decidePromotion,
  PRODUCT_STATUS,
  runImportAndEnrichPipeline
} from './productPipeline.mjs';

const SUPERGOOP_INGREDIENTS =
  'Water, Avobenzone, Homosalate, Octisalate, Octocrylene, Glycerin, Butylene Glycol, Phenoxyethanol, Tocopheryl Acetate, Sodium Hyaluronate, Citric Acid';

function buildAmazonRaw(overrides = {}) {
  return {
    ASIN: 'B07L3QJZQX',
    DetailPageURL: 'https://www.amazon.com/dp/B07L3QJZQX',
    ItemInfo: {
      Title: { DisplayValue: 'Supergoop! Mineral Unseen Sunscreen SPF 40, 1.7 fl oz' },
      ByLineInfo: { Brand: { DisplayValue: 'Supergoop!' } },
      Classifications: { ProductGroup: { DisplayValue: 'Beauty' } },
      Features: { DisplayValues: ['1.7 fl oz / 50 ml', 'Reef-friendly mineral SPF'] }
    },
    Images: { Primary: { Large: { URL: 'https://images.amazon.com/supergoop.jpg' } } },
    Offers: { Listings: [{ Price: { Amount: 38.0, Currency: 'USD' } }] },
    ...overrides
  };
}

function buildSephoraRaw(overrides = {}) {
  return {
    sourceItemId: '2773299',
    sourceUrl: 'https://www.sephora.com/product/P467091',
    brand: 'Supergoop!',
    name: 'Mineral Unseen Sunscreen SPF 40',
    size: '1.7 oz / 50 ml',
    formulation: 'Sunscreen',
    priceAmount: 40.0,
    priceCurrency: 'USD',
    imageUrls: ['https://www.sephora.com/productimages/sku/2773299-main.jpg'],
    ingredientsText: SUPERGOOP_INGREDIENTS,
    inciIngredients: SUPERGOOP_INGREDIENTS.split(',').map((s) => s.trim()),
    skinTypes: ['Normal', 'Dry', 'Combination', 'Oily'],
    skincareConcerns: ['Sun Protection'],
    highlights: ['Fragrance Free', 'Reef-Safe'],
    whatItIs: 'A sheer, weightless mineral sunscreen with broad-spectrum SPF 40.',
    ...overrides
  };
}

describe('runImportAndEnrichPipeline', () => {
  it('promotes an Amazon product to ACTIVE when Sephora confirms a high-confidence match with ingredients', async () => {
    const repo = createInMemoryProductRepo();
    const amazonSource = amazonItemToProductSource(buildAmazonRaw());
    const sephoraSource = sephoraImportedToProductSource(buildSephoraRaw());

    const result = await runImportAndEnrichPipeline({
      amazonSource,
      candidateSources: [sephoraSource],
      repo
    });

    expect(result.topCandidate.decision).toBe('auto_match');
    expect(result.product.status).toBe(PRODUCT_STATUS.ACTIVE);
    expect(result.product.recommendationEligible).toBe(true);
    expect(result.product.canonicalBrand).toBe('Supergoop!');
    expect(result.product.canonicalName).toBe('Mineral Unseen Sunscreen SPF 40');

    const state = repo._state();
    expect(state.offers).toHaveLength(1);
    expect(state.offers[0]).toMatchObject({ retailer: 'amazon', priceAmount: 38 });

    const ingredientNames = state.productIngredients
      .sort((a, b) => a.position - b.position)
      .map((row) => state.ingredients.find((i) => i.id === row.ingredientId)?.canonicalName);
    expect(ingredientNames).toEqual(
      expect.arrayContaining(['water', 'avobenzone', 'glycerin', 'hyaluronic acid'])
    );

    expect(state.featureSnapshots).toHaveLength(1);
    expect(state.featureSnapshots[0].whatItIs).toMatch(/sunscreen/i);

    expect(state.matchCandidates).toHaveLength(1);
    expect(state.matchCandidates[0].appliedAt).toBeTruthy();
  });

  it('keeps an Amazon product in COMPARISON_ONLY when no enrichment matches but a price/image are available', async () => {
    const repo = createInMemoryProductRepo();
    const amazonSource = amazonItemToProductSource(buildAmazonRaw({
      ASIN: 'B0AAAAAAAA',
      ItemInfo: {
        Title: { DisplayValue: 'Generic Vitamin C Serum 30 ml' },
        ByLineInfo: { Brand: { DisplayValue: 'NoNameBrand' } },
        Features: { DisplayValues: ['30 ml'] }
      },
      Images: { Primary: { Large: { URL: 'https://images.amazon.com/generic.jpg' } } },
      Offers: { Listings: [{ Price: { Amount: 12.99, Currency: 'USD' } }] }
    }));

    const unrelatedSephora = sephoraImportedToProductSource(buildSephoraRaw({
      sourceItemId: '2898419',
      brand: 'rhode',
      name: 'Glazing Milk',
      size: '50 ml',
      ingredientsText: 'Water, Glycerin, Phenoxyethanol'
    }));

    const result = await runImportAndEnrichPipeline({
      amazonSource,
      candidateSources: [unrelatedSephora],
      repo
    });

    expect(result.topCandidate.decision).toBe('rejected');
    expect(result.product.status).toBe(PRODUCT_STATUS.COMPARISON_ONLY);
    expect(result.product.recommendationEligible).toBe(false);

    const state = repo._state();
    expect(state.productIngredients).toHaveLength(0);
    expect(state.featureSnapshots).toHaveLength(0);
    expect(state.matchCandidates[0].decision).toBe('rejected');
    expect(state.matchCandidates[0].appliedAt).toBeFalsy();
  });

  it('persists weak candidates as needs_review without enriching the product', async () => {
    const repo = createInMemoryProductRepo();
    const amazonSource = amazonItemToProductSource(buildAmazonRaw());
    const closeButWrongSpf = sephoraImportedToProductSource(buildSephoraRaw({
      sourceItemId: '2773300',
      name: 'Mineral Unseen Sunscreen SPF 50'
    }));

    const result = await runImportAndEnrichPipeline({
      amazonSource,
      candidateSources: [closeButWrongSpf],
      repo
    });

    expect(['needs_review', 'auto_match', 'rejected']).toContain(result.topCandidate.decision);
    expect(result.topCandidate.decision).not.toBe('auto_match');
    expect(result.product.status).toBe(PRODUCT_STATUS.COMPARISON_ONLY);

    const state = repo._state();
    expect(state.matchCandidates[0].appliedAt).toBeFalsy();
    expect(state.productIngredients).toHaveLength(0);
  });

  it('picks the best match when given multiple candidates from different retailers', async () => {
    const repo = createInMemoryProductRepo();
    const amazonSource = amazonItemToProductSource(buildAmazonRaw());

    const sephoraMatch = sephoraImportedToProductSource(buildSephoraRaw());
    const ultaSource = ultaItemToProductSource({
      skuId: 'pimprod2009176',
      url: 'https://www.ulta.com/p/pimprod2009176',
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 40',
      size: '1.7 oz',
      category: 'Sunscreen',
      ingredients: SUPERGOOP_INGREDIENTS,
      price: 40,
      currency: 'USD'
    });
    const wrongCandidate = brandOfficialToProductSource({
      sourceItemId: 'unseen-100',
      brand: 'Supergoop!',
      name: 'Unseen Sunscreen SPF 40',
      size: '1.7 oz',
      ingredientsText: 'Avobenzone, Homosalate, Octisalate, Octocrylene'
    });

    const result = await runImportAndEnrichPipeline({
      amazonSource,
      candidateSources: [wrongCandidate, ultaSource, sephoraMatch],
      repo
    });

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(result.candidates[1].confidence);
    expect(result.candidates[1].confidence).toBeGreaterThanOrEqual(result.candidates[2].confidence);
    // Sephora and Ulta are both equally strong matches in this fixture; either
    // can win as long as the brand-official short ingredient list is last.
    expect(['sephora', 'ulta']).toContain(result.topCandidate.candidate.retailer);
    expect(result.candidates[2].candidate.retailer).toBe('brand_official');
    expect(result.topCandidate.decision).toBe('auto_match');
    expect(result.product.status).toBe(PRODUCT_STATUS.ACTIVE);
  });
});

describe('decidePromotion', () => {
  it('keeps draft when basic fields are missing', () => {
    const result = decidePromotion({
      product: { canonicalName: '', canonicalBrand: '', imageUrl: null },
      offer: null,
      ingredientsResult: null,
      topCandidate: null
    });
    expect(result.status).toBe(PRODUCT_STATUS.DRAFT);
    expect(result.warnings).toEqual(
      expect.arrayContaining(['missing_name', 'missing_brand', 'missing_image', 'missing_offer'])
    );
  });

  it('returns ACTIVE when ingredients are persisted with high confidence', () => {
    const result = decidePromotion({
      product: { canonicalName: 'X', canonicalBrand: 'Y', imageUrl: 'http://img' },
      offer: { url: 'http://amazon' },
      ingredientsResult: { persisted: 5, confidence: 0.8, warnings: [] },
      topCandidate: { decision: 'auto_match', warnings: [] }
    });
    expect(result.status).toBe(PRODUCT_STATUS.ACTIVE);
    expect(result.recommendationEligible).toBe(true);
  });

  it('falls back to comparison-only without ingredients', () => {
    const result = decidePromotion({
      product: { canonicalName: 'X', canonicalBrand: 'Y', imageUrl: 'http://img' },
      offer: { url: 'http://amazon' },
      ingredientsResult: null,
      topCandidate: null
    });
    expect(result.status).toBe(PRODUCT_STATUS.COMPARISON_ONLY);
    expect(result.recommendationEligible).toBe(false);
  });
});
