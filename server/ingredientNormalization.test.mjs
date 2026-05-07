import { describe, expect, it } from 'vitest';
import {
  canonicalIngredientName,
  ingredientListConfidence,
  normalizeIngredientKey,
  parseIngredientsList,
  pickCanonicalIngredientList
} from './ingredientNormalization.mjs';

describe('normalizeIngredientKey', () => {
  it('lowercases and removes parentheses + punctuation', () => {
    expect(normalizeIngredientKey('Tocopheryl Acetate (Vitamin E)')).toBe('tocopheryl acetate');
    expect(normalizeIngredientKey('Sodium Hyaluronate*')).toBe('sodium hyaluronate');
  });

  it('returns empty string for non-strings', () => {
    expect(normalizeIngredientKey(null)).toBe('');
    expect(normalizeIngredientKey(undefined)).toBe('');
  });
});

describe('canonicalIngredientName', () => {
  it('maps known aliases to canonical names', () => {
    expect(canonicalIngredientName('Water/Aqua/Eau')).toBe('water');
    expect(canonicalIngredientName('Sodium Hyaluronate')).toBe('hyaluronic acid');
    expect(canonicalIngredientName('Vitamin C')).toBe('ascorbic acid');
    expect(canonicalIngredientName('Niacinamide')).toBe('niacinamide');
  });

  it('falls back to normalized key for unknown ingredients', () => {
    expect(canonicalIngredientName('Made Up Ingredient')).toBe('made up ingredient');
    // dashes are preserved because real INCI tokens like "C12-15 Alkyl Benzoate" use them
    expect(canonicalIngredientName('Made-Up Ingredient')).toBe('made-up ingredient');
  });
});

describe('parseIngredientsList', () => {
  it('parses a comma-separated INCI list and dedupes by canonical name', () => {
    const text =
      'Water/Aqua/Eau, Glycerin, Sodium Hyaluronate, Hyaluronate, Niacinamide, Tocopheryl Acetate.';
    const parsed = parseIngredientsList(text);
    expect(parsed.map((p) => p.canonical)).toEqual([
      'water',
      'glycerin',
      'hyaluronic acid',
      'niacinamide',
      'tocopherol'
    ]);
    expect(parsed[0].position).toBe(1);
    expect(parsed.at(-1).position).toBe(parsed.length);
  });

  it('strips the disclaimer footer', () => {
    const text = `Ingredients: Water, Glycerin, Phenoxyethanol. The list of ingredients is subject to change. Please consult the packaging.`;
    const parsed = parseIngredientsList(text);
    expect(parsed.map((p) => p.canonical)).toEqual(['water', 'glycerin', 'phenoxyethanol']);
  });

  it('returns empty array for empty input', () => {
    expect(parseIngredientsList('')).toEqual([]);
    expect(parseIngredientsList('   ')).toEqual([]);
  });

  it('keeps the original token in `raw` for traceability', () => {
    const parsed = parseIngredientsList('Water/Aqua/Eau, Glycerin');
    expect(parsed[0].raw).toBe('Water/Aqua/Eau');
  });
});

describe('ingredientListConfidence', () => {
  it('scores known skincare staples in the top positions higher', () => {
    const longList = parseIngredientsList(
      'Water, Glycerin, Butylene Glycol, Niacinamide, Sodium Hyaluronate, Phenoxyethanol, Citric Acid, Tocopherol, Panthenol, Allantoin, Squalane, Carbomer'
    );
    const high = ingredientListConfidence(longList, 'long source text content');
    expect(high).toBeGreaterThan(0.7);

    const shortList = parseIngredientsList('Mystery Compound, Marketing Words');
    const low = ingredientListConfidence(shortList, '');
    expect(low).toBeLessThan(0.5);
  });

  it('returns 0 for empty input', () => {
    expect(ingredientListConfidence([], '')).toBe(0);
  });
});

describe('pickCanonicalIngredientList', () => {
  it('returns the highest-confidence list and warns on disagreement', () => {
    const sephora = parseIngredientsList(
      'Water, Glycerin, Butylene Glycol, Niacinamide, Sodium Hyaluronate, Phenoxyethanol, Citric Acid'
    );
    const ulta = parseIngredientsList('Water, Glycerin, Niacinamide');
    const brand = parseIngredientsList('Avobenzone, Homosalate, Octisalate, Octocrylene');

    const { chosen, warnings } = pickCanonicalIngredientList([
      { source: 'sephora', text: 'long list', parsed: sephora },
      { source: 'ulta', text: 'short list', parsed: ulta },
      { source: 'brand_official', text: 'sunscreen list', parsed: brand }
    ]);

    expect(chosen.source).toBe('sephora');
    expect(warnings.some((w) => w.startsWith('ingredient_disagreement'))).toBe(true);
  });

  it('returns null when no source provides a parseable list', () => {
    const { chosen, warnings } = pickCanonicalIngredientList([
      { source: 'sephora', parsed: [] },
      { source: 'ulta', parsed: [] }
    ]);
    expect(chosen).toBe(null);
    expect(warnings).toEqual([]);
  });
});
