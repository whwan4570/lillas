/**
 * Product catalog sourced from project `data/` (see repo root `data/recommendations.csv`).
 */
import recommendationsCsv from '../../data/recommendations.csv?raw';

export interface CatalogProduct {
  id: number;
  name: string;
  brand: string;
  price: number | null;
  rating: number;
  reviews: number;
  matchScore: number;
  image: string;
  skinTypes: string[];
  category: string;
  categoryLabel: string;
  keyIngredients: string[];
  benefits: string[];
  cautionIngredients: string[];
  sites: { name: string; price: number; rating: number }[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeCategory(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (c === 'cleanser' || c === 'makeup remover') return 'cleanser';
  if (c === 'serum' || c === 'essence' || c === 'toner' || c === 'mist') return 'serum';
  if (c === 'moisturizer' || c === 'facial oil' || c === 'balm' || c === 'lip care') return 'moisturizer';
  if (c === 'sunscreen') return 'sunscreen';
  if (c === 'treatment' || c === 'mask' || c === 'exfoliator') return 'treatment';
  return 'other';
}

function splitIngredients(raw: string, delimiters: RegExp, max: number): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(delimiters)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeToken(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^\w\s\-/'()+.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyNoiseToken(token: string): boolean {
  if (!token) return true;
  if (token.length < 2) return true;
  if (!/[a-zA-Z]/.test(token)) return true;
  return false;
}

function rowsToProducts(rows: string[][]): CatalogProduct[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const brandI = idx('brand');
  const nameI = idx('name');
  const scoreI = idx('score');
  const baseI = idx('base_score');
  const reviewScoreI = idx('review_score');
  const keyI = idx('key_ingredients');
  const imageI = idx('image_url');
  const beneficialI = idx('beneficial_ingredients');
  const cautionI = idx('caution_ingredients');
  const categoryI = idx('category');

  const out: CatalogProduct[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row?.length) continue;

    const brand = row[brandI]?.trim() ?? '';
    const name = row[nameI]?.trim() ?? '';
    if (!name) continue;

    const score = parseFloat(row[scoreI] ?? '0') || 0;
    const baseScore = parseFloat(row[baseI] ?? '0') || 0;
    const reviewScore = parseFloat(row[reviewScoreI] ?? '0') || 0;
    const categoryLabel = row[categoryI]?.trim() ?? 'Other';
    const image = (row[imageI] ?? '').trim().replace(/&amp;/g, '&');

    const keyRaw = row[keyI] ?? '';
    const keyIngredients = splitIngredients(keyRaw, /[,;]/, 8)
      .map(sanitizeToken)
      .filter((s) => !isLikelyNoiseToken(s))
      .slice(0, 4)
      .map((s) => (s.length > 42 ? `${s.slice(0, 40)}…` : s));

    const beneficialRaw = row[beneficialI] ?? '';
    const benefits = splitIngredients(beneficialRaw, /;/, 10)
      .map(sanitizeToken)
      .filter((s) => !isLikelyNoiseToken(s))
      .slice(0, 5)
      .map((s) => (s.length > 48 ? `${s.slice(0, 46)}…` : s));
    const cautionRaw = row[cautionI] ?? '';
    const cautionIngredients = splitIngredients(cautionRaw, /[;,]/, 10)
      .map(sanitizeToken)
      .filter((s) => !isLikelyNoiseToken(s))
      .slice(0, 4)
      .map((s) => (s.length > 42 ? `${s.slice(0, 40)}…` : s));

    out.push({
      id: r,
      name,
      brand,
      price: null,
      rating: Math.min(5, Math.round((reviewScore / 20) * 10) / 10) || 0,
      reviews: Math.max(12, Math.round(baseScore * 18 + score * 3)),
      matchScore: Math.round(Math.min(100, Math.max(0, score))),
      image: image || 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&h=400&fit=crop',
      skinTypes: [categoryLabel || 'All types'],
      category: normalizeCategory(categoryLabel),
      categoryLabel,
      keyIngredients: keyIngredients.length ? keyIngredients : ['See ingredients'],
      benefits: benefits.length ? benefits : ['Formulation highlights'],
      cautionIngredients,
      sites: []
    });
  }

  out.sort((a, b) => b.matchScore - a.matchScore);
  return out.map((p, i) => ({ ...p, id: i + 1 }));
}

let cached: CatalogProduct[] | null = null;

function cloneProduct(product: CatalogProduct): CatalogProduct {
  return {
    ...product,
    skinTypes: [...product.skinTypes],
    keyIngredients: [...product.keyIngredients],
    benefits: [...product.benefits],
    cautionIngredients: [...product.cautionIngredients],
    sites: product.sites.map((site) => ({ ...site }))
  };
}

export function getCatalogProducts(): CatalogProduct[] {
  if (!cached) {
    const rows = parseCsv(recommendationsCsv.trim());
    cached = rowsToProducts(rows);
  }
  return cached.map(cloneProduct);
}
