import {
  finishCrawlerRun,
  getLastSuccessfulCrawlerRun,
  listCrawlerRuns,
  listSephoraTargets,
  recordTargetCrawl,
  startCrawlerRun,
  upsertImportedProduct
} from './dbStore.mjs';
import { crawlSephoraTargets } from './sephoraCrawler.mjs';

const DEFAULT_REQUEST_DELAY_MS = 2_500;
const DEFAULT_INTERVAL_HOURS = 24;

async function selectFetchPage() {
  const choice = String(process.env.SEPHORA_FETCHER ?? 'fetch').trim().toLowerCase();
  if (choice === 'playwright') {
    const mod = await import('./sephoraFetchPlaywright.mjs');
    return mod.fetchSephoraProductPagePlaywright;
  }
  return undefined;
}

export async function runSephoraCrawl({ trigger = 'manual', logger = console, ...options } = {}) {
  const targets = await listSephoraTargets({ enabledOnly: true });
  const run = await startCrawlerRun({ source: 'sephora', trigger });
  if (!targets.length) {
    await finishCrawlerRun(run.id, {
      status: 'completed',
      processed: 0,
      succeeded: 0,
      failed: 0,
      errorMessage: 'No enabled Sephora targets configured.'
    });
    logger.info?.('[sephora-crawler] no enabled targets to crawl.');
    return { runId: run.id, processed: 0, succeeded: 0, failed: 0, results: [] };
  }

  const fetchPage = options.fetchPage ?? (await selectFetchPage());
  const fetcherLabel = fetchPage ? (process.env.SEPHORA_FETCHER || 'custom') : 'fetch';
  logger.info?.(
    `[sephora-crawler] starting run #${run.id} for ${targets.length} targets (trigger=${trigger}, fetcher=${fetcherLabel})`
  );
  let succeeded = 0;
  let failed = 0;
  let lastError = null;

  const results = await crawlSephoraTargets(targets, {
    requestDelayMs: Number(options.requestDelayMs) || DEFAULT_REQUEST_DELAY_MS,
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    fetchPage,
    onProgress: ({ status, target, error }) => {
      if (status === 'ok') {
        logger.info?.(`[sephora-crawler] ok ${target.sourceItemId}`);
      } else {
        logger.warn?.(
          `[sephora-crawler] failed ${target?.sourceItemId}: ${error?.message ?? 'unknown error'}`
        );
      }
    }
  });

  for (const result of results) {
    if (result.status === 'ok') {
      try {
        await upsertImportedProduct(result.product);
        await recordTargetCrawl(result.target.sourceItemId, { status: 'ok' });
        succeeded += 1;
      } catch (saveError) {
        failed += 1;
        lastError = saveError;
        await recordTargetCrawl(result.target.sourceItemId, {
          status: 'save_failed',
          errorMessage: saveError?.message
        });
        logger.error?.(
          `[sephora-crawler] save failed ${result.target.sourceItemId}: ${saveError?.message}`
        );
      }
    } else {
      failed += 1;
      lastError = result.error;
      await recordTargetCrawl(result.target.sourceItemId, {
        status: result.error?.kind ?? 'failed',
        errorMessage: result.error?.message
      });
    }
  }

  const status = failed === 0 ? 'completed' : succeeded === 0 ? 'failed' : 'partial';
  await finishCrawlerRun(run.id, {
    status,
    processed: results.length,
    succeeded,
    failed,
    errorMessage: status === 'completed' ? null : lastError?.message ?? null
  });

  logger.info?.(
    `[sephora-crawler] run #${run.id} finished: status=${status} processed=${results.length} ok=${succeeded} fail=${failed}`
  );
  return { runId: run.id, processed: results.length, succeeded, failed, status, results };
}

export async function listRecentSephoraRuns(limit = 20) {
  return listCrawlerRuns({ source: 'sephora', limit });
}

export async function getLastSuccessfulSephoraRun() {
  return getLastSuccessfulCrawlerRun('sephora');
}

export function parseIntervalHours(value, fallback = DEFAULT_INTERVAL_HOURS) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(168, Math.max(1, num));
}
