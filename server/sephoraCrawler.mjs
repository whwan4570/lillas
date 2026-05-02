import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_REQUEST_DELAY_MS = 2_500;
const DEFAULT_MAX_RETRIES = 3;

export class SephoraCrawlError extends Error {
  constructor(message, { status = null, kind = 'fetch_error', sourceItemId = null } = {}) {
    super(message);
    this.name = 'SephoraCrawlError';
    this.status = status;
    this.kind = kind;
    this.sourceItemId = sourceItemId;
  }
}

export function buildProductUrl(sourceItemId, sourceUrl) {
  const trimmed = String(sourceUrl ?? '').trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed;
  const id = String(sourceItemId ?? '').trim();
  if (!id) throw new SephoraCrawlError('sourceItemId is required to build a Sephora URL.');
  return `https://www.sephora.com/product/P${id}`;
}

export async function fetchSephoraProductPage(sourceItemId, options = {}) {
  const url = buildProductUrl(sourceItemId, options.sourceUrl);
  const userAgent = options.userAgent || process.env.SEPHORA_USER_AGENT || DEFAULT_USER_AGENT;
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = Number(options.maxRetries) || DEFAULT_MAX_RETRIES;

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      clearTimeout(timer);

      if (response.status === 404) {
        throw new SephoraCrawlError(`Sephora product not found (404): ${url}`, {
          status: 404,
          kind: 'not_found',
          sourceItemId
        });
      }

      if (response.status === 429 || response.status === 503) {
        throw new SephoraCrawlError(`Sephora rate-limited or blocked (${response.status}): ${url}`, {
          status: response.status,
          kind: 'rate_limited',
          sourceItemId
        });
      }

      if (!response.ok) {
        throw new SephoraCrawlError(`Sephora request failed (${response.status}): ${url}`, {
          status: response.status,
          kind: 'http_error',
          sourceItemId
        });
      }

      const html = await response.text();
      if (looksLikeBotChallenge(html)) {
        throw new SephoraCrawlError(`Sephora returned a bot/captcha challenge for ${url}`, {
          status: response.status,
          kind: 'bot_challenge',
          sourceItemId
        });
      }
      return { url, html };
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof SephoraCrawlError
        ? error
        : new SephoraCrawlError(error?.message || 'Sephora fetch failed', {
            kind: error?.name === 'AbortError' ? 'timeout' : 'fetch_error',
            sourceItemId
          });
      const transient =
        lastError.kind === 'timeout' ||
        lastError.kind === 'rate_limited' ||
        lastError.kind === 'fetch_error';
      if (!transient || attempt >= maxRetries) throw lastError;
      const backoffMs = Math.min(15_000, 1_500 * 2 ** (attempt - 1));
      await delay(backoffMs);
    }
  }
  throw lastError ?? new SephoraCrawlError('Sephora fetch failed (unknown)');
}

function looksLikeBotChallenge(html) {
  if (!html) return false;
  const sample = html.slice(0, 4000).toLowerCase();
  return (
    sample.includes('access denied') ||
    sample.includes('captcha') ||
    sample.includes('pardon our interruption') ||
    sample.includes('akamai bot')
  );
}

export function extractNextData(html) {
  const match = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractJsonLd(html) {
  const blocks = [];
  const regex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(parsed);
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return blocks;
}

function flattenJsonLd(blocks) {
  const out = [];
  const queue = [...blocks];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (node && typeof node === 'object') {
      out.push(node);
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
    }
  }
  return out;
}

