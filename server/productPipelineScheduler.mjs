import { reprocessAmazonSources } from './productPipelineReprocessor.mjs';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let inFlight = false;
let lastRunAtMs = 0;

function isEnabled() {
  const flag = String(process.env.PRODUCT_PIPELINE_REPROCESS_ENABLED ?? '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

export function parsePipelineReprocessIntervalHours(value, fallback = 24) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(168, Math.max(1, num));
}

function intervalMs() {
  return parsePipelineReprocessIntervalHours(process.env.PRODUCT_PIPELINE_REPROCESS_INTERVAL_HOURS, 24) * 60 * 60 * 1000;
}

function parseStatuses() {
  const raw = String(process.env.PRODUCT_PIPELINE_REPROCESS_STATUSES ?? 'comparison_only');
  const statuses = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return statuses.length ? statuses : ['comparison_only'];
}

async function tick(logger = console) {
  if (inFlight) return;
  if (!isEnabled()) return;

  const now = Date.now();
  if (lastRunAtMs && now - lastRunAtMs < intervalMs()) return;

  try {
    inFlight = true;
    const limit = Number(process.env.PRODUCT_PIPELINE_REPROCESS_BATCH_SIZE ?? 25);
    const candidateLimit = Number(process.env.PRODUCT_PIPELINE_REPROCESS_CANDIDATE_LIMIT ?? 60);
    const statuses = parseStatuses();

    const summary = await reprocessAmazonSources({
      limit,
      statuses,
      autoDiscoverCandidates: true,
      candidateLimit,
      trigger: 'scheduler',
      logger
    });
    lastRunAtMs = Date.now();
    logger.info?.(
      `[pipeline-scheduler] reprocess completed attempted=${summary.attempted} succeeded=${summary.succeeded} failed=${summary.failed} statuses=${statuses.join(',')}`
    );
  } catch (error) {
    logger.error?.(`[pipeline-scheduler] tick failed: ${error?.message ?? error}`);
  } finally {
    inFlight = false;
  }
}

export function startProductPipelineScheduler({ logger = console, immediate = true } = {}) {
  if (timer) return timer;
  if (!isEnabled()) {
    logger.info?.(
      '[pipeline-scheduler] disabled (set PRODUCT_PIPELINE_REPROCESS_ENABLED=true to enable auto reprocess).'
    );
    return null;
  }

  const hours = parsePipelineReprocessIntervalHours(process.env.PRODUCT_PIPELINE_REPROCESS_INTERVAL_HOURS, 24);
  logger.info?.(
    `[pipeline-scheduler] enabled (interval=${hours}h, poll=${POLL_INTERVAL_MS / 60000}m)`
  );

  if (immediate) setImmediate(() => tick(logger).catch(() => {}));
  timer = setInterval(() => {
    tick(logger).catch(() => {});
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function stopProductPipelineScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runProductPipelineSchedulerTick(logger = console) {
  await tick(logger);
}

