import { products } from './products';

export interface SeedCatalogProduct {
  id: number;
  sourceId: string;
  name: string;
  brand: string;
  price: number;
  rating: number;
  reviews: number;
  matchScore: number;
  image?: string;
  category: string;
  categoryLabel: string;
  keyIngredients: string[];
  benefits: string[];
  cautionIngredients: string[];
  sites: { name: string; price: number; rating: number }[];
}

const categoryImageMap: Record<string, string> = {
  moisturizer: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&h=800&fit=crop',
  serum: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=800&h=800&fit=crop',
  cleanser: 'https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=800&h=800&fit=crop',
  sunscreen: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&h=800&fit=crop',
  toner: 'https://images.unsplash.com/photo-1556228852-80c7ca4b1f40?w=800&h=800&fit=crop',
  essence: 'https://images.unsplash.com/photo-1625772452859-1c03d5bf1137?w=800&h=800&fit=crop',
  mask: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800&h=800&fit=crop',
  treatment: 'https://images.unsplash.com/photo-1571875257727-256c39da42af?w=800&h=800&fit=crop',
  exfoliator: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=800&h=800&fit=crop'
};

const cautionKeywords = ['fragrance', 'alcohol', 'essential oil', 'linalool', 'limonene'];

function titleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
    .join(' ');
}

let cache: SeedCatalogProduct[] | null = null;

export function getSeedCatalogProducts(): SeedCatalogProduct[] {
  if (cache) return cache;

  cache = products.map((p, idx) => {
    const cautionIngredients = p.ingredients.filter((ing) =>
      cautionKeywords.some((key) => ing.toLowerCase().includes(key))
    );
    const price = p.price;
    return {
      id: idx + 1,
      sourceId: p.id,
      name: p.name,
      brand: p.brand,
      price,
      rating: p.rating ?? 4.2,
      reviews: p.reviews ?? 1000,
      matchScore: Math.round(((p.rating ?? 4.2) / 5) * 100),
      image: categoryImageMap[p.category] ?? categoryImageMap.moisturizer,
      category: p.category,
      categoryLabel: titleCase(p.category),
      keyIngredients: p.ingredients.slice(0, 4),
      benefits: (p.tags ?? []).slice(0, 5),
      cautionIngredients,
      sites: [
        { name: 'Sephora', price: Number((price * 1.08).toFixed(2)), rating: p.rating ?? 4.2 },
        { name: 'Amazon', price: Number((price * 0.98).toFixed(2)), rating: p.rating ?? 4.2 },
        { name: 'Olive Young', price: Number((price * 1.02).toFixed(2)), rating: p.rating ?? 4.2 }
      ]
    };
  });

  return cache;
}

