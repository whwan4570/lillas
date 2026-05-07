import { describe, expect, it } from 'vitest';
import {
  brandSimilarity,
  canonicalProductKey,
  categoryCompatibility,
  computeMatchConfidence,
  diceCoefficient,
  extractSizes,
  extractVariantClues,
  MATCH_THRESHOLDS,
  normalizeBrand,
  normalizeProductName,
  rankCandidates,
  sizeGroupKey,
  sizeSimilarity,
  tokenizeName,
  variantCompatibility
} from './productMatching.mjs';

describe('normalizeBrand', () => {
  it('lowercases, strips punctuation and smart quotes', () => {
    expect(normalizeBrand('Kiehl\u2019s Since 1851')).toBe('kiehl s since 1851');
    expect(normalizeBrand('SUPERGOOP!')).toBe('supergoop');
    expect(normalizeBrand('La Roche-Posay')).toBe('la roche posay');
    expect(normalizeBrand('  Drunk Elephant  ')).toBe('drunk elephant');
  });

  it('returns empty string for non-strings', () => {
    expect(normalizeBrand(null)).toBe('');
    expect(normalizeBrand(undefined)).toBe('');
    expect(normalizeBrand(42)).toBe('');
  });
});

describe('brandSimilarity', () => {
  it('returns 1 for identical brands', () => {
    expect(brandSimilarity('Drunk Elephant', 'Drunk Elephant')).toBe(1);
    expect(brandSimilarity('Drunk Elephant', 'drunk elephant')).toBe(1);
  });

  it('matches case + punctuation differences', () => {
    expect(brandSimilarity('Supergoop!', 'supergoop')).toBe(1);
    expect(brandSimilarity("Kiehl\u2019s", 'Kiehls')).toBeGreaterThanOrEqual(0.85);
  });

  it('matches via aliases', () => {
    expect(brandSimilarity("Kiehl's Since 1851", 'kiehls')).toBe(1);
    expect(brandSimilarity('The Ordinary', 'Ordinary')).toBe(1);
  });

  it('returns 0 for unrelated brands', () => {
    expect(brandSimilarity('CeraVe', 'Sunday Riley')).toBe(0);
  });

  it('returns 0 when either side is empty', () => {
    expect(brandSimilarity('', 'CeraVe')).toBe(0);
    expect(brandSimilarity('CeraVe', '')).toBe(0);
  });
});

describe('normalizeProductName / tokenizeName', () => {
  it('strips size text and parenthetical content', () => {
    expect(normalizeProductName('Mineral Unseen Sunscreen SPF 40 (1.7 oz / 50 ml)')).toBe(
      'mineral unseen sunscreen spf 40'
    );
  });

  it('drops marketing noise words from tokens', () => {
    expect(tokenizeName('NEW! Travel Size Mineral Sunscreen SPF 40 with Vitamin E')).toEqual([
      'mineral',
      'sunscreen',
      'spf',
      '40',
      'vitamin',
      'e'
    ]);
  });
});

