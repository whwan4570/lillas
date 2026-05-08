// Amazon Product Advertising API v5 client.
//
// Stateless helper around the PA API `GetItems` operation. We avoid the
// official SDK on purpose - it adds a heavy dependency for one call and the
// AWSv4 signature is short enough to implement here.
//
// Required env vars (all must be set or the helper short-circuits with a
// clear "not configured" error):
//   AMAZON_PA_API_ACCESS_KEY     - AWS access key id
//   AMAZON_PA_API_SECRET_KEY     - AWS secret key
//   AMAZON_PA_API_PARTNER_TAG    - Amazon associates partner tag
//   AMAZON_PA_API_HOST           - e.g. webservices.amazon.com (default US)
//   AMAZON_PA_API_REGION         - e.g. us-east-1 (default US)
//   AMAZON_PA_API_MARKETPLACE    - e.g. www.amazon.com (default US)
//
// Reference:
//   https://webservices.amazon.com/paapi5/documentation/

import crypto from 'node:crypto';

const SERVICE = 'ProductAdvertisingAPI';
const TARGET_OPERATION = 'GetItems';
const PATH = '/paapi5/getitems';
const TARGET_HEADER = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${TARGET_OPERATION}`;

const DEFAULT_RESOURCES = Object.freeze([
  'Images.Primary.Large',
  'Images.Primary.Medium',
  'ItemInfo.Title',
  'ItemInfo.ByLineInfo',
  'ItemInfo.Classifications',
  'ItemInfo.Features',
  'ItemInfo.ProductInfo',
  'ItemInfo.ManufactureInfo',
  'Offers.Listings.Price',
  'Offers.Summaries.LowestPrice'
]);

function readConfig() {
  const accessKey = process.env.AMAZON_PA_API_ACCESS_KEY;
  const secretKey = process.env.AMAZON_PA_API_SECRET_KEY;
  const partnerTag = process.env.AMAZON_PA_API_PARTNER_TAG;
  const host = process.env.AMAZON_PA_API_HOST ?? 'webservices.amazon.com';
  const region = process.env.AMAZON_PA_API_REGION ?? 'us-east-1';
  const marketplace = process.env.AMAZON_PA_API_MARKETPLACE ?? 'www.amazon.com';
  return { accessKey, secretKey, partnerTag, host, region, marketplace };
}

export function isAmazonProductApiConfigured() {
  const { accessKey, secretKey, partnerTag } = readConfig();
  return Boolean(accessKey && secretKey && partnerTag);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function isoDateStamps(now = new Date()) {
  const isoBasic = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // YYYYMMDDTHHMMSSZ
  return {
    amzDate: isoBasic,
    dateStamp: isoBasic.slice(0, 8)
  };
}

function signRequest({ secretKey, region, dateStamp, stringToSign }) {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, SERVICE);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
}

function buildPayload(asins, { resources = DEFAULT_RESOURCES, partnerTag, marketplace }) {
  return JSON.stringify({
    ItemIds: asins,
    Resources: resources,
    PartnerTag: partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplace
  });
}

function buildHeaders({ host, amzDate, partnerTag, region, signature, accessKey, signedHeaders, payloadHash }) {
  // Authorization header pieces are computed below so the canonical request
  // and signed headers stay in sync.
  return {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'x-amz-target': TARGET_HEADER,
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    'partner-tag': partnerTag,
    region,
    'access-key': accessKey,
    signature,
    'signed-headers': signedHeaders
  };
}

export async function fetchItemsByAsin(asins, { resources, marketplace } = {}) {
  if (!Array.isArray(asins) || !asins.length) {
    throw new Error('fetchItemsByAsin requires at least one ASIN');
  }
  if (asins.length > 10) {
    throw new Error('Amazon PA API GetItems accepts at most 10 ASINs per call');
  }
  const config = readConfig();
  if (!isAmazonProductApiConfigured()) {
    throw new Error(
      'Amazon PA API not configured. Set AMAZON_PA_API_ACCESS_KEY, AMAZON_PA_API_SECRET_KEY, AMAZON_PA_API_PARTNER_TAG.'
    );
  }

  const effectiveMarketplace = marketplace ?? config.marketplace;
  const payload = buildPayload(asins, {
    resources: resources ?? DEFAULT_RESOURCES,
    partnerTag: config.partnerTag,
    marketplace: effectiveMarketplace
  });
  const payloadHash = sha256Hex(payload);
  const { amzDate, dateStamp } = isoDateStamps();

  // SigV4 canonical request.
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${config.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET_HEADER}\n`;
  const signedHeaders =
    'content-encoding;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target';
  const canonicalRequest =
    `POST\n${PATH}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const signature = signRequest({
    secretKey: config.secretKey,
    region: config.region,
    dateStamp,
    stringToSign
  });
  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${config.host}${PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Host: config.host,
      'Content-Encoding': 'amz-1.0',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Target': TARGET_HEADER,
      Authorization: authorizationHeader
    },
    body: payload
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Amazon PA API request failed (${response.status}): ${text.slice(0, 500)}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Amazon PA API returned non-JSON body: ${text.slice(0, 500)}`);
  }
  return parsed;
}

// Helper: normalize a PA API GetItems response item into the lightweight
// shape that `amazonItemToProductSource(...)` accepts. Returns null when the
// item is not usable (missing ASIN/title).
export function paApiItemToIngestPayload(item) {
  if (!item || typeof item !== 'object') return null;
  const asin = item.ASIN ?? item.asin;
  if (!asin) return null;
  const title = item.ItemInfo?.Title?.DisplayValue;
  if (!title) return null;

  const brand =
    item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ??
    item.ItemInfo?.ByLineInfo?.Manufacturer?.DisplayValue ??
    null;

  const url = item.DetailPageURL ?? null;
  const imageUrl =
    item.Images?.Primary?.Large?.URL ?? item.Images?.Primary?.Medium?.URL ?? null;

  const offer = item.Offers?.Listings?.[0] ?? null;
  const lowestPriceSummary = item.Offers?.Summaries?.[0] ?? null;
  const priceAmount =
    offer?.Price?.Amount ?? lowestPriceSummary?.LowestPrice?.Amount ?? null;
  const priceCurrency =
    offer?.Price?.Currency ?? lowestPriceSummary?.LowestPrice?.Currency ?? null;

  // Try to lift size out of the structured ItemDimensions / Features.
  const productInfo = item.ItemInfo?.ProductInfo ?? {};
  const sizeFromProduct =
    productInfo.Size?.DisplayValue ??
    productInfo.UnitCount?.DisplayValue ??
    null;
  const features = item.ItemInfo?.Features?.DisplayValues ?? [];
  const sizeFromFeatures = features.find((line) =>
    /\d+\s*(?:ml|fl\s*oz|oz|g)\b/i.test(String(line))
  );
  const size = sizeFromProduct ?? sizeFromFeatures ?? null;

  const category = item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue ?? null;

  return {
    asin,
    title,
    brand: brand ?? undefined,
    url: url ?? undefined,
    imageUrl: imageUrl ?? undefined,
    priceAmount: typeof priceAmount === 'number' ? priceAmount : undefined,
    priceCurrency: priceCurrency ?? undefined,
    category: category ?? undefined,
    size: size ?? undefined
  };
}
