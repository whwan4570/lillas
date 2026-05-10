// Lightweight, dependency-free Amazon product page scraper.
//
// This is the temporary fallback used by the daily refresh scheduler while we
// wait for the official Product Advertising API (PA API) credentials. It pulls
// the public HTML of an Amazon PDP (`https://<host>/dp/<ASIN>`), extracts the
// fields we need (title, brand, image, price, currency) using simple regex on
// well-known meta tags / element ids, and returns a normalized payload that
// can be fed straight into the existing ingest pipeline.
//
// Notes / limitations:
//   * No external HTML parser dependency on purpose (cheerio etc.) — the
//     fields we read are stable Amazon PDP markers (`og:image`, `productTitle`,
//     `bylineInfo`, `twitter:data1`, `a-offscreen`).
//   * Amazon may return a "Sorry, we just need to make sure you're not a robot"
//     interstitial. We detect that and surface it as a typed error so callers
//     can backoff/skip without crashing the whole batch.
//   * Use realistic browser headers; pace requests at the call-site to avoid
//     hammering Amazon (the runner uses a 4s default delay).

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = Object.freeze({
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1'
});

const DEFAULT_HOST = 'www.amazon.com';
const DEFAULT_TIMEOUT_MS = 15_000;

function decodeHtml(value) {
  if (value == null) return value;
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function metaContent(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  // <meta property|name="X" ... content="...">
  const fwd = new RegExp(
    `<meta\\s+[^>]*?(?:property|name)=["']${escaped}["'][^>]*?content=["']([^"']*)["']`,
    'i'
  ).exec(html);
  if (fwd) return decodeHtml(fwd[1]);
  // <meta content="..." property|name="X">
  const rev = new RegExp(
    `<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${escaped}["']`,
    'i'
  ).exec(html);
  return rev ? decodeHtml(rev[1]) : null;
}

function elementTextById(html, id) {
  const escaped = id.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`<[^>]*?\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)</`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  // Strip nested tags; we only want the visible text.
  const stripped = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return decodeHtml(stripped) || null;
}

function parseMoney(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.,]+/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectBlock(html) {
  if (!html) return null;
  if (/<title>(?:Amazon\.com\s*)?Sorry[\s\S]*<\/title>/i.test(html)) return 'captcha';
  if (/Enter the characters you see below/i.test(html)) return 'captcha';
  if (/Type the characters you see in this image/i.test(html)) return 'captcha';
  if (/api-services-support@amazon\.com/i.test(html)) return 'captcha';
  if (/automated\s+access/i.test(html)) return 'captcha';
  return null;
}

function cleanBrand(raw) {
  if (!raw) return null;
  return String(raw)
    .replace(/^Visit the\s+/i, '')
    .replace(/\s+Store$/i, '')
    .replace(/^Brand:\s*/i, '')
    .replace(/^Sold by\s*/i, '')
    .trim() || null;
}

function extractPrice(html) {
  // Amazon exposes the buybox price in many places; try a few in order of
  // reliability.
  const twitterData1 = metaContent(html, 'twitter:data1');
  const fromTwitter = parseMoney(twitterData1);
  if (fromTwitter != null) return fromTwitter;

  const corePriceMatches = html.match(
    /<span[^>]*class="[^"]*\ba-offscreen\b[^"]*"[^>]*>([^<]+)<\/span>/gi
  );
  if (corePriceMatches) {
    for (const block of corePriceMatches) {
      const inner = />([^<]+)</.exec(block);
      const value = parseMoney(inner?.[1]);
      if (value != null) return value;
    }
  }
  return null;
}

function extractAttribute(html, idValue, attribute) {
  const escapedId = idValue.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const escapedAttr = attribute.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  // id="X" ... attr="..."
  const fwd = new RegExp(
    `<[^>]*?\\bid=["']${escapedId}["'][^>]*?\\b${escapedAttr}=["']([^"']+)["']`,
    'i'
  ).exec(html);
  if (fwd) return decodeHtml(fwd[1]);
  // attr="..." ... id="X"
  const rev = new RegExp(
    `<[^>]*?\\b${escapedAttr}=["']([^"']+)["'][^>]*?\\bid=["']${escapedId}["']`,
    'i'
  ).exec(html);
  return rev ? decodeHtml(rev[1]) : null;
}

function pickLargestDynamicImage(jsonString) {
  if (!jsonString) return null;
  try {
    const parsed = JSON.parse(jsonString);
    let best = null;
    let bestArea = 0;
    for (const [imgUrl, dims] of Object.entries(parsed)) {
      if (!Array.isArray(dims) || dims.length < 2) continue;
      const area = Number(dims[0]) * Number(dims[1]);
      if (Number.isFinite(area) && area > bestArea) {
        bestArea = area;
        best = imgUrl;
      }
    }
    return best;
  } catch {
    return null;
  }
}

function extractImage(html) {
  // 1) Modern PDP: id="landingImage" data-a-dynamic-image='{"url":[w,h],...}'
  const dyn = extractAttribute(html, 'landingImage', 'data-a-dynamic-image');
  const fromDynamic = pickLargestDynamicImage(dyn);
  if (fromDynamic) return fromDynamic;

  const hires = extractAttribute(html, 'landingImage', 'data-old-hires');
  if (hires) return hires;

  // 2) Older / alternate layouts.
  for (const id of ['landingImage', 'imgBlkFront', 'main-image', 'ebooksImgBlkFront']) {
    const src = extractAttribute(html, id, 'src');
    if (src) return src;
  }

  // 3) OpenGraph / Twitter metadata as a final fallback.
  return metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image') ?? null;
}

function extractBrandFromOverview(html) {
  // The "Product overview" table: <tr ...><td...>Brand</td><td...>BrandName</td></tr>
  const tableRe = /<tr[^>]*class="[^"]*\bpo-brand\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/i;
  const match = tableRe.exec(html);
  if (!match) return null;
  const valueMatch = /<span[^>]*class="[^"]*\bpo-break-word\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
    match[1]
  );
  if (!valueMatch) return null;
  const stripped = valueMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return decodeHtml(stripped) || null;
}