describe('diceCoefficient', () => {
  it('returns 1 for identical token sets', () => {
    expect(diceCoefficient(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns 0 for disjoint token sets', () => {
    expect(diceCoefficient(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns intermediate value for partial overlap', () => {
    const score = diceCoefficient(['glazing', 'milk'], ['glazing', 'milk', 'essence']);
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThan(1);
  });
});

describe('extractSizes / sizeSimilarity', () => {
  it('extracts ml and oz', () => {
    expect(extractSizes('1.7 oz / 50 ml')).toMatchObject({ ml: 50, oz: 1.7 });
  });

  it('back-fills oz when only ml given', () => {
    const sizes = extractSizes('150 mL');
    expect(sizes.ml).toBe(150);
    expect(sizes.oz).toBeCloseTo(150 / 29.5735, 1);
  });

  it('treats missing size on either side as neutral 0.5', () => {
    expect(sizeSimilarity('50 ml', '')).toBe(0.5);
    expect(sizeSimilarity('', '50 ml')).toBe(0.5);
  });

  it('returns 1 for the same size', () => {
    expect(sizeSimilarity('50 ml', '50 ml')).toBe(1);
  });

  it('returns less than 1 for clear size mismatch', () => {
    expect(sizeSimilarity('50 ml', '100 ml')).toBe(0.5);
    expect(sizeSimilarity('1.7 oz', '3.4 oz')).toBe(0.5);
  });
});

describe('extractVariantClues / variantCompatibility', () => {
  it('captures SPF and fragrance-free clues', () => {
    expect(extractVariantClues('Sunscreen SPF 40 Fragrance Free')).toMatchObject({
      spf: '40',
      fragranceFree: true
    });
  });

  it('penalizes mismatched SPF values', () => {
    const score = variantCompatibility('Sunscreen SPF 40', 'Sunscreen SPF 50');
    expect(score).toBeLessThan(0.7);
  });

  it('treats missing variant on one side as partial credit', () => {
    const score = variantCompatibility('Sunscreen SPF 40', 'Sunscreen');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 1 when both sides agree on variant or there are no variant clues', () => {
    expect(variantCompatibility('Hydrating Cream', 'Hydrating Cream')).toBe(1);
    expect(variantCompatibility('Sunscreen SPF 40', 'Sunscreen SPF 40')).toBe(1);
  });
});

describe('categoryCompatibility', () => {
  it('returns 1 for same group, 0 for different group', () => {
    expect(categoryCompatibility('Sunscreen', 'Face Sunscreen')).toBe(1);
    expect(categoryCompatibility('Cleanser', 'Sunscreen')).toBe(0);
  });

  it('returns neutral 0.6 when category is missing', () => {
    expect(categoryCompatibility('', '')).toBeCloseTo(0.6);
    expect(categoryCompatibility('Sunscreen', '')).toBeCloseTo(0.6);
  });
});

describe('computeMatchConfidence', () => {
  const amazon = {
    retailer: 'amazon',
    brand: 'Supergoop!',
    name: 'Supergoop! Mineral Unseen Sunscreen SPF 40, 1.7 fl oz',
    sizeRaw: '1.7 fl oz',
    category: 'Beauty - Sunscreen'
  };

  it('produces an auto-match for the same product across retailers', () => {
    const sephora = {
      retailer: 'sephora',
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 40',
      sizeRaw: '1.7 oz / 50 ml',
      category: 'Sunscreen'
    };
    const result = computeMatchConfidence(amazon, sephora);
    expect(result.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.AUTO);
    expect(result.decision).toBe('auto_match');
    expect(result.reasons).toEqual(expect.arrayContaining(['brand_exact']));
  });

  it('falls into needs_review when SPF differs but title is otherwise close', () => {
    const sephora = {
      retailer: 'sephora',
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 50',
      sizeRaw: '1.7 oz / 50 ml',
      category: 'Sunscreen'
    };
    const result = computeMatchConfidence(amazon, sephora);
    expect(result.decision).not.toBe('auto_match');
    expect(result.warnings.some((w) => w.startsWith('variant_mismatch'))).toBe(true);
  });

  it('rejects when brand is wrong, even if name is similar', () => {
    const sephora = {
      retailer: 'sephora',
      brand: 'CeraVe',
      name: 'Mineral Unseen Sunscreen SPF 40',
      sizeRaw: '1.7 oz / 50 ml',
      category: 'Sunscreen'
    };
    const result = computeMatchConfidence(amazon, sephora);
    expect(result.decision).not.toBe('auto_match');
    expect(result.warnings).toContain('brand_mismatch');
  });

  it('handles missing input gracefully', () => {
    const result = computeMatchConfidence(null, null);
    expect(result.decision).toBe('rejected');
    expect(result.warnings).toContain('missing_input');
  });

  it('exposes a per-signal breakdown', () => {
    const sephora = {
      retailer: 'sephora',
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 40',
      sizeRaw: '1.7 oz / 50 ml',
      category: 'Sunscreen'
    };
    const result = computeMatchConfidence(amazon, sephora);
    expect(result.breakdown).toEqual(
      expect.objectContaining({
        brand: 1,
        name: expect.any(Number),
        size: expect.any(Number),
        category: expect.any(Number),
        variant: expect.any(Number)
      })
    );
  });
});

describe('sizeGroupKey', () => {
  it('snaps small ml to nearest 5 and large ml to nearest 25', () => {
    expect(sizeGroupKey({ sizeMl: 47 })).toBe('45ml');
    expect(sizeGroupKey({ sizeMl: 50 })).toBe('50ml');
    expect(sizeGroupKey({ sizeMl: 50.27 })).toBe('50ml');
    expect(sizeGroupKey({ sizeMl: 240 })).toBe('250ml');
    expect(sizeGroupKey({ sizeMl: 1000 })).toBe('1000ml');
  });

  it('uses oz fallback when ml is missing', () => {
    expect(sizeGroupKey({ sizeOz: 1.7 })).toBe('1.5oz');
    expect(sizeGroupKey({ sizeOz: 8 })).toBe('8oz');
  });

  it('returns nosize when no size info is available', () => {
    expect(sizeGroupKey({})).toBe('nosize');
    expect(sizeGroupKey({ sizeMl: null, sizeOz: null })).toBe('nosize');
  });

  it('appends a variant suffix when mini/jumbo/refill/travel are present', () => {
    expect(sizeGroupKey({ sizeMl: 15, sizeRaw: '15 ml mini' })).toBe('15ml-mini');
    expect(sizeGroupKey({ sizeMl: 100, sizeRaw: 'jumbo refill' })).toBe('100ml-jumbo-refill');
  });
});

describe('canonicalProductKey', () => {
  it('produces a stable key from normalized brand + name + size group', () => {
    const key = canonicalProductKey({
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 40, 1.7 fl oz',
      sizeMl: 50,
      sizeOz: 1.7,
      sizeRaw: '1.7 oz / 50 ml'
    });
    expect(key).toBe('supergoop--mineral-unseen-sunscreen-spf-40--50ml');
  });

  it('collapses ml/oz noise into the same bucket so the same SKU lands on one slug', () => {
    const fromSephora = canonicalProductKey({
      brand: 'Supergoop!',
      name: 'Mineral Unseen Sunscreen SPF 40',
      sizeMl: 50,
      sizeOz: 1.7,
      sizeRaw: '1.7 oz / 50 ml'
    });
    const fromAmazon = canonicalProductKey({
      brand: 'Supergoop!',
      name: 'Supergoop! Mineral Unseen Sunscreen SPF 40, 1.7 fl oz',
      sizeMl: 50.27,
      sizeOz: 1.7,
      sizeRaw: '1.7 fl oz'
    });
    expect(fromSephora).toBe(fromAmazon);
  });

  it('keeps regular and mini variants on different slugs', () => {
    const regular = canonicalProductKey({
      brand: 'Drunk Elephant',
      name: 'Lala Retro Whipped Cream',
      sizeMl: 50,
      sizeRaw: '50 ml'
    });
    const mini = canonicalProductKey({
      brand: 'Drunk Elephant',
      name: 'Lala Retro Whipped Cream',
      sizeMl: 15,
      sizeRaw: '15 ml mini'
    });
    expect(regular).not.toBe(mini);
    expect(mini).toMatch(/-mini$/);
  });

  it('strips size text from the name component but keeps it in the size component', () => {
    const key = canonicalProductKey({
      brand: 'NoNameBrand',
      name: 'Generic Vitamin C Serum 30 ml',
      sizeMl: 30,
      sizeRaw: '30 ml'
    });
    expect(key).toBe('nonamebrand--generic-vitamin-c-serum--30ml');
  });

  it('stays retailer-neutral: same canonical key from Sephora and Ulta payloads', () => {
    const sephora = canonicalProductKey({
      brand: 'The Ordinary',
      name: 'Niacinamide 10% + Zinc 1% Serum',
      sizeMl: 30
    });
    const ulta = canonicalProductKey({
      brand: 'the ordinary',
      name: 'Niacinamide 10 Plus Zinc 1 Serum',
      sizeMl: 30
    });
    // Different name strings but the size bucket + brand alias keep them on
    // the same canonical product.
    expect(sephora.startsWith('the-ordinary--')).toBe(true);
    expect(ulta.startsWith('the-ordinary--')).toBe(true);
    expect(sephora.endsWith('--30ml')).toBe(true);
    expect(ulta.endsWith('--30ml')).toBe(true);
  });

  it('falls back to a synthetic key when both brand and name are empty', () => {
    expect(canonicalProductKey({})).toMatch(/^product-/);
  });

  it('appends nosize when size info is unknown', () => {
    expect(canonicalProductKey({ brand: 'A', name: 'Mystery Product' })).toBe('a--mystery-product--nosize');
  });
});

describe('rankCandidates', () => {
  it('returns the closest candidate first', () => {
    const amazon = {
      retailer: 'amazon',
      brand: 'The Ordinary',
      name: 'The Ordinary Niacinamide 10% + Zinc 1% Serum 30 ml',
      sizeRaw: '30 ml',
      category: 'serum'
    };
    const candidates = [
      {
        id: 1,
        retailer: 'sephora',
        brand: 'CeraVe',
        name: 'Hydrating Facial Cleanser',
        sizeRaw: '236 ml',
        category: 'cleanser'
      },
      {
        id: 2,
        retailer: 'sephora',
        brand: 'The Ordinary',
        name: 'Niacinamide 10% + Zinc 1% Serum',
        sizeRaw: '30 ml',
        category: 'serum'
      },
      {
        id: 3,
        retailer: 'ulta',
        brand: 'The Ordinary',
        name: 'Niacinamide 10 Plus Zinc 1 Serum',
        sizeRaw: '60 ml',
        category: 'serum'
      }
    ];
    const ranked = rankCandidates(amazon, candidates);
    expect(ranked[0].candidate.id).toBe(2);
    expect(ranked[0].decision).toBe('auto_match');
    expect(ranked[1].candidate.id).toBe(3);
    expect(ranked[2].candidate.id).toBe(1);
    expect(ranked[2].decision).toBe('rejected');
  });
});
