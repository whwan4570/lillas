import { listImportedProducts, prisma, upsertImportedProduct } from './dbStore.mjs';
import { parseSephoraProductText } from './productImport.mjs';

const products = [
  {
    itemId: '2898419',
    brand: 'rhode',
    name: 'Glazing Milk',
    price: 32,
    rating: 4.6,
    reviews: 2100,
    exclusive: true,
    whatItIs:
      'A nutrient-rich milky essence that leaves skin feeling hydrated and glowy while supporting the skin barrier over time.',
    skinTypes: ['Normal', 'Dry', 'Combination'],
    concerns: ['Dullness', 'Dryness', 'Redness'],
    formulation: 'Liquid',
    highlighted: [
      ['Ceramide Trio (NP, AP, EOP)', 'Moisturizes, smooths skin, and helps reinforce the skin barrier.'],
      ['Mineral Complex', 'Magnesium, zinc, and copper help defend against external stressors.'],
      ['Vitamin E', 'An antioxidant that helps protect against environmental stressors.']
    ],
    ingredients: [
      'Water/Aqua/Eau',
      'C12-15 Alkyl Benzoate',
      'Coconut Alkanes',
      'Glycerin',
      'Tocopheryl Acetate',
      'Sodium Hyaluronate',
      'Ceramide NP',
      'Ceramide AP',
      'Ceramide EOP',
      'Beta-Glucan',
      'Zinc Gluconate',
      'Phenoxyethanol',
      'Citric Acid'
    ]
  },
  {
    itemId: 'seed-2900001',
    brand: 'The Ordinary',
    name: 'Niacinamide 10% + Zinc 1% Serum',
    price: 6.5,
    rating: 4.4,
    reviews: 19000,
    whatItIs: 'A water-based serum that targets visible shine, uneven tone, and enlarged-looking pores.',
    skinTypes: ['Normal', 'Oily', 'Combination'],
    concerns: ['Oiliness', 'Pores', 'Uneven Texture'],
    formulation: 'Serum',
    highlighted: [
      ['Niacinamide', 'Helps visibly brighten and balance the look of skin.'],
      ['Zinc PCA', 'Supports a balanced-looking complexion.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Niacinamide', 'Pentylene Glycol', 'Zinc PCA', 'Tamarindus Indica Seed Gum', 'Citric Acid']
  },
  {
    itemId: 'seed-2900002',
    brand: 'Drunk Elephant',
    name: 'B-Hydra Intensive Hydration Serum',
    price: 49,
    rating: 4.3,
    reviews: 3200,
    whatItIs: 'A lightweight hydration serum that helps replenish water and improve the look of skin texture.',
    skinTypes: ['Normal', 'Dry', 'Combination', 'Oily'],
    concerns: ['Dryness', 'Dullness', 'Uneven Texture'],
    formulation: 'Serum',
    highlighted: [
      ['Pro-Vitamin B5', 'Helps attract and hold hydration.'],
      ['Pineapple Ceramide', 'Supports a smoother-looking moisture barrier.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Panthenol', 'Sodium Hyaluronate', 'Ceramide NP', 'Ananas Sativus Fruit Extract', 'Phenoxyethanol']
  },
  {
    itemId: 'seed-2900003',
    brand: 'Tatcha',
    name: 'The Water Cream',
    price: 74,
    rating: 4.6,
    reviews: 4600,
    whatItIs: 'An oil-free water cream that provides lightweight hydration and a soft, balanced finish.',
    skinTypes: ['Normal', 'Oily', 'Combination'],
    concerns: ['Pores', 'Dryness', 'Dullness'],
    formulation: 'Cream',
    highlighted: [
      ['Japanese Wild Rose', 'Helps visibly refine the look of pores.'],
      ['Hadasei-3', 'A trio of fermented Japanese superfoods.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Dimethicone', 'Camellia Sinensis Leaf Extract', 'Oryza Sativa Extract', 'Fragrance']
  },
  {
    itemId: 'seed-2900004',
    brand: 'Glow Recipe',
    name: 'Watermelon Glow Niacinamide Dew Drops',
    price: 36,
    rating: 4.5,
    reviews: 2900,
    whatItIs: 'A brightening serum that gives skin a dewy look while helping even tone over time.',
    skinTypes: ['Normal', 'Dry', 'Oily', 'Combination'],
    concerns: ['Dullness', 'Uneven Tone', 'Dryness'],
    formulation: 'Serum',
    highlighted: [
      ['Niacinamide', 'Helps visibly brighten and smooth.'],
      ['Watermelon Extract', 'Hydrates and refreshes the feel of skin.'],
      ['Hyaluronic Acid', 'Helps attract moisture.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Niacinamide', 'Citrullus Lanatus Fruit Extract', 'Sodium Hyaluronate', 'Adenosine']
  },
  {
    itemId: 'seed-2900005',
    brand: 'Paula’s Choice',
    name: '2% BHA Liquid Exfoliant',
    price: 35,
    rating: 4.4,
    reviews: 5400,
    whatItIs: 'A leave-on exfoliant with salicylic acid that helps clear buildup and smooth the look of skin.',
    skinTypes: ['Normal', 'Oily', 'Combination'],
    concerns: ['Pores', 'Acne', 'Uneven Texture'],
    formulation: 'Liquid',
    highlighted: [
      ['Salicylic Acid', 'Exfoliates inside pores and helps reduce visible congestion.'],
      ['Green Tea', 'Provides antioxidant soothing benefits.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Methylpropanediol', 'Butylene Glycol', 'Salicylic Acid', 'Camellia Oleifera Leaf Extract', 'Sodium Hydroxide']
  },
  {
    itemId: 'seed-2900006',
    brand: 'Summer Fridays',
    name: 'Jet Lag Mask',
    price: 49,
    rating: 4.2,
    reviews: 4700,
    whatItIs: 'A rich hydrating mask that helps soothe and comfort dry, stressed-looking skin.',
    skinTypes: ['Normal', 'Dry', 'Combination'],
    concerns: ['Dryness', 'Dullness', 'Redness'],
    formulation: 'Mask',
    highlighted: [
      ['Niacinamide', 'Helps improve the look of uneven tone.'],
      ['Glycerin', 'Helps draw moisture into skin.'],
      ['Panthenol', 'Helps soothe and support barrier comfort.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Niacinamide', 'Panthenol', 'Sodium Hyaluronate', 'Tocopherol']
  },
  {
    itemId: 'seed-2900007',
    brand: 'Kiehl’s Since 1851',
    name: 'Ultra Facial Cream',
    price: 39,
    rating: 4.6,
    reviews: 8200,
    whatItIs: 'A daily facial cream that provides lasting hydration and helps support a comfortable moisture barrier.',
    skinTypes: ['Normal', 'Dry', 'Combination'],
    concerns: ['Dryness', 'Dullness'],
    formulation: 'Cream',
    highlighted: [
      ['Squalane', 'Helps replenish skin with lightweight moisture.'],
      ['Glacial Glycoprotein', 'Helps maintain hydration.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Squalane', 'Dimethicone', 'Imperata Cylindrica Root Extract', 'Phenoxyethanol']
  },
  {
    itemId: 'seed-2900008',
    brand: 'Farmacy',
    name: 'Honey Halo Moisturizer',
    price: 48,
    rating: 4.6,
    reviews: 2500,
    whatItIs: 'A rich moisturizer that comforts dry skin and helps strengthen the look of the moisture barrier.',
    skinTypes: ['Normal', 'Dry', 'Combination'],
    concerns: ['Dryness', 'Redness', 'Dullness'],
    formulation: 'Cream',
    highlighted: [
      ['Honey Blend', 'Helps soothe and moisturize.'],
      ['Ceramides', 'Support the skin barrier.'],
      ['Shea Butter', 'Nourishes and softens.']
    ],
    ingredients: ['Water/Aqua/Eau', 'Glycerin', 'Butyrospermum Parkii Butter', 'Honey Extract', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP']
  },
  {
    itemId: '2773299',
    brand: 'Supergoop!',
    name: 'Mineral Unseen Sunscreen SPF 40',
    price: 40,
    autoReplenishPrice: 38,
    rating: 4.3,
    reviews: 378,
    questions: 25,
    loves: '21.4K',
    recommendedPercent: 82,
    size: '1.7 oz / 50 ml',
    whatItIs: 'A sheer, weightless, scentless mineral sunscreen with expert SPF protection and a cloud-like formula recommended for sensitive skin.',
    skinTypes: ['Normal', 'Dry', 'Oily', 'Combination'],
    concerns: ['Sun Protection', 'Oiliness', 'Uneven Texture'],
    formulation: 'Gel',
    highlighted: [
      ['Broad-Spectrum SPF 40', 'Helps protect against UVA and UVB rays.'],
      ['Meadowfoam Seed', 'Helps condition skin.']
    ],
    ingredients: ['Avobenzone', 'Homosalate', 'Octisalate', 'Octocrylene', 'Isododecane', 'Dimethicone', 'Meadowfoam Estolide']
  }
];

function toRawText(product) {
  return [
    'Skincare',
    'Sunscreen',
    'Face Sunscreen',
    product.brand,
    product.name,
    String(product.reviews ?? ''),
    '|',
    'Ask a question',
    '|',
    String(product.loves ?? '1.2K'),
    '',
    `$${Number(product.price).toFixed(2)}`,
    product.autoReplenishPrice ? `get it for $${Number(product.autoReplenishPrice).toFixed(2)} (5% off) with Auto-Replenish` : '',
    '',
    `${product.brand} ${product.name} in ${product.size ?? 'Standard size'} Image 2`,
    'Video',
    `${product.brand} ${product.name} in ${product.size ?? 'Standard size'} Image 3`,
    '',
    `Size: ${product.size ?? 'Standard size'}`,
    '',
    'Highlights',
    ...product.concerns.slice(0, 3),
    '',
    'About the Product',
    `Item ${product.itemId}`,
    '',
    product.exclusive ? 'Only at Sephora' : '',
    `What it is: ${product.whatItIs}`,
    '',
    `Skin Type: ${joinList(product.skinTypes)}`,
    '',
    `Skincare Concerns: ${joinList(product.concerns)}`,
    '',
    `Formulation: ${product.formulation}`,
    '',
    'Highlighted Ingredients:',
    ...product.highlighted.map(([name, description]) => `- ${name}: ${description}`),
    '',
    'Ingredient Callouts: This sample import record is structured for catalog enrichment.',
    '',
    'What Else You Need to Know: Imported through the Sephora text parser for local product catalog testing.',
    '',
    'Clinical Results:',
    'Summary',
    String(product.rating ?? 4.5),
    `${product.reviews ?? 1000} Reviews*`,
    product.recommendedPercent ? `${product.recommendedPercent}% Recommended` : '',
    '- Sample record for import workflow validation',
    '',
    `Questions & Answers (${product.questions ?? 12})`,
    '',
    `Ratings & Reviews (${product.reviews ?? 1000})`,
    'Summary',
    '5',
    '4',
    '3',
    '2',
    '1',
    String(product.rating ?? 4.5),
    `${product.reviews ?? 1000} Reviews*`,
    product.recommendedPercent ? `${product.recommendedPercent}% Recommended` : '85% Recommended',
    'Pros Mentioned',
    'satisfaction (22)',
    'texture (13)',
    'Cons Mentioned',
    'disappointing (6)',
    '',
    'Ingredients',
    product.ingredients.join(', '),
    '',
    'The list of ingredients is subject to change. Please consult the packaging of the product purchased.'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function joinList(items) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

let imported = 0;
for (const product of products) {
  const parsed = parseSephoraProductText(toRawText(product), {
    brand: product.brand,
    name: product.name,
    sourceItemId: product.itemId
  });
  await upsertImportedProduct(parsed);
  imported += 1;
}

const stored = await listImportedProducts(200);
console.log(`Imported ${imported} Sephora-format products. Stored total: ${stored.length}.`);
await prisma.$disconnect();
