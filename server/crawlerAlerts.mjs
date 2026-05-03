// Failure alert evaluation for the Sephora crawler.
//
// After every crawl run, callers pass the run summary into
// `evaluateRunForAlerts(...)`. The function reads recent run/target state and
// returns zero or more alert objects. `notifyAlerts(...)` then logs them and,
// if `SEPHORA_ALERT_WEBHOOK_URL` is set, posts a Slack/Discord-compatible
// payload to the webhook.

import { listCrawlerRuns, listSephoraTargets } from './dbStore.mjs';

export const FAILURE_RATE_THRESHOLD = 0.5;
export const CONSECUTIVE_FAILURE_THRESHOLD = 2;
export const STALE_TARGET_DAYS = 7;
export const BOT_RATIO_THRESHOLD = 0.3;
export const MIN_TARGETS_FOR_BOT_CHECK = 3;
export const MIN_PROCESSED_FOR_RATE_CHECK = 3;

export const ALERT_KINDS = Object.freeze({
  HIGH_FAILURE_RATE: 'high_failure_rate',
  CONSECUTIVE_FAILURES: 'consecutive_failures',
  BOT_BLOCKING: 'bot_blocking',
  STALE_TARGETS: 'stale_targets'
});

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function evaluateAlertsFromState({ currentRun, recentRuns = [], targets = [], now = Date.now() } = {}) {
  const alerts = [];
  if (!currentRun) return alerts;

  const processed = Number(currentRun.processed) || 0;
  const failed = Number(currentRun.failed) || 0;

  if (processed >= MIN_PROCESSED_FOR_RATE_CHECK) {
    const rate = failed / processed;
    if (rate >= FAILURE_RATE_THRESHOLD) {
      alerts.push({
        kind: ALERT_KINDS.HIGH_FAILURE_RATE,
        severity: rate >= 0.8 ? 'critical' : 'warning',
        message: `Sephora crawl run #${currentRun.runId ?? '?'} failure rate ${Math.round(rate * 100)}% (${failed}/${processed})`,
        runId: currentRun.runId ?? null
      });
    }
  }

  const consecutiveFailures = countLeadingFailures(recentRuns);
  if (consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    alerts.push({
      kind: ALERT_KINDS.CONSECUTIVE_FAILURES,
      severity: consecutiveFailures >= 3 ? 'critical' : 'warning',
      message: `Sephora crawler has failed ${consecutiveFailures} runs in a row`,
      consecutive: consecutiveFailures
    });
  }

  if (targets.length >= MIN_TARGETS_FOR_BOT_CHECK) {
    const blocked = targets.filter((t) => t.lastStatus === 'bot_challenge').length;
    const ratio = blocked / targets.length;
    if (ratio >= BOT_RATIO_THRESHOLD) {
      alerts.push({
        kind: ALERT_KINDS.BOT_BLOCKING,
        severity: 'critical',
        message: `Sephora bot/captcha block ratio ${Math.round(ratio * 100)}% (${blocked}/${targets.length})`,
        ratio
      });
    }
  }

  const staleCutoff = now - STALE_TARGET_DAYS * 24 * 60 * 60 * 1000;
  const staleTargets = targets
    .filter((t) => t.enabled !== false)
    .filter((t) => {
      const ts = toIsoOrNull(t.lastCrawledAt);
      if (!ts) return true;
      return Date.parse(ts) < staleCutoff;
    });
  if (staleTargets.length) {
    alerts.push({
      kind: ALERT_KINDS.STALE_TARGETS,
      severity: 'warning',
      message: `${staleTargets.length} Sephora target(s) not refreshed in ${STALE_TARGET_DAYS} days`,
      targets: staleTargets.map((t) => t.sourceItemId).slice(0, 20)
    });
  }

  return alerts;
}

function countLeadingFailures(recentRuns) {
  let n = 0;
  for (const run of recentRuns) {
    if (run.status === 'failed') n += 1;
    else break;
  }
  return n;
}

export async function evaluateRunForAlerts(currentRun) {
  const [recentRuns, targets] = await Promise.all([
    listCrawlerRuns({ source: 'sephora', limit: 5 }).catch(() => []),
    listSephoraTargets({ enabledOnly: true }).catch(() => [])
  ]);
  return evaluateAlertsFromState({ currentRun, recentRuns, targets });
}

export function formatAlertsForWebhook(alerts) {
  if (!alerts.length) return null;
  const lines = alerts.map((a) => `*[${a.severity.toUpperCase()}] ${a.kind}* — ${a.message}`);
  return { text: `Sephora crawler alerts:\n${lines.join('\n')}` };
}

export async function notifyAlerts(alerts, { logger = console, webhookUrl, fetchImpl } = {}) {
  if (!alerts || !alerts.length) return { delivered: false, count: 0 };
  for (const alert of alerts) {
    const line = `[crawler-alert][${alert.severity}][${alert.kind}] ${alert.message}`;
    if (alert.severity === 'critical') logger.error?.(line);
    else logger.warn?.(line);
  }
  const url = webhookUrl ?? process.env.SEPHORA_ALERT_WEBHOOK_URL;
  if (!url) return { delivered: false, count: alerts.length };
  const payload = formatAlertsForWebhook(alerts);
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return { delivered: false, count: alerts.length };
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      logger.warn?.(`[crawler-alert] webhook returned ${res.status}`);
      return { delivered: false, count: alerts.length, status: res.status };
    }
    return { delivered: true, count: alerts.length, status: res.status };
  } catch (error) {
    logger.warn?.(`[crawler-alert] webhook error: ${error?.message ?? error}`);
    return { delivered: false, count: alerts.length, error: error?.message ?? String(error) };
  }
}
