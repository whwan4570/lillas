import type { Product } from '../lib/recommendationEngine';

/**
 * Curated skincare product DB (manual seed).
 * Recommendation should use this as primary source.
 */
export const products: Product[] = [
  {
    id: 'p001',
    name: 'Cicaplast Baume B5',
    brand: 'La Roche-Posay',
    category: 'moisturizer',
    price: 18.99,
    rating: 4.7,
    reviews: 6200,
    ingredients: ['glycerin', 'panthenol', 'madecassoside', 'shea butter', 'zinc'],
    tags: ['barrier', 'sensitive']
  },
  {
    id: 'p002',
    name: 'Toleriane Double Repair Face Moisturizer',
    brand: 'La Roche-Posay',
    category: 'moisturizer',
    price: 21.99,
    rating: 4.6,
    reviews: 5400,
    ingredients: ['glycerin', 'niacinamide', 'ceramide', 'dimethicone', 'squalane'],
    tags: ['barrier', 'daily']
  },
  {
    id: 'p003',
    name: 'Hydro Boost Water Gel',
    brand: 'Neutrogena',
    category: 'moisturizer',
    price: 16.49,
    rating: 4.5,
    reviews: 9800,
    ingredients: ['hyaluronic acid', 'glycerin', 'dimethicone', 'carbomer', 'fragrance'],
    tags: ['hydration', 'lightweight']
  },
  {
    id: 'p004',
    name: 'Moisturizing Cream',
    brand: 'CeraVe',
    category: 'moisturizer',
    price: 17.99,
    rating: 4.8,
    reviews: 15000,
    ingredients: ['ceramide', 'glycerin', 'cholesterol', 'hyaluronic acid', 'dimethicone'],
    tags: ['barrier', 'dry-skin']
  },
  {
    id: 'p005',
    name: 'PM Facial Moisturizing Lotion',
    brand: 'CeraVe',
    category: 'moisturizer',
    price: 15.99,
    rating: 4.7,
    reviews: 7700,
    ingredients: ['niacinamide', 'ceramide', 'hyaluronic acid', 'glycerin', 'dimethicone'],
    tags: ['night', 'barrier']
  },
  {
    id: 'p006',
    name: 'Ultra Facial Cream',
    brand: "Kiehl's",
    category: 'moisturizer',
    price: 39.0,
    rating: 4.6,
    reviews: 8200,
    ingredients: ['squalane', 'glycerin', 'glacial glycoprotein', 'dimethicone'],
    tags: ['hydration', 'daily']
  },
  {
    id: 'p007',
    name: 'The Water Cream',
    brand: 'Tatcha',
    category: 'moisturizer',
    price: 72.0,
    rating: 4.4,
    reviews: 6900,
    ingredients: ['glycerin', 'hyaluronic acid', 'green tea', 'fragrance', 'alcohol'],
    tags: ['luxury', 'lightweight']
  },
  {
    id: 'p008',
    name: 'Dramatically Different Moisturizing Gel',
    brand: 'Clinique',
    category: 'moisturizer',
    price: 33.0,
    rating: 4.5,
    reviews: 5000,
    ingredients: ['glycerin', 'hyaluronic acid', 'cucumber extract', 'silicone'],
    tags: ['oily-skin', 'daily']
  },
  {
    id: 'p009',
    name: 'Green Tea Seed Hyaluronic Serum',
    brand: 'Innisfree',
    category: 'serum',
    price: 28.0,
    rating: 4.5,
    reviews: 2100,
    ingredients: ['hyaluronic acid', 'green tea', 'glycerin', 'panthenol'],
    tags: ['hydration']
  },
  {
    id: 'p010',
    name: 'Niacinamide 10% + Zinc 1%',
    brand: 'The Ordinary',
    category: 'serum',
    price: 6.5,
    rating: 4.4,
    reviews: 19000,
    ingredients: ['niacinamide', 'zinc', 'glycerin', 'tamarind gum'],
    tags: ['pores', 'oil-control']
  },
  {
    id: 'p011',
    name: 'Hyaluronic Acid 2% + B5',
    brand: 'The Ordinary',
    category: 'serum',
    price: 9.9,
    rating: 4.3,
    reviews: 13000,
    ingredients: ['hyaluronic acid', 'panthenol', 'glycerin', 'propanediol'],
    tags: ['hydration', 'budget']
  },
  {
    id: 'p012',
    name: 'Buffet + Copper Peptides 1%',
    brand: 'The Ordinary',
    category: 'serum',
    price: 32.0,
    rating: 4.2,
    reviews: 2400,
    ingredients: ['peptide', 'copper peptide', 'hyaluronic acid', 'amino acids'],
    tags: ['anti-aging']
  },
  {
    id: 'p013',
    name: 'Advanced Snail 96 Mucin Power Essence',
    brand: 'COSRX',
    category: 'essence',
    price: 25.0,
    rating: 4.8,
    reviews: 9800,
    ingredients: ['snail mucin', 'hyaluronic acid', 'panthenol', 'allantoin'],
    tags: ['barrier', 'hydration']
  },
  {
    id: 'p014',
    name: 'Glow Deep Serum Rice + Alpha-Arbutin',
    brand: 'Beauty of Joseon',
    category: 'serum',
    price: 17.0,
    rating: 4.7,
    reviews: 3600,
    ingredients: ['rice extract', 'alpha arbutin', 'niacinamide', 'glycerin'],
    tags: ['pigmentation', 'brightening']
  },
  {
    id: 'p015',
    name: 'Revive Eye Serum Ginseng + Retinal',
    brand: 'Beauty of Joseon',
    category: 'eye-care',
    price: 17.0,
    rating: 4.6,
    reviews: 1900,
    ingredients: ['retinal', 'ginseng', 'niacinamide', 'glycerin'],
    tags: ['eye-care', 'anti-aging']
  },
  {
    id: 'p016',
    name: 'Great Barrier Relief',
    brand: 'KraveBeauty',
    category: 'serum',
    price: 28.0,
    rating: 4.6,
    reviews: 2800,
    ingredients: ['tamanu oil', 'niacinamide', 'ceramide', 'safflower oil'],
    tags: ['barrier', 'redness']
  },
  {
    id: 'p017',
    name: 'Centella Unscented Serum',
    brand: 'Purito',
    category: 'serum',
    price: 19.0,
    rating: 4.6,
    reviews: 2100,
    ingredients: ['centella', 'niacinamide', 'ceramide', 'panthenol'],
    tags: ['sensitive', 'soothing']
  },
  {
    id: 'p018',
    name: 'Vichy Mineral 89 Serum',
    brand: 'Vichy',
    category: 'serum',
    price: 34.0,
    rating: 4.5,
    reviews: 4100,
    ingredients: ['hyaluronic acid', 'glycerin', 'thermal water'],
    tags: ['hydration']
  },
  {
    id: 'p019',
    name: 'Advanced Night Repair',
    brand: 'Estee Lauder',
    category: 'serum',
    price: 82.0,
    rating: 4.6,
    reviews: 12000,
    ingredients: ['bifida ferment', 'hyaluronic acid', 'peptide', 'caffeine'],
    tags: ['luxury', 'anti-aging']
  },
  {
    id: 'p020',
    name: 'Vitamin C Suspension 23% + HA Spheres',
    brand: 'The Ordinary',
    category: 'treatment',
    price: 7.8,
    rating: 4.0,
    reviews: 6400,
    ingredients: ['vitamin c', 'hyaluronic acid', 'squalane'],
    tags: ['brightening']
  },
  {
    id: 'p021',
    name: 'Retinol 0.5 in Squalane',
    brand: 'The Ordinary',
    category: 'treatment',
    price: 8.7,
    rating: 4.2,
    reviews: 5300,
    ingredients: ['retinol', 'squalane'],
    tags: ['anti-aging', 'texture']
  },
  {
    id: 'p022',
    name: 'Daily Microfoliant',
    brand: 'Dermalogica',
    category: 'exfoliator',
    price: 65.0,
    rating: 4.6,
    reviews: 2600,
    ingredients: ['salicylic acid', 'rice enzyme', 'papain', 'colloidal oatmeal'],
    tags: ['texture', 'dullness']
  },
  {
    id: 'p023',
    name: 'BHA Blackhead Power Liquid',
    brand: 'COSRX',
    category: 'exfoliator',
    price: 24.0,
    rating: 4.5,
    reviews: 7100,
    ingredients: ['salicylic acid', 'niacinamide', 'willow bark', 'hyaluronic acid'],
    tags: ['pores', 'acne']
  },
  {
    id: 'p024',
    name: 'AHA 7 Whitehead Power Liquid',
    brand: 'COSRX',
    category: 'exfoliator',
    price: 24.0,
    rating: 4.4,
    reviews: 3200,
    ingredients: ['glycolic acid', 'apple water', 'niacinamide'],
    tags: ['texture', 'glow']
  },
  {
    id: 'p025',
    name: 'Low pH Good Morning Gel Cleanser',
    brand: 'COSRX',
    category: 'cleanser',
    price: 13.0,
    rating: 4.6,
    reviews: 8300,
    ingredients: ['tea tree', 'betaine salicylate', 'saccharomyces'],
    tags: ['acne', 'daily']
  },
  {
    id: 'p026',
    name: 'Hydrating Facial Cleanser',
    brand: 'CeraVe',
    category: 'cleanser',
    price: 14.5,
    rating: 4.7,
    reviews: 14500,
    ingredients: ['ceramide', 'hyaluronic acid', 'glycerin', 'cholesterol'],
    tags: ['dry-skin', 'barrier']
  },
  {
    id: 'p027',
    name: 'Foaming Facial Cleanser',
    brand: 'CeraVe',
    category: 'cleanser',
    price: 14.5,
    rating: 4.6,
    reviews: 11800,
    ingredients: ['niacinamide', 'ceramide', 'hyaluronic acid'],
    tags: ['oily-skin', 'acne']
  },
  {
    id: 'p028',
    name: 'Soy Face Cleanser',
    brand: 'Fresh',
    category: 'cleanser',
    price: 39.0,
    rating: 4.5,
    reviews: 6400,
    ingredients: ['soy protein', 'glycerin', 'rose water', 'cucumber extract', 'fragrance'],
    tags: ['daily', 'gentle']
  },
  {
    id: 'p029',
    name: 'Squalane Cleanser',
    brand: 'The Ordinary',
    category: 'cleanser',
    price: 12.0,
    rating: 4.4,
    reviews: 7200,
    ingredients: ['squalane', 'glycerin', 'sucrose stearate'],
    tags: ['gentle', 'makeup-removal']
  },
  {
    id: 'p030',
    name: 'Heartleaf 77% Soothing Toner',
    brand: 'Anua',
    category: 'toner',
    price: 23.0,
    rating: 4.7,
    reviews: 1800,
    ingredients: ['heartleaf extract', 'panthenol', 'betaine', 'hyaluronic acid'],
    tags: ['sensitive', 'soothing']
  },
  {
    id: 'p031',
    name: '1025 Dokdo Toner',
    brand: 'Round Lab',
    category: 'toner',
    price: 22.0,
    rating: 4.7,
    reviews: 2200,
    ingredients: ['deep sea water', 'panthenol', 'allantoin', 'beta glucan'],
    tags: ['hydration', 'daily']
  },
  {
    id: 'p032',
    name: 'AHA/BHA Clarifying Treatment Toner',
    brand: 'COSRX',
    category: 'toner',
    price: 18.0,
    rating: 4.3,
    reviews: 2700,
    ingredients: ['glycolic acid', 'salicylic acid', 'willow bark'],
    tags: ['texture', 'acne']
  },
  {
    id: 'p033',
    name: 'UV Aqua Rich Watery Essence SPF50+',
    brand: 'Biore',
    category: 'sunscreen',
    price: 14.0,
    rating: 4.5,
    reviews: 7600,
    ingredients: ['uv filters', 'hyaluronic acid', 'alcohol', 'fragrance'],
    tags: ['sunscreen', 'daily']
  },
  {
    id: 'p034',
    name: 'Relief Sun Rice + Probiotics SPF50+',
    brand: 'Beauty of Joseon',
    category: 'sunscreen',
    price: 18.0,
    rating: 4.8,
    reviews: 5200,
    ingredients: ['rice extract', 'niacinamide', 'probiotics', 'uv filters'],
    tags: ['sunscreen', 'sensitive']
  },
  {
    id: 'p035',
    name: 'Anthelios Melt-in Milk SPF 60',
    brand: 'La Roche-Posay',
    category: 'sunscreen',
    price: 37.0,
    rating: 4.5,
    reviews: 4100,
    ingredients: ['uv filters', 'glycerin', 'vitamin e'],
    tags: ['sunscreen', 'outdoor']
  },
  {
    id: 'p036',
    name: 'Black Tea Instant Perfecting Mask',
    brand: 'Fresh',
    category: 'mask',
    price: 98.0,
    rating: 4.4,
    reviews: 1300,
    ingredients: ['black tea', 'peptide', 'hyaluronic acid', 'glycerin'],
    tags: ['mask', 'firming']
  },
  {
    id: 'p037',
    name: 'Water Sleeping Mask',
    brand: 'Laneige',
    category: 'mask',
    price: 32.0,
    rating: 4.6,
    reviews: 8900,
    ingredients: ['squalane', 'niacinamide', 'beta glucan', 'fragrance'],
    tags: ['night', 'hydration']
  },
  {
    id: 'p038',
    name: 'Calendula Serum-Infused Water Cream',
    brand: "Kiehl's",
    category: 'moisturizer',
    price: 59.0,
    rating: 4.4,
    reviews: 2400,
    ingredients: ['calendula', 'niacinamide', 'glycerin', 'squalane'],
    tags: ['sensitive', 'redness']
  },
  {
    id: 'p039',
    name: 'Blemish + Age Defense',
    brand: 'SkinCeuticals',
    category: 'treatment',
    price: 110.0,
    rating: 4.3,
    reviews: 1200,
    ingredients: ['salicylic acid', 'lipo hydroxy acid', 'dioic acid'],
    tags: ['acne', 'luxury']
  },
  {
    id: 'p040',
    name: 'Resveratrol-Lift Instant Firming Serum',
    brand: 'Caudalie',
    category: 'serum',
    price: 84.0,
    rating: 4.5,
    reviews: 1700,
    ingredients: ['resveratrol', 'hyaluronic acid', 'vegan collagen', 'niacinamide'],
    tags: ['firming', 'anti-aging']
  }
];