function extractBrandFromDetailBullet(html) {
  // <li><span class="a-text-bold">Brand &nbsp;:&nbsp;</span><span>BrandName</span></li>
  const re =
    /<span[^>]*class="[^"]*a-text-bold[^"]*"[^>]*>\s*Brand\s*[\s:&nbsp;]*<\/span>\s*<span[^>]*>([^<]+)<\/span>/i;
  const m = re.exec(html);
  return m ? decodeHtml(m[1]).trim() : null;
}

function extractBrand(html) {
  return (
    cleanBrand(elementTextById(html, 'bylineInfo')) ??
    extractBrandFromOverview(html) ??
    extractBrandFromDetailBullet(html)
  );
}

function inferCurrency(html, priceAmount) {
  if (priceAmount == null) return null;
  const meta = metaContent(html, 'twitter:data1') ?? '';
  if (/£/.test(meta)) return 'GBP';
  if (/€/.test(meta)) return 'EUR';
  if (/¥/.test(meta) || /JPY|CNY/i.test(meta)) return 'JPY';
  if (/CA\$/i.test(meta)) return 'CAD';
  if (/AU\$/i.test(meta)) return 'AUD';
  return 'USD';
}

function buildAmazonUrl({ url, asin, host = DEFAULT_HOST }) {
  if (url) return url;
  if (asin) return `https://${host}/dp/${encodeURIComponent(asin)}`;
  return null;
}

export async function scrapeAmazonProductPage({
  url,
  asin,
  host = DEFAULT_HOST,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
} = {}) {
  const targetUrl = buildAmazonUrl({ url, asin, host });
  if (!targetUrl) {
    throw new Error('scrapeAmazonProductPage requires url or asin.');
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response;
  try {
    response = await fetch(targetUrl, {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const err = new Error(`Amazon request timed out after ${timeoutMs}ms`);
      err.code = 'timeout';
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const err = new Error(`Amazon returned status ${response.status}`);
    err.code = `http_${response.status}`;
    throw err;
  }

  const html = await response.text();
  const block = detectBlock(html);
  if (block) {
    const err = new Error(`Amazon blocked the request (${block}).`);
    err.code = block;
    throw err;
  }

  const ogTitle = metaContent(html, 'og:title');
  const productTitle = elementTextById(html, 'productTitle');
  const imageUrl = extractImage(html);
  const brand = extractBrand(html);
  const priceAmount = extractPrice(html);
  const priceCurrency = inferCurrency(html, priceAmount);

  return {
    asin: asin ?? null,
    title: productTitle ?? ogTitle ?? null,
    brand,
    imageUrl,
    priceAmount,
    priceCurrency,
    sourceUrl: targetUrl,
    fetchedAt: new Date().toISOString()
  };
}

export const __testables = {
  decodeHtml,
  metaContent,
  elementTextById,
  parseMoney,
  detectBlock,
  cleanBrand,
  extractPrice,
  extractImage,
  extractBrand,
  pickLargestDynamicImage,
  buildAmazonUrl
};
