import { describe, expect, it } from 'vitest';
import {
  cleanText,
  clampPrice,
  clampRating,
  computeQualityScore,
  normalizeArrayOfStrings,
  normalizeBrand,
  normalizeImageUrls,
  normalizeNamedItems,
  parseSize,
  REQUIRED_FIELDS,
  SEPHORA_SCHEMA_VERSION,
  standardizeProduct,
  validateRequired
} from './sephoraSchema.mjs';

describe('cleanText', () => {
  it('strips html tags and decodes entities', () => {
    expect(cleanText('<b>Foo&amp;Bar</b>')).toBe('Foo&Bar');
  });

  it('collapses whitespace and trims', () => {
    expect(cleanText('  a   b\n c ')).toBe('a b c');
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(cleanText('   ')).toBe(null);
    expect(cleanText('<br/>')).toBe(null);
    expect(cleanText(null)).toBe(null);
    expect(cleanText(undefined)).toBe(null);
  });

  it('coerces finite numbers to strings', () => {
    expect(cleanText(42)).toBe('42');
  });
});

describe('normalizeBrand', () => {
  it('replaces smart quotes with straight quotes', () => {
    expect(normalizeBrand('Kiehl\u2019s Since 1851')).toBe("Kiehl's Since 1851");
  });

  it('returns null for empty input', () => {
    expect(normalizeBrand('')).toBe(null);
  });
});

describe('clampPrice / clampRating', () => {
  it('rejects negative or non-finite prices', () => {
    expect(clampPrice(-1)).toBe(null);
    expect(clampPrice(NaN)).toBe(null);
    expect(clampPrice('abc')).toBe(null);
  });

  it('rounds price to two decimals', () => {
    expect(clampPrice('40.005')).toBe(40.01);
    expect(clampPrice('40')).toBe(40);
  });

  it('clamps rating to 0..5 range', () => {
    expect(clampRating(4.567)).toBe(4.6);
    expect(clampRating(6)).toBe(null);
    expect(clampRating(-0.1)).toBe(null);
  });
});

describe('parseSize', () => {
  it('extracts both ml and oz from combined sizes', () => {
    expect(parseSize('1.7 oz / 50 ml')).toEqual({ raw: '1.7 oz / 50 ml', ml: 50, oz: 1.7 });
  });

  it('handles ml only', () => {
    expect(parseSize('150 mL')).toEqual({ raw: '150 mL', ml: 150, oz: null });
  });

  it('handles fl oz', () => {
    expect(parseSize('2 fl oz')).toEqual({ raw: '2 fl oz', ml: null, oz: 2 });
  });

  it('returns nulls for non-numeric size', () => {
    expect(parseSize('Standard size')).toEqual({ raw: 'Standard size', ml: null, oz: null });
  });

  it('returns all-null payload for falsy input', () => {
    expect(parseSize(null)).toEqual({ raw: null, ml: null, oz: null });
  });
});

describe('normalizeImageUrls', () => {
  it('dedupes urls and rejects non-http schemes', () => {
    const urls = normalizeImageUrls([
      'https://x.com/a.jpg',
      'https://x.com/a.jpg',
      'ftp://nope.jpg',
      '//cdn.example.com/b.jpg',
      ''
    ]);
    expect(urls).toEqual(['https://x.com/a.jpg', 'https://cdn.example.com/b.jpg']);
  });
});

describe('normalizeArrayOfStrings', () => {
  it('trims, dedupes, and drops empty entries', () => {
    expect(normalizeArrayOfStrings(['Dry', ' Dry ', 'Combination', null, ''])).toEqual([
      'Dry',
      'Combination'
    ]);
  });
});

describe('normalizeNamedItems', () => {
  it('keeps {name, description} and dedupes by name', () => {
    const items = normalizeNamedItems([
      { name: 'Squalane', description: 'Hydrates' },
      { name: 'squalane', description: 'duplicate' },
      { name: ' Niacinamide ', description: '<i>brightens</i>' }
    ]);
    expect(items).toEqual([
      { name: 'Squalane', description: 'Hydrates' },
      { name: 'Niacinamide', description: 'brightens' }
    ]);
  });
});

