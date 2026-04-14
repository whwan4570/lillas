import type { SkinTestAnswers } from '../app/types';

export interface UserProfile {
  skinWeights: Record<string, number>;
  concernWeights: Record<string, number>;
  sensitivityLevel: number;
  preferredIngredients: string[];
  avoidIngredients: string[];
  preferredBrands: string[];
  budget: 'budget' | 'mid' | 'luxury' | 'any';
  routine: 'minimal' | 'moderate' | 'extensive' | '';
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  rating?: number;
  reviews?: number;
  ingredients: string[];
  benefits?: string[];
  tags?: string[];
}

export interface IngredientMeta {
  name: string;
  skinBenefits?: string[];
  concernBenefits?: string[];
  avoidFor?: string[];
  quality?: 'best' | 'good' | 'average' | 'poor';
}

export interface ScoreBreakdown {
  skinTypeScore: number;
  concernScore: number;
  sensitivityScore: number;
  reviewScore: number;
  preferredIngredientScore: number;
  avoidPenalty: number;
  budgetScore: number;
  brandScore: number;
}

export function buildUserProfile(answers: SkinTestAnswers): UserProfile {
  const skinWeights: Record<string, number> = {
    dry: 0,
    oily: 0,
    combination: 0,
    normal: 0,
    sensitive: 0
  };

  if (answers.skinType) {
    skinWeights[answers.skinType] = 1.0;
  }

  if (answers.skinType === 'combination') {
    skinWeights.oily = 0.6;
    skinWeights.dry = 0.6;
  }

  if (answers.sensitivity === 'somewhat') {
    skinWeights.sensitive = Math.max(skinWeights.sensitive, 0.5);
  }
  if (answers.sensitivity === 'very') {
    skinWeights.sensitive = Math.max(skinWeights.sensitive, 1.0);
  }

  const concernWeights: Record<string, number> = {};
  answers.concerns.forEach((c) => {
    concernWeights[c] = 1.0;
  });

  const sensitivityLevel =
    answers.sensitivity === 'very' ? 1 : answers.sensitivity === 'somewhat' ? 0.5 : 0;

  return {
    skinWeights,
    concernWeights,
    sensitivityLevel,
    preferredIngredients: answers.preferredIngredients,
    avoidIngredients: answers.avoidIngredients,
    preferredBrands: answers.preferredBrands,
    budget: (answers.budget || 'any') as UserProfile['budget'],
    routine: (answers.routine || '') as UserProfile['routine']
  };
}

export function computeSkinTypeScore(
  product: Product,
  ingredientMap: Record<string, IngredientMeta>,
  user: UserProfile
) {
  let score = 0;
  for (const rawIng of product.ingredients) {
    const ing = rawIng.toLowerCase();
    const meta = ingredientMap[ing];
    if (!meta?.skinBenefits) continue;
    for (const skinType of meta.skinBenefits) {
      score += user.skinWeights[skinType] ?? 0;
    }
  }
  return score;
}

export function computeConcernScore(
  product: Product,
  ingredientMap: Record<string, IngredientMeta>,
  user: UserProfile
) {
  let score = 0;
  for (const rawIng of product.ingredients) {
    const ing = rawIng.toLowerCase();
    const meta = ingredientMap[ing];
    if (!meta?.concernBenefits) continue;
    for (const concern of meta.concernBenefits) {
      score += user.concernWeights[concern] ?? 0;
    }
  }
  return score;
}

export function computeSensitivityPenalty(
  product: Product,
  ingredientMap: Record<string, IngredientMeta>,
  user: UserProfile
) {
  let penalty = 0;
  for (const rawIng of product.ingredients) {
    const ing = rawIng.toLowerCase();
    const meta = ingredientMap[ing];
    if (!meta?.avoidFor) continue;
    if (meta.avoidFor.includes('sensitive')) {
      penalty += user.sensitivityLevel * 2.0;
    }
  }
  return penalty;
}

export function computeIngredientPreferenceScore(product: Product, user: UserProfile) {
  const normalized = product.ingredients.map((x) => x.toLowerCase());
  let score = 0;
  let penalty = 0;

  for (const ing of user.preferredIngredients) {
    if (normalized.includes(ing.toLowerCase())) score += 2.0;
  }
  for (const ing of user.avoidIngredients) {
    if (normalized.includes(ing.toLowerCase())) penalty += 3.0;
  }

  return { score, penalty };
}

