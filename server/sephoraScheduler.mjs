import {
  getLastSuccessfulSephoraRun,
  parseIntervalHours,
  runSephoraCrawl
} from './sephoraRunner.mjs';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let timer = null;
let inFlight = false;

function isEnabled() {
  const flag = String(process.env.SEPHORA_CRAWLER_ENABLED ?? '').toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

function intervalMs() {
  const hours = parseIntervalHours(process.env.SEPHORA_CRAWLER_INTERVAL_HOURS, 24);
  return hours * 60 * 60 * 1000;
}

async function tick(logger = console) {
  if (inFlight) return;
  if (!isEnabled()) return;
  try {
    inFlight = true;
    const lastRun = await getLastSuccessfulSephoraRun();
    const lastRunAt = lastRun?.completedAt ? Date.parse(lastRun.completedAt) : 0;
    const now = Date.now();
    if (lastRunAt && now - lastRunAt < intervalMs()) return;
    await runSephoraCrawl({ trigger: 'scheduler', logger });
  } catch (error) {
    logger.error?.(`[sephora-scheduler] tick failed: ${error?.message ?? error}`);
  } finally {
    inFlight = false;
  }
}

export function startSephoraScheduler({ logger = console, immediate = true } = {}) {
  if (timer) return timer;
  if (!isEnabled()) {
    logger.info?.(
      '[sephora-scheduler] disabled (set SEPHORA_CRAWLER_ENABLED=true to enable daily updates).'
    );
    return null;
  }
  const hours = parseIntervalHours(process.env.SEPHORA_CRAWLER_INTERVAL_HOURS, 24);
  logger.info?.(
    `[sephora-scheduler] enabled (interval=${hours}h, poll=${POLL_INTERVAL_MS / 60000}m)`
  );
  if (immediate) setImmediate(() => tick(logger).catch(() => {}));
  timer = setInterval(() => {
    tick(logger).catch(() => {});
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

export function stopSephoraScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runSephoraSchedulerTick(logger = console) {
  await tick(logger);
}
