// Daily Amazon refresh runner.
//
// Iterates the existing Amazon `ProductSource` rows (oldest fetched first),
// re-scrapes their public PDP, and writes back the latest image / title /
// brand / price into the source, the matching offer, and the catalog product.
// Each run is recorded in the `PipelineRun` table so the existing admin
// "Pipeline runs" UI shows refresh history alongside the regular reprocess
// runs.
//
// This is the temporary fallback we use until the Amazon Product Advertising
// API (PA API) credentials get approved. Stay polite to Amazon: cap the batch
// size, sleep between requests, and never throw out of the loop on a single
// failure.

import { prisma, finishPipelineRun, startPipelineRun } from './dbStore.mjs';
import { scrapeAmazonProductPage } from './amazonHtmlScraper.mjs';

const DEFAULT_LIMIT = 25;
const DEFAULT_DELAY_MS = 4000;
const MAX_LIMIT = 200;

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(num)));
}

function clampDelay(value, fallback = DEFAULT_DELAY_MS) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(60_000, num);
}

function buildSourceUrl(source) {
  if (source.sourceUrl) return source.sourceUrl;
  if (source.sourceItemId) return `https://www.amazon.com/dp/${source.sourceItemId}`;
  return null;
}

async function refreshSingleSource(source, { logger }) {
  const url = buildSourceUrl(source);
  if (!url) {
    return { ok: false, asin: source.sourceItemId, reason: 'missing_url' };
  }

  const scraped = await scrapeAmazonProductPage({ url, asin: source.sourceItemId });

  const updates = {
    fetchedAt: new Date()
  };
  if (scraped.imageUrl) updates.imageUrl = scraped.imageUrl;
  if (scraped.title) updates.name = scraped.title;
  if (scraped.brand) updates.brand = scraped.brand;
  if (scraped.priceAmount != null) updates.priceAmount = scraped.priceAmount;
  if (scraped.priceCurrency) updates.priceCurrency = scraped.priceCurrency;
  if (scraped.sourceUrl) updates.sourceUrl = scraped.sourceUrl;

  await prisma.productSource.update({
    where: { id: source.id },
    data: updates
  });

  // If the source is wired to a catalog product, refresh the visible image and
  // upsert the matching offer so the comparison/detail pages pick up the new
  // price + URL on the next /api/catalog/products call.
  if (source.productId) {
    if (scraped.imageUrl) {
      await prisma.product
        .update({
          where: { id: source.productId },
          data: { imageUrl: scraped.imageUrl }
        })
        .catch((error) => {
          logger?.warn?.(
            `[amazon-refresh] product imageUrl update failed (productId=${source.productId}): ${error?.message ?? error}`
          );
        });
    }

    const offerKey = {
      productId_retailer_sourceItemId: {
        productId: source.productId,
        retailer: 'amazon',
        sourceItemId: source.sourceItemId ?? ''
      }
    };
    const offerData = {
      url: scraped.sourceUrl ?? url,
      priceAmount: scraped.priceAmount ?? null,
      priceCurrency: scraped.priceCurrency ?? null,
      inStock: true,
      fetchedAt: new Date()
    };
    await prisma.offer
      .upsert({
        where: offerKey,
        update: offerData,
        create: {
          productId: source.productId,
          retailer: 'amazon',
          sourceItemId: source.sourceItemId ?? '',
          ...offerData
        }
      })
      .catch((error) => {
        logger?.warn?.(
          `[amazon-refresh] offer upsert failed (productId=${source.productId}, asin=${source.sourceItemId}): ${error?.message ?? error}`
        );
      });
  }

  return {
    ok: true,
    asin: source.sourceItemId,
    productId: source.productId ?? null,
    image: Boolean(scraped.imageUrl),
    price: scraped.priceAmount ?? null,
    currency: scraped.priceCurrency ?? null
  };
}

export async function refreshAllAmazonProducts({
  limit = DEFAULT_LIMIT,
  delayMs = DEFAULT_DELAY_MS,
  trigger = 'manual',
  onlyLinked = true,
  logger = console
} = {}) {
  const safeLimit = clampLimit(limit);
  const safeDelay = clampDelay(delayMs);

  const sources = await prisma.productSource.findMany({
    where: {
      retailer: 'amazon',
      ...(onlyLinked ? { productId: { not: null } } : {})
    },
    orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }],
    take: safeLimit
  });

  const run = await startPipelineRun({
    trigger: `amazon-refresh:${trigger}`,
    statuses: []
  });

  let succeeded = 0;
  let failed = 0;
  let blocked = 0;
  const items = [];
  let breakOnBlock = false;

  for (const source of sources) {
    if (breakOnBlock) {
      items.push({ asin: source.sourceItemId, ok: false, reason: 'skipped_after_block' });
      continue;
    }
    try {
      const result = await refreshSingleSource(source, { logger });
      if (result.ok) {
        succeeded += 1;
      } else {
        failed += 1;
      }
      items.push(result);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code ?? 'error';
      logger?.warn?.(`[amazon-refresh] failed asin=${source.sourceItemId} (${code}): ${message}`);
      items.push({ ok: false, asin: source.sourceItemId, error: message, code });
      if (code === 'captcha') {
        blocked += 1;
        // Once Amazon starts serving the captcha interstitial, every further
        // request is going to fail until we backoff. Stop the rest of this
        // batch so the next scheduler tick can try again later.
        breakOnBlock = true;
      }
    }
    if (safeDelay > 0) await sleep(safeDelay);
  }

  const status = sources.length === 0 || succeeded > 0 ? 'completed' : 'failed';
  await finishPipelineRun(run.id, {
    status,
    processed: sources.length,
    succeeded,
    failed,
    statuses: blocked > 0 ? ['blocked'] : []
  });

  return {
    runId: run.id,
    attempted: sources.length,
    succeeded,
    failed,
    blocked,
    items
  };
}
