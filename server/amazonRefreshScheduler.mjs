// Periodic, env-flag gated scheduler that calls `refreshAllAmazonProducts`
// once per `AMAZON_REFRESH_INTERVAL_HOURS`. Mirrors the layout of
// `productPipelineScheduler.mjs` so the operations team has only one mental
// model for our background jobs.

import { refreshAllAmazonProducts } from './amazonRefreshRunner.mjs';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let inFlight = false;
let lastRunAtMs = 0;

function isEnabled() {
  const flag = String(process.env.AMAZON_REFRESH_ENABLED ?? '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

export function parseAmazonRefreshIntervalHours(value, fallback = 24) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(168, Math.max(1, num));
}

function intervalMs() {
  return (
    parseAmazonRefreshIntervalHours(process.env.AMAZON_REFRESH_INTERVAL_HOURS, 24) *
    60 *
    60 *
    1000
  );
}

async function tick(logger = console) {
  if (inFlight) return;
  if (!isEnabled()) return;

  const now = Date.now();
  if (lastRunAtMs && now - lastRunAtMs < intervalMs()) return;

  try {
    inFlight = true;
    const limit = Number(process.env.AMAZON_REFRESH_BATCH_SIZE ?? 25);
    const delayMs = Number(process.env.AMAZON_REFRESH_DELAY_MS ?? 4000);
    const summary = await refreshAllAmazonProducts({
      limit,
      delayMs,
      trigger: 'scheduler',
      logger
    });
    lastRunAtMs = Date.now();
    logger?.info?.(
      `[amazon-refresh] scheduler completed runId=${summary.runId} attempted=${summary.attempted} succeeded=${summary.succeeded} failed=${summary.failed} blocked=${summary.blocked}`
    );
  } catch (error) {
    logger?.error?.(`[amazon-refresh] scheduler tick failed: ${error?.message ?? error}`);
  } finally {
    inFlight = false;
  }
}

export function startAmazonRefreshScheduler({ logger = console, immediate = true } = {}) {
  if (timer) return timer;
  if (!isEnabled()) {
    logger?.info?.(
      '[amazon-refresh] disabled (set AMAZON_REFRESH_ENABLED=true to enable daily scrape).'
    );
    return null;
  }

  const hours = parseAmazonRefreshIntervalHours(process.env.AMAZON_REFRESH_INTERVAL_HOURS, 24);
  logger?.info?.(
    `[amazon-refresh] enabled (interval=${hours}h, poll=${POLL_INTERVAL_MS / 60000}m)`
  );

  if (immediate) setImmediate(() => tick(logger).catch(() => {}));
  timer = setInterval(() => {
    tick(logger).catch(() => {});
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function stopAmazonRefreshScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  inFlight = false;
}

export async function runAmazonRefreshSchedulerTick(logger = console) {
  await tick(logger);
}
