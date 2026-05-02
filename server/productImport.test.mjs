import { describe, expect, it } from 'vitest';
import { parseSephoraProductText } from './productImport.mjs';

const sephoraSample = `
Skincare
Sunscreen
Face Sunscreen
Supergoop!
Mineral Unseen Sunscreen SPF 40
378
|
Ask a question
|
21.4K
Highly rated by customers for: blending, sun protection, satisfaction

$40.00
get it for $38.00 (5% off) with Auto-Replenish

Supergoop! Mineral Unseen Sunscreen SPF 40 in 1.7 oz / 50 ml Image 2
Video
Supergoop! Mineral Unseen Sunscreen SPF 40 in 1.7 oz / 50 ml Image 3

Size: 1.7 oz / 50 ml

Highlights
Fragrance Free
Fragrance Free
Best for Oily, Combo, Normal Skin
Best for Oily, Combo, Normal Skin

About the Product
Item 2773299

Only at Sephora
What it is: A potent, nutrient-rich essence with a milky texture that leaves skin feeling hydrated and glowy while boosting the skin barrier over time.

Skin Type: Normal, Dry, and Combination

Skincare Concerns: Dullness, Dryness, and Redness

Formulation: Liquid

Highlighted Ingredients:
- Ceramide Trio (NP, AP, EOP): Moisturizes, smooths skin, and helps reinforce skin’s natural barrier.
- Mineral Complex: Magnesium, Zinc, & Copper help defend against free radicals for smooth skin.
- Vitamin E: An antioxidant that helps protect against external stressors.

Ingredient Callouts: This product is vegan and cruelty-free.

What Else You Need to Know: Glazing Milk is the essential prep step for your skincare routine.

Clinical Results: Based on a 31-subject consumer perception study after 1 week of use:
- 97% agreed it leaves skin dewy, radiant, and glowing
- 90% agreed skin feels hydrated all day

Clean at Sephora
Clean at Sephora is our commitment to offering effective products without certain ingredients.

Show less

Ingredients
- Ceramide Trio (NP, AP, EOP): Moisturizes, smooths skin, and helps reinforce skin’s natural barrier.

Water/Aqua/Eau, C12-15 Alkyl Benzoate, Coconut Alkanes, Glycerin, Tocopheryl Acetate, Sodium Hyaluronate, Ceramide NP, Ceramide AP, Ceramide EOP, Beta-Glucan, Zinc Gluconate, Phenoxyethanol, Citric Acid

The list of ingredients is subject to change. Please consult the packaging of the product purchased.

Questions & Answers (25)
Ratings & Reviews (378)
Summary
5
4
3
2
1
4.3
378 Reviews*
82%
Recommended
Pros Mentioned
blending (11)
sun protection (9)
satisfaction (22)
Cons Mentioned
disappointing (6)
texture (13)
`;

describe('parseSephoraProductText', () => {
  it('extracts Sephora product sections into structured fields', () => {
    const parsed = parseSephoraProductText(sephoraSample, {
      sourceUrl: 'https://www.sephora.com/product/example'
    });

    expect(parsed.source).toBe('sephora');
    expect(parsed.sourceItemId).toBe('2773299');
    expect(parsed.name).toBe('Mineral Unseen Sunscreen SPF 40');
    expect(parsed.brand).toBe('Supergoop!');
    expect(parsed.priceAmount).toBe(40);
    expect(parsed.autoReplenishPriceAmount).toBe(38);
    expect(parsed.ratingValue).toBe(4.3);
    expect(parsed.reviewCount).toBe(378);
    expect(parsed.questionCount).toBe(25);
    expect(parsed.lovesCount).toBe(21400);
    expect(parsed.recommendedPercent).toBe(82);
    expect(parsed.size).toBe('1.7 oz / 50 ml');
    expect(parsed.imageLabels).toEqual(
      expect.arrayContaining([
        'Supergoop! Mineral Unseen Sunscreen SPF 40 in 1.7 oz / 50 ml Image 2',
        'Video'
      ])
    );
    expect(parsed.highlights).toEqual(expect.arrayContaining(['Fragrance Free', 'Best for Oily, Combo, Normal Skin']));
    expect(parsed.exclusiveLabel).toBe('Only at Sephora');
    expect(parsed.skinTypes).toEqual(['Normal', 'Dry', 'Combination']);
    expect(parsed.skincareConcerns).toEqual(['Dullness', 'Dryness', 'Redness']);
    expect(parsed.formulation).toBe('Liquid');
    expect(parsed.highlightedIngredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Ceramide Trio (NP, AP, EOP)' }),
        expect.objectContaining({ name: 'Mineral Complex' }),
        expect.objectContaining({ name: 'Vitamin E' })
      ])
    );
    expect(parsed.clinicalResults).toHaveLength(3);
    expect(parsed.inciIngredients).toEqual(
      expect.arrayContaining(['Water/Aqua/Eau', 'Glycerin', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP'])
    );
  });
});