function findProductNode(nextData) {
  if (!nextData) return null;
  const seen = new Set();
  const stack = [nextData];
  let bestCandidate = null;
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    const hasDisplayName =
      typeof node.displayName === 'string' && node.displayName.trim().length > 0;
    const hasProductId =
      typeof node.productId === 'string' || typeof node.productId === 'number';
    const hasBrand =
      node.brand && typeof node.brand === 'object' && typeof node.brand.displayName === 'string';
    if (hasDisplayName && (hasProductId || hasBrand || node.currentSku || node.regularChildSkus)) {
      const score =
        Number(hasProductId) * 2 +
        Number(hasBrand) * 2 +
        Number(Boolean(node.currentSku)) * 3 +
        Number(Boolean(node.longDescription)) * 1;
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { node, score };
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return bestCandidate?.node ?? null;
}

function safeNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function safeInt(value) {
  const num = safeNumber(value);
  return num == null ? null : Math.round(num);
}

function compactNumber(value) {
  if (value == null) return null;
  const text = String(value).trim();
  const match = text.match(/^([\d.]+)([KkMm])?$/);
  if (!match) return safeInt(text);
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return null;
  if (match[2]?.toLowerCase() === 'k') return Math.round(num * 1_000);
  if (match[2]?.toLowerCase() === 'm') return Math.round(num * 1_000_000);
  return Math.round(num);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const cleaned = typeof value === 'string' ? value.trim() : null;
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function stripHtml(value) {
  if (!value) return null;
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function parsePriceText(text) {
  if (!text) return { amount: null, currency: null, min: null, max: null };
  const range = String(text).match(/\$?(\d+(?:\.\d{1,2})?)\s*[-–]\s*\$?(\d+(?:\.\d{1,2})?)/);
  if (range) {
    return {
      amount: Number(range[1]),
      currency: 'USD',
      min: Number(range[1]),
      max: Number(range[2])
    };
  }
  const single = String(text).match(/\$?(\d+(?:\.\d{1,2})?)/);
  if (!single) return { amount: null, currency: null, min: null, max: null };
  return { amount: Number(single[1]), currency: /\$/.test(text) ? 'USD' : null, min: null, max: null };
}

function parseBulletsFromText(text) {
  if (!text) return [];
  return text
    .split(/\n+|•|\u2022|(?:^|\s)-\s/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon > 0 && colon < 120) {
        return { name: line.slice(0, colon).trim(), description: line.slice(colon + 1).trim() };
      }
      return { name: line, description: '' };
    });
}

function parseHighlightedFromCurrentSku(currentSku) {
  if (!currentSku) return [];
  const candidates = [
    currentSku.highlights,
    currentSku.suggestedUsage,
    currentSku.alternativeImages
  ];
  for (const value of candidates) {
    if (Array.isArray(value) && value.length && typeof value[0] === 'object') {
      return value
        .map((entry) => ({
          name: stripHtml(entry?.name || entry?.title || entry?.label) || null,
          description: stripHtml(entry?.description || entry?.text || '') || ''
        }))
        .filter((entry) => entry.name);
    }
  }
  return [];
}

function parseSkinTypes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return uniqueStrings(value.map((entry) => stripHtml(String(entry))));
  return uniqueStrings(
    String(value)
      .split(/,| and /i)
      .map((token) => token.trim())
  );
}

function parseImageUrls(currentSku, productNode, jsonLdProducts) {
  const urls = new Set();
  const push = (raw) => {
    if (!raw) return;
    let value = String(raw).trim();
    if (!value) return;
    if (value.startsWith('//')) value = `https:${value}`;
    if (value.startsWith('/')) value = `https://www.sephora.com${value}`;
    if (!/^https?:\/\//i.test(value)) return;
    if (!/\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value)) return;
    urls.add(value);
  };
  if (currentSku) {
    push(currentSku.imageUrl);
    push(currentSku.skuImages?.image250);
    push(currentSku.skuImages?.image450);
    push(currentSku.skuImages?.image1500);
    if (Array.isArray(currentSku.alternateImages)) {
      for (const img of currentSku.alternateImages) push(img?.imageUrl || img?.url);
    }
  }
  if (productNode) {
    if (Array.isArray(productNode.heroImages)) {
      for (const img of productNode.heroImages) push(img?.image1500 || img?.image450 || img?.imageUrl);
    }
    push(productNode.imageUrl);
  }
  for (const product of jsonLdProducts) {
    if (Array.isArray(product.image)) for (const img of product.image) push(img);
    else if (product.image) push(product.image);
  }
  return [...urls];
}