describe('validateRequired / computeQualityScore', () => {
  it('flags missing required fields', () => {
    const { ok, missing } = validateRequired({ sourceItemId: 'abc' });
    expect(ok).toBe(false);
    expect(missing).toEqual(expect.arrayContaining(REQUIRED_FIELDS.filter((f) => f !== 'sourceItemId')));
  });

  it('returns higher quality score for fully populated product', () => {
    const low = computeQualityScore({ sourceItemId: '1' });
    const high = computeQualityScore({
      sourceItemId: '1',
      name: 'A',
      brand: 'B',
      priceAmount: 1,
      ratingValue: 5,
      reviewCount: 10,
      size: '1 oz',
      imageUrls: ['https://x/a.jpg'],
      highlights: ['x'],
      whatItIs: 'cream',
      ingredientsText: 'water',
      skinTypes: ['Dry'],
      skincareConcerns: ['Dryness']
    });
    expect(high).toBeGreaterThan(low);
    expect(high).toBe(100);
  });
});

describe('standardizeProduct', () => {
  const raw = {
    source: 'sephora',
    sourceItemId: ' 12345 ',
    sourceUrl: 'https://www.sephora.com/product/P12345',
    name: '<b>Sample Cream</b>',
    brand: 'Kiehl\u2019s Since 1851',
    priceAmount: '40.00',
    priceCurrency: null,
    ratingValue: 4.6,
    reviewCount: '8200',
    size: '1.7 oz / 50 ml',
    imageUrls: ['https://x.com/a.jpg', 'https://x.com/a.jpg'],
    skinTypes: ['Dry', 'Dry', 'Combination'],
    inciIngredients: ['Water/Aqua/Eau', 'Glycerin'],
    highlightedIngredients: [{ name: 'Squalane', description: 'Hydrates' }]
  };

  it('produces a standardized product with current schema metadata', () => {
    const std = standardizeProduct(raw);
    expect(std.schemaVersion).toBe(SEPHORA_SCHEMA_VERSION);
    expect(std.schemaVersion).toBeGreaterThanOrEqual(2);
    expect(std.sourceItemId).toBe('12345');
    expect(std.name).toBe('Sample Cream');
    expect(std.brand).toBe("Kiehl's Since 1851");
    expect(std.priceAmount).toBe(40);
    expect(std.priceCurrency).toBe('USD');
    expect(std.sizeMl).toBe(50);
    expect(std.sizeOz).toBe(1.7);
    expect(std.imageUrls).toEqual(['https://x.com/a.jpg']);
    expect(std.skinTypes).toEqual(['Dry', 'Combination']);
    expect(std.warnings).toEqual([]);
    expect(std.qualityScore).toBeGreaterThan(50);
    expect(typeof std.crawledAt).toBe('string');
  });

  it('is idempotent — re-running yields the same shape', () => {
    const once = standardizeProduct(raw);
    const twice = standardizeProduct(once);
    expect(twice.name).toBe(once.name);
    expect(twice.brand).toBe(once.brand);
    expect(twice.priceAmount).toBe(once.priceAmount);
    expect(twice.imageUrls).toEqual(once.imageUrls);
    expect(twice.warnings).toEqual(once.warnings);
  });

  it('surfaces warnings for missing required fields', () => {
    const std = standardizeProduct({ sourceItemId: 'xyz' });
    expect(std.warnings).toEqual(
      expect.arrayContaining(['missing:name', 'missing:brand', 'missing:priceAmount'])
    );
    expect(std.qualityScore).toBeLessThan(50);
  });

  it('throws on non-object input', () => {
    expect(() => standardizeProduct(null)).toThrow();
    expect(() => standardizeProduct('foo')).toThrow();
  });
});
