export function parseSephoraProductText(rawText, overrides = {}) {
  const text = normalizeText(rawText);
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const sourceItemId = overrides.sourceItemId ?? matchFirst(text, /\bItem\s+(\d+)\b/i);
  const price = extractPrice(text);
  const ratings = extractRatings(text);

  return {
    source: overrides.source ?? 'sephora',
    sourceItemId,
    name: cleanOptional(overrides.name) ?? inferName(lines),
    brand: cleanOptional(overrides.brand) ?? inferBrand(lines),
    priceAmount: price.amount,
    priceCurrency: price.currency,
    priceMinAmount: price.minAmount,
    priceMaxAmount: price.maxAmount,
    autoReplenishPriceAmount: extractAutoReplenishPrice(text),
    ratingValue: ratings.ratingValue,
    reviewCount: ratings.reviewCount,
    questionCount: ratings.questionCount,
    lovesCount: ratings.lovesCount,
    recommendedPercent: ratings.recommendedPercent,
    prosMentioned: ratings.prosMentioned,
    consMentioned: ratings.consMentioned,
    size: matchFirst(text, /^Size:\s*(.+)$/im),
    imageLabels: extractImageLabels(lines),
    imageUrls: extractImageUrls(text),
    highlights: extractHighlights(text),
    exclusiveLabel: lines.find((line) => /only at sephora/i.test(line)) ?? null,
    whatItIs: sectionValue(text, 'What it is', ['Skin Type', 'Skincare Concerns', 'Formulation']),
    skinTypes: splitCsvSection(text, 'Skin Type', ['Skincare Concerns', 'Formulation']),
    skincareConcerns: splitCsvSection(text, 'Skincare Concerns', ['Formulation', 'Highlighted Ingredients']),
    formulation: sectionValue(text, 'Formulation', ['Highlighted Ingredients', 'Ingredient Callouts']),
    highlightedIngredients: parseBullets(
      sectionText(text, 'Highlighted Ingredients', ['Ingredient Callouts', 'What Else You Need to Know', 'Clinical Results'])
    ),
    ingredientCallouts: splitSentences(
      sectionValue(text, 'Ingredient Callouts', ['What Else You Need to Know', 'Clinical Results', 'Clean at Sephora'])
    ),
    whatElse: sectionValue(text, 'What Else You Need to Know', ['Clinical Results', 'Clean at Sephora', 'Ingredients']),
    clinicalResults: parseBullets(sectionText(text, 'Clinical Results', ['Clean at Sephora', 'Ingredients'])),
    cleanAtSephora: sectionValue(text, 'Clean at Sephora', ['Show less', 'Ingredients']),
    ingredientsText: extractIngredientsText(text),
    inciIngredients: splitInci(extractIngredientsText(text)),
    sourceUrl: cleanOptional(overrides.sourceUrl),
    rawText: text
  };
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanOptional(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

function matchFirst(text, regex) {
  return regex.exec(text)?.[1]?.trim() ?? null;
}

function sectionValue(text, heading, nextHeadings) {
  const value = sectionText(text, heading, nextHeadings)
    .replace(new RegExp(`^${escapeRegExp(heading)}\\s*:?\\s*`, 'i'), '')
    .trim();
  return value || null;
}

function sectionText(text, heading, nextHeadings) {
  const startRegex = new RegExp(`(^|\\n)${escapeRegExp(heading)}\\s*:?`, 'i');
  const start = startRegex.exec(text);
  if (!start) return '';

  const contentStart = (start.index ?? 0) + start[0].length;
  let contentEnd = text.length;
  for (const next of nextHeadings) {
    const nextRegex = new RegExp(`\\n${escapeRegExp(next)}\\s*:?`, 'i');
    const nextMatch = nextRegex.exec(text.slice(contentStart));
    if (nextMatch) {
      contentEnd = Math.min(contentEnd, contentStart + nextMatch.index);
    }
  }
  return text.slice(contentStart, contentEnd).trim();
}

function splitCsvSection(text, heading, nextHeadings) {
  const value = sectionValue(text, heading, nextHeadings);
  if (!value) return [];
  return value
    .replace(/\band\b/gi, ',')
    .split(',')
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function parseBullets(value) {
  if (!value) return [];
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const bullets = [];

  for (const line of lines) {
    const cleaned = line.replace(/^-\s*/, '').trim();
    if (!cleaned) continue;
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex > 0 && colonIndex < 120) {
      bullets.push({
        name: cleaned.slice(0, colonIndex).trim(),
        description: cleaned.slice(colonIndex + 1).trim()
      });
    } else {
      bullets.push({ name: cleaned, description: '' });
    }
  }

  return bullets;
}

function splitSentences(value) {
  if (!value) return [];
  return value
    .split(/(?<=\.)\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractIngredientsText(text) {
  const ingredients = sectionText(text, 'Ingredients', []);
  if (!ingredients) return null;
  const withoutHighlighted = ingredients
    .split('\n')
    .filter((line) => !/^-\s*/.test(line.trim()))
    .join('\n')
    .replace(/The list of ingredients is subject to change[,.].*$/is, '')
    .trim();
  const inciStart = withoutHighlighted.search(/\bWater\/Aqua\/Eau\b|\bZinc Oxide\b|^[A-Z][A-Za-z0-9()%/ -]+,\s*/m);
  const inciText = inciStart >= 0 ? withoutHighlighted.slice(inciStart).trim() : withoutHighlighted;
  return inciText || null;
}

function splitInci(value) {
  if (!value) return [];
  return value
    .replace(/\n+/g, ' ')
    .split(',')
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter(Boolean);
}

function extractPrice(text) {
  const rangeMatch = text.match(/\$(\d+(?:\.\d{2})?)\s*-\s*\$(\d+(?:\.\d{2})?)/);
  if (rangeMatch) {
    return {
      amount: Number(rangeMatch[1]),
      currency: 'USD',
      minAmount: Number(rangeMatch[1]),
      maxAmount: Number(rangeMatch[2])
    };
  }
  const singleMatch = text.match(/(?:^|\n)\$(\d+(?:\.\d{2})?)(?:\n|$)/);
  return {
    amount: singleMatch ? Number(singleMatch[1]) : null,
    currency: singleMatch ? 'USD' : null,
    minAmount: null,
    maxAmount: null
  };
}

function extractAutoReplenishPrice(text) {
  const match = text.match(/get it for\s+\$(\d+(?:\.\d{2})?)[^\n]*Auto-Replenish/i);
  return match ? Number(match[1]) : null;
}

function extractRatings(text) {
  return {
    ratingValue:
      Number(matchFirst(text, /Ratings & Reviews[\s\S]*?Summary[\s\S]*?\n1\s*\n(\d(?:\.\d)?)/i)) ||
      Number(matchFirst(text, /(\d(?:\.\d)?)\s*\n\d+(?:\.\d+)?K?\s+Reviews?\*/i)) ||
      null,
    reviewCount: parseCompactNumber(
      matchFirst(text, /Ratings & Reviews\s*\(([^)]+)\)/i) ?? matchFirst(text, /\n(\d+(?:\.\d+)?K?)\s+Reviews?\*/i)
    ),
    questionCount: parseCompactNumber(matchFirst(text, /Questions & Answers\s*\(([^)]+)\)/i)),
    lovesCount: parseCompactNumber(matchFirst(text, /Ask a question\s*\|\s*([\d.]+K?)/i)),
    recommendedPercent: Number(matchFirst(text, /(\d+)%\s+Recommended/i)) || null,
    prosMentioned: extractMentioned(text, 'Pros Mentioned'),
    consMentioned: extractMentioned(text, 'Cons Mentioned')
  };
}

function extractMentioned(text, heading) {
  const value = sectionText(text, heading, ['Cons Mentioned', 'Authentic Reviews', 'Questions & Answers', 'AI Chat']);
  return [...value.matchAll(/([A-Za-z][A-Za-z /-]+)\s+\((\d+)\)/g)].map((match) => ({
    label: match[1].trim(),
    count: Number(match[2])
  }));
}

function parseCompactNumber(value) {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/,/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(K)?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] ? Math.round(number * 1000) : number;
}

function extractImageLabels(lines) {
  const labels = lines.filter((line) => /\bImage\s+\d+\b/i.test(line) || /^Video$/i.test(line));
  return [...new Set(labels)];
}

function extractImageUrls(text) {
  return [
    ...new Set(
      [...text.matchAll(/https?:\/\/[^\s"'<>]+/g)]
        .map((match) => match[0])
        .filter((url) => /\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(url))
    )
  ];
}

function extractHighlights(text) {
  const value = sectionText(text, 'Highlights', ['Show more products', 'Similar Products', 'About the Product']);
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const deduped = [];
  for (const line of lines) {
    if (!deduped.includes(line)) deduped.push(line);
  }
  return deduped;
}

function inferBrand(lines) {
  const skincareIndex = lines.findIndex((line) => /^Skincare$/i.test(line));
  if (skincareIndex >= 0) {
    const candidates = lines.slice(skincareIndex + 1, skincareIndex + 8);
    return candidates.find((line) => !/^(Sunscreen|Face Sunscreen)$/i.test(line)) ?? null;
  }
  return null;
}

function inferName(lines) {
  const brand = inferBrand(lines);
  if (!brand) return null;
  const brandIndex = lines.findIndex((line) => line === brand);
  return lines[brandIndex + 1] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