function findJsonLdProducts(jsonLdBlocks) {
  return flattenJsonLd(jsonLdBlocks).filter(
    (node) => node && (node['@type'] === 'Product' || node['@type'] === 'IndividualProduct')
  );
}

function findJsonLdAggregateRating(jsonLdProducts) {
  for (const product of jsonLdProducts) {
    const rating = product.aggregateRating;
    if (rating && (rating.ratingValue || rating.reviewCount)) return rating;
  }
  return null;
}

function findJsonLdOffer(jsonLdProducts) {
  for (const product of jsonLdProducts) {
    if (product.offers) return Array.isArray(product.offers) ? product.offers[0] : product.offers;
  }
  return null;
}

export function mapSephoraPageToProduct({ html, url, sourceItemId, label = null }) {
  const nextData = extractNextData(html);
  const productNode = findProductNode(nextData);
  const jsonLdBlocks = extractJsonLd(html);
  const jsonLdProducts = findJsonLdProducts(jsonLdBlocks);
  const ldProduct = jsonLdProducts[0] ?? {};
  const ldRating = findJsonLdAggregateRating(jsonLdProducts);
  const ldOffer = findJsonLdOffer(jsonLdProducts);
  const currentSku = productNode?.currentSku ?? productNode?.sku ?? null;

  const name =
    stripHtml(productNode?.displayName) ||
    stripHtml(ldProduct?.name) ||
    label ||
    null;
  const brand =
    stripHtml(productNode?.brand?.displayName) ||
    stripHtml(typeof ldProduct?.brand === 'object' ? ldProduct.brand?.name : ldProduct?.brand) ||
    null;

  const listPriceText =
    currentSku?.listPrice ?? currentSku?.formattedListPrice ?? null;
  const salePriceText = currentSku?.salePrice ?? currentSku?.formattedSalePrice ?? null;
  const offerPrice = ldOffer?.price ?? ldOffer?.lowPrice ?? null;
  const offerCurrency = ldOffer?.priceCurrency ?? null;
  const priceFromList = parsePriceText(salePriceText || listPriceText);
  const priceFromLd = offerPrice
    ? { amount: Number(offerPrice), currency: offerCurrency || 'USD', min: null, max: null }
    : { amount: null, currency: null, min: null, max: null };
  const price = priceFromList.amount != null ? priceFromList : priceFromLd;

  const autoReplenishPrice =
    safeNumber(currentSku?.autoReplenishPrice) ||
    safeNumber(currentSku?.formattedAutoReplenishPrice) ||
    null;

  const ratingValue =
    safeNumber(productNode?.rating) ||
    safeNumber(ldRating?.ratingValue) ||
    null;
  const reviewCount =
    safeInt(productNode?.reviews) ||
    safeInt(ldRating?.reviewCount) ||
    safeInt(ldRating?.ratingCount) ||
    null;
  const lovesCount =
    compactNumber(productNode?.lovesCount) ||
    compactNumber(currentSku?.lovesCount) ||
    null;
  const recommendedPercent = safeInt(productNode?.recommendedPercent) || null;

  const skinTypes = parseSkinTypes(
    productNode?.skinTypeNames ?? productNode?.skinType ?? currentSku?.skinTypeNames ?? null
  );
  const concerns = parseSkinTypes(
    productNode?.skinConcerns ?? productNode?.concerns ?? currentSku?.skinConcerns ?? null
  );

  const longDescription = stripHtml(productNode?.longDescription) ||
    stripHtml(ldProduct?.description) ||
    null;
  const quickLook = stripHtml(productNode?.quickLookDescription) || null;

  const highlightedIngredients = parseHighlightedFromCurrentSku(currentSku);
  const ingredientsText =
    stripHtml(currentSku?.biIngredients) ||
    stripHtml(productNode?.ingredients) ||
    null;
  const inciIngredients = ingredientsText
    ? ingredientsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const highlights = uniqueStrings([
    ...(Array.isArray(currentSku?.skuBadges) ? currentSku.skuBadges.map((badge) => badge?.label || badge) : []),
    ...(Array.isArray(productNode?.productBadges) ? productNode.productBadges.map((badge) => badge?.label || badge) : []),
    ...(Array.isArray(productNode?.attributes) ? productNode.attributes.map((attr) => attr?.label || attr?.name) : [])
  ]);

  const exclusiveLabel = (productNode?.onlyAtSephora || currentSku?.onlyAtSephora)
    ? 'Only at Sephora'
    : null;

  const ingredientCallouts = parseBulletsFromText(stripHtml(currentSku?.ingredientCallouts) || '')
    .map((entry) => `${entry.name}${entry.description ? `: ${entry.description}` : ''}`);

  const clinicalResults = parseBulletsFromText(stripHtml(currentSku?.clinicalResults) || '');
  const cleanAtSephora = stripHtml(currentSku?.cleanAtSephoraDescription) || null;

  const imageUrls = parseImageUrls(currentSku, productNode, jsonLdProducts);

  const rawText = JSON.stringify({
    productNode: productNode || null,
    currentSku: currentSku || null,
    jsonLd: jsonLdProducts
  }).slice(0, 60_000);

  return {
    source: 'sephora',
    sourceItemId,
    sourceUrl: url,
    name,
    brand,
    priceAmount: price.amount,
    priceCurrency: price.currency,
    priceMinAmount: price.min,
    priceMaxAmount: price.max,
    autoReplenishPriceAmount: autoReplenishPrice,
    ratingValue,
    reviewCount,
    questionCount: null,
    lovesCount,
    recommendedPercent,
    prosMentioned: [],
    consMentioned: [],
    size: stripHtml(currentSku?.size) || null,
    imageLabels: [],
    imageUrls,
    highlights,
    exclusiveLabel,
    whatItIs: quickLook || (longDescription ? longDescription.slice(0, 600) : null),
    skinTypes,
    skincareConcerns: concerns,
    formulation: stripHtml(currentSku?.formulation) || null,
    highlightedIngredients,
    ingredientCallouts,
    whatElse: longDescription,
    clinicalResults,
    cleanAtSephora,
    ingredientsText,
    inciIngredients,
    rawText,
    crawledAt: new Date().toISOString()
  };
}