export function computeBudgetScore(price: number, budget: UserProfile['budget']) {
  if (budget === 'any') return 1;
  if (budget === 'budget') return price < 25 ? 2 : 0;
  if (budget === 'mid') return price >= 25 && price <= 50 ? 2 : 0.5;
  if (budget === 'luxury') return price > 50 ? 2 : 0.5;
  return 0;
}

export function computeBrandScore(product: Product, user: UserProfile) {
  return user.preferredBrands.includes(product.brand) ? 1.5 : 0;
}

export function computeReviewScore(product: Product) {
  const ratingNorm = Math.min(1, Math.max(0, (product.rating ?? 0) / 5));
  const reviewsNorm = Math.min(1, Math.log10((product.reviews ?? 0) + 1) / 4);
  return (ratingNorm * 0.7 + reviewsNorm * 0.3) * 2;
}

export function scoreProduct(
  product: Product,
  ingredientMap: Record<string, IngredientMeta>,
  user: UserProfile
) {
  const skinTypeScore = computeSkinTypeScore(product, ingredientMap, user);
  const concernScore = computeConcernScore(product, ingredientMap, user);
  const sensitivityPenalty = computeSensitivityPenalty(product, ingredientMap, user);
  const pref = computeIngredientPreferenceScore(product, user);
  const budgetScore = computeBudgetScore(product.price, user.budget);
  const brandScore = computeBrandScore(product, user);
  const reviewScore = computeReviewScore(product);
  const sensitivityScore = Math.max(0, 2 - sensitivityPenalty);

  const finalScore =
    skinTypeScore * 0.3 +
    concernScore * 0.25 +
    sensitivityScore * 0.2 +
    reviewScore * 0.1 +
    pref.score * 0.1 +
    brandScore * 0.05 +
    budgetScore * 0.1 -
    pref.penalty;

  return {
    finalScore,
    breakdown: {
      skinTypeScore,
      concernScore,
      sensitivityScore,
      reviewScore,
      preferredIngredientScore: pref.score,
      avoidPenalty: pref.penalty,
      budgetScore,
      brandScore
    } as ScoreBreakdown
  };
}

export function explainProduct(
  product: Product,
  ingredientMap: Record<string, IngredientMeta>,
  user: UserProfile
) {
  const reasons: string[] = [];
  const warnings: string[] = [];

  for (const rawIng of product.ingredients) {
    const ing = rawIng.toLowerCase();
    const meta = ingredientMap[ing];
    if (!meta) continue;

    if (meta.skinBenefits) {
      for (const skinType of meta.skinBenefits) {
        if ((user.skinWeights[skinType] ?? 0) > 0.5) {
          reasons.push(`Contains ${rawIng}, which supports ${skinType} skin`);
          break;
        }
      }
    }

    if (meta.concernBenefits) {
      for (const concern of meta.concernBenefits) {
        if ((user.concernWeights[concern] ?? 0) > 0.5) {
          reasons.push(`Contains ${rawIng}, which may help with ${concern}`);
          break;
        }
      }
    }

    if (meta.avoidFor?.includes('sensitive') && user.sensitivityLevel > 0) {
      warnings.push(`${rawIng} may irritate sensitive skin`);
    }

    if (user.avoidIngredients.includes(ing)) {
      warnings.push(`Contains avoided ingredient: ${rawIng}`);
    }
  }

  return {
    reasons: [...new Set(reasons)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 3)
  };
}

export const ingredientMap: Record<string, IngredientMeta> = {
  'hyaluronic acid': {
    name: 'Hyaluronic Acid',
    skinBenefits: ['dry', 'sensitive'],
    concernBenefits: ['hydration'],
    quality: 'best'
  },
  niacinamide: {
    name: 'Niacinamide',
    skinBenefits: ['oily', 'combination', 'sensitive'],
    concernBenefits: ['texture', 'pores', 'pigmentation'],
    quality: 'best'
  },
  ceramide: {
    name: 'Ceramide',
    skinBenefits: ['dry', 'sensitive'],
    concernBenefits: ['hydration', 'redness'],
    quality: 'best'
  },
  centella: {
    name: 'Centella',
    skinBenefits: ['sensitive'],
    concernBenefits: ['redness'],
    quality: 'good'
  },
  'vitamin c': {
    name: 'Vitamin C',
    concernBenefits: ['pigmentation', 'dullness'],
    quality: 'good'
  },
  fragrance: { name: 'Fragrance', avoidFor: ['sensitive'], quality: 'poor' },
  alcohol: { name: 'Alcohol', avoidFor: ['sensitive'], quality: 'average' },
  'essential oil': { name: 'Essential Oil', avoidFor: ['sensitive'], quality: 'average' }
};

