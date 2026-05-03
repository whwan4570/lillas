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
import { standardizeProduct } from './sephoraSchema.mjs';
import { evaluateRunForAlerts, notifyAlerts } from './crawlerAlerts.mjs';

// Sephora's Akamai BotManager keys on burst patterns. In production we
// pace requests at ~30s by default — this can be tuned with the
// SEPHORA_REQUEST_DELAY_MS env var when the upstream IP/proxy is well-warmed.
const DEFAULT_REQUEST_DELAY_MS = Number(process.env.SEPHORA_REQUEST_DELAY_MS) || 30_000;
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

  let lowQualityCount = 0;
  for (const result of results) {
    if (result.status === 'ok') {
      try {
        const standardized = standardizeProduct(result.product);
        if (standardized.warnings.length) {
          lowQualityCount += 1;
          logger.warn?.(
            `[sephora-crawler] quality warnings ${standardized.sourceItemId}: ${standardized.warnings.join(', ')}`
          );
        }
        await upsertImportedProduct(standardized);
        await recordTargetCrawl(result.target.sourceItemId, {
          status: standardized.warnings.length ? 'ok_with_warnings' : 'ok',
          errorMessage: standardized.warnings.length ? standardized.warnings.join(', ') : null
        });
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
    `[sephora-crawler] run #${run.id} finished: status=${status} processed=${results.length} ok=${succeeded} fail=${failed} lowQuality=${lowQualityCount}`
  );

  try {
    const alerts = await evaluateRunForAlerts({
      runId: run.id,
      processed: results.length,
      succeeded,
      failed,
      status
    });
    if (alerts.length) {
      await notifyAlerts(alerts, { logger });
    }
  } catch (alertError) {
    logger.warn?.(`[sephora-crawler] alert evaluation failed: ${alertError?.message ?? alertError}`);
  }

  return {
    runId: run.id,
    processed: results.length,
    succeeded,
    failed,
    lowQuality: lowQualityCount,
    status,
    results
  };
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