export async function crawlSephoraProduct(target, options = {}) {
  const sourceItemId = String(target?.sourceItemId ?? '').trim();
  if (!sourceItemId) {
    throw new SephoraCrawlError('sourceItemId is required to crawl a Sephora product.');
  }
  const fetcher = typeof options.fetchPage === 'function' ? options.fetchPage : fetchSephoraProductPage;
  const { html, url } = await fetcher(sourceItemId, {
    sourceUrl: target.sourceUrl,
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries
  });
  const product = mapSephoraPageToProduct({
    html,
    url,
    sourceItemId,
    label: target.label
  });
  if (!product.name && !product.brand) {
    throw new SephoraCrawlError(
      `Sephora page parsed but no product fields were found for item ${sourceItemId}.`,
      { kind: 'parse_error', sourceItemId }
    );
  }
  return product;
}

export async function crawlSephoraTargets(targets, options = {}) {
  const list = Array.isArray(targets) ? targets : [];
  const requestDelayMs = Number(options.requestDelayMs) || DEFAULT_REQUEST_DELAY_MS;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const results = [];
  for (let index = 0; index < list.length; index += 1) {
    const target = list[index];
    const startedAt = new Date().toISOString();
    try {
      const product = await crawlSephoraProduct(target, options);
      results.push({ status: 'ok', target, product, startedAt });
      onProgress?.({ status: 'ok', target, product });
    } catch (error) {
      const wrapped = error instanceof SephoraCrawlError
        ? error
        : new SephoraCrawlError(error?.message || 'crawl failed', { sourceItemId: target?.sourceItemId });
      results.push({ status: 'failed', target, error: wrapped, startedAt });
      onProgress?.({ status: 'failed', target, error: wrapped });
    }
    if (index < list.length - 1 && requestDelayMs > 0) {
      await delay(requestDelayMs);
    }
  }
  return results;
}
