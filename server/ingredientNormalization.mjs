// Ingredient normalization.
//
// Turns a free-form `ingredientsText` string (Sephora / Ulta / brand site)
// into an ordered list of canonical ingredient records suitable for the
// `ProductIngredient` table. We deliberately keep the output structured
// (raw + normalized + canonical + position) so the database can preserve
// what the source actually said while the app reads canonical names.

const ALIASES = Object.freeze({
  water: ['water', 'aqua', 'eau', 'water/aqua/eau', 'aqua/eau', 'aqua water'],
  glycerin: ['glycerin', 'glycerine', 'glycerol'],
  'hyaluronic acid': ['hyaluronic acid', 'sodium hyaluronate', 'hyaluronate', 'hydrolyzed sodium hyaluronate'],
  niacinamide: ['niacinamide', 'vitamin b3', 'nicotinamide'],
  panthenol: ['panthenol', 'd-panthenol', 'pro-vitamin b5', 'provitamin b5', 'd panthenol'],
  tocopherol: ['tocopherol', 'tocopheryl acetate', 'vitamin e', 'mixed tocopherols'],
  'salicylic acid': ['salicylic acid', 'bha', 'beta hydroxy acid'],
  'ascorbic acid': ['ascorbic acid', 'vitamin c', 'l-ascorbic acid', 'l ascorbic acid'],
  'centella asiatica': ['centella', 'cica', 'centella asiatica', 'centella asiatica extract', 'centella asiatica leaf extract'],
  'green tea': ['green tea', 'camellia sinensis leaf extract', 'camellia sinensis extract'],
  'ceramide np': ['ceramide np', 'ceramide 3'],
  'ceramide ap': ['ceramide ap', 'ceramide 6'],
  'ceramide eop': ['ceramide eop', 'ceramide 1'],
  squalane: ['squalane', 'olive squalane'],
  'butylene glycol': ['butylene glycol'],
  propanediol: ['propanediol', '1,3-propanediol'],
  dimethicone: ['dimethicone'],
  phenoxyethanol: ['phenoxyethanol'],
  'citric acid': ['citric acid'],
  'zinc oxide': ['zinc oxide'],
  'titanium dioxide': ['titanium dioxide'],
  avobenzone: ['avobenzone'],
  homosalate: ['homosalate'],
  octisalate: ['octisalate', 'ethylhexyl salicylate'],
  octocrylene: ['octocrylene']
});

const ALIAS_REVERSE = (() => {
  const map = new Map();
  for (const [canonical, aliasList] of Object.entries(ALIASES)) {
    for (const alias of aliasList) {
      map.set(normalizeIngredientKey(alias), canonical);
    }
    map.set(normalizeIngredientKey(canonical), canonical);
  }
  return map;
})();

const SKINCARE_STAPLES = new Set([
  'water',
  'glycerin',
  'butylene glycol',
  'propanediol',
  'dimethicone',
  'phenoxyethanol',
  'citric acid',
  'tocopherol',
  'panthenol',
  'niacinamide'
]);

const PREAMBLE_REGEX = /^\s*ingredients?\s*[:\-]?\s*/i;
const DISCLAIMER_REGEX = /the list of ingredients is subject to change[\s\S]*$/i;

export function normalizeIngredientKey(raw) {
  if (typeof raw !== 'string') return '';
  let value = raw.toLowerCase();
  value = value.replace(/\(.*?\)/g, ' ');
  value = value.replace(/[^\w\s/-]/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();
  return value;
}

export function canonicalIngredientName(raw) {
  const key = normalizeIngredientKey(raw);
  if (!key) return '';
  return ALIAS_REVERSE.get(key) ?? key;
}

export function aliasesFor(canonical) {
  const key = canonicalIngredientName(canonical);
  return ALIASES[key] ? [...ALIASES[key]] : [];
}

export function parseIngredientsList(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  let cleaned = text.replace(PREAMBLE_REGEX, '').trim();
  cleaned = cleaned.replace(DISCLAIMER_REGEX, '').trim();
  // Split on commas, semicolons, or full-stops followed by space + uppercase
  const tokens = cleaned
    .split(/[,;]+|\.\s+(?=[A-Z(])/)
    .map((tok) => tok.replace(/^[\s\-•]+|[\s\.]+$/g, ''))
    .filter(Boolean)
    .filter((tok) => tok.length >= 2 && /[a-z]/i.test(tok));

  const out = [];
  const seen = new Set();
  for (const raw of tokens) {
    const canonical = canonicalIngredientName(raw);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({
      raw: raw.trim(),
      normalized: normalizeIngredientKey(raw),
      canonical,
      position: out.length + 1
    });
  }
  return out;
}

// Returns a 0..1 score for how trustworthy this ingredient list looks.
// Higher = more likely to be a real INCI list and not marketing copy.
export function ingredientListConfidence(parsed, sourceText) {
  if (!Array.isArray(parsed) || !parsed.length) return 0;
  let score = 0.3;
  if (parsed.length >= 6) score += 0.25;
  if (parsed.length >= 12) score += 0.15;

  const top = parsed.slice(0, 6).map((item) => item.canonical);
  const stapleHits = top.filter((canonical) => SKINCARE_STAPLES.has(canonical)).length;
  if (stapleHits >= 1) score += 0.15;
  if (stapleHits >= 2) score += 0.1;

  if (typeof sourceText === 'string' && sourceText.length >= 80) score += 0.05;

  return Math.min(1, Math.round(score * 100) / 100);
}

// Pick the highest-confidence ingredient list from multiple sources for the
// same product. Returns the chosen list plus warnings when other sources
// disagreed.
export function pickCanonicalIngredientList(sourceLists) {
  const valid = (sourceLists ?? []).filter((entry) => Array.isArray(entry?.parsed) && entry.parsed.length);
  if (!valid.length) return { chosen: null, warnings: [] };

  const scored = valid
    .map((entry) => ({
      ...entry,
      confidence: ingredientListConfidence(entry.parsed, entry.text)
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const chosen = scored[0];
  const warnings = [];
  for (const other of scored.slice(1)) {
    const overlap = canonicalOverlap(chosen.parsed, other.parsed);
    if (overlap < 0.6) {
      warnings.push(`ingredient_disagreement:${chosen.source}_vs_${other.source}:${overlap.toFixed(2)}`);
    }
  }

  return { chosen, warnings };
}

function canonicalOverlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a.map((item) => item.canonical));
  const setB = new Set(b.map((item) => item.canonical));
  let intersection = 0;
  for (const value of setA) if (setB.has(value)) intersection += 1;
  return (2 * intersection) / (setA.size + setB.size);
}
