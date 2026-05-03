import { describe, expect, it } from 'vitest';
import {
  ALERT_KINDS,
  evaluateAlertsFromState,
  formatAlertsForWebhook,
  notifyAlerts,
  STALE_TARGET_DAYS
} from './crawlerAlerts.mjs';

const day = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-01T00:00:00Z');

function failedRun(id = 1) {
  return { id, status: 'failed' };
}
function completedRun(id = 1) {
  return { id, status: 'completed' };
}

describe('evaluateAlertsFromState', () => {
  it('returns no alerts for a healthy run', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 10, processed: 10, succeeded: 10, failed: 0, status: 'completed' },
      recentRuns: [completedRun(10), completedRun(9), completedRun(8)],
      targets: [
        { sourceItemId: 'a', enabled: true, lastStatus: 'ok', lastCrawledAt: new Date(NOW - day) },
        { sourceItemId: 'b', enabled: true, lastStatus: 'ok', lastCrawledAt: new Date(NOW - day) },
        { sourceItemId: 'c', enabled: true, lastStatus: 'ok', lastCrawledAt: new Date(NOW - day) }
      ],
      now: NOW
    });
    expect(alerts).toEqual([]);
  });

  it('alerts on high failure rate when processed >= 3', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 11, processed: 4, succeeded: 1, failed: 3, status: 'partial' },
      recentRuns: [],
      targets: [],
      now: NOW
    });
    expect(alerts.some((a) => a.kind === ALERT_KINDS.HIGH_FAILURE_RATE)).toBe(true);
  });

  it('does not alert on failure rate when processed < 3', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 12, processed: 2, succeeded: 0, failed: 2, status: 'failed' },
      recentRuns: [],
      targets: [],
      now: NOW
    });
    expect(alerts.some((a) => a.kind === ALERT_KINDS.HIGH_FAILURE_RATE)).toBe(false);
  });

  it('alerts on consecutive failures', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 13, processed: 1, succeeded: 0, failed: 1, status: 'failed' },
      recentRuns: [failedRun(13), failedRun(12), failedRun(11), completedRun(10)],
      targets: [],
      now: NOW
    });
    const consec = alerts.find((a) => a.kind === ALERT_KINDS.CONSECUTIVE_FAILURES);
    expect(consec).toBeTruthy();
    expect(consec.consecutive).toBe(3);
    expect(consec.severity).toBe('critical');
  });

  it('alerts on bot blocking ratio', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 14, processed: 3, succeeded: 0, failed: 3, status: 'failed' },
      recentRuns: [],
      targets: [
        { sourceItemId: 'a', enabled: true, lastStatus: 'bot_challenge', lastCrawledAt: new Date(NOW - day) },
        { sourceItemId: 'b', enabled: true, lastStatus: 'bot_challenge', lastCrawledAt: new Date(NOW - day) },
        { sourceItemId: 'c', enabled: true, lastStatus: 'ok', lastCrawledAt: new Date(NOW - day) }
      ],
      now: NOW
    });
    expect(alerts.some((a) => a.kind === ALERT_KINDS.BOT_BLOCKING)).toBe(true);
  });

  it('alerts on stale targets', () => {
    const alerts = evaluateAlertsFromState({
      currentRun: { runId: 15, processed: 1, succeeded: 1, failed: 0, status: 'completed' },
      recentRuns: [],
      targets: [
        {
          sourceItemId: 'old',
          enabled: true,
          lastStatus: 'ok',
          lastCrawledAt: new Date(NOW - (STALE_TARGET_DAYS + 1) * day)
        },
        { sourceItemId: 'fresh', enabled: true, lastStatus: 'ok', lastCrawledAt: new Date(NOW - day) }
      ],
      now: NOW
    });
    const stale = alerts.find((a) => a.kind === ALERT_KINDS.STALE_TARGETS);
    expect(stale).toBeTruthy();
    expect(stale.targets).toEqual(['old']);
  });
});

describe('formatAlertsForWebhook', () => {
  it('returns null for empty input', () => {
    expect(formatAlertsForWebhook([])).toBe(null);
  });

  it('formats text body for slack/discord', () => {
    const body = formatAlertsForWebhook([
      { kind: 'x', severity: 'warning', message: 'hello' }
    ]);
    expect(body.text).toContain('Sephora crawler alerts');
    expect(body.text).toContain('[WARNING] x');
  });
});

describe('notifyAlerts', () => {
  it('skips delivery when no webhook configured', async () => {
    const logger = { warn: () => {}, error: () => {} };
    const result = await notifyAlerts(
      [{ kind: 'x', severity: 'warning', message: 'hi' }],
      { logger, webhookUrl: undefined, fetchImpl: undefined }
    );
    expect(result).toEqual({ delivered: false, count: 1 });
  });

  it('posts payload to webhook when provided', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200 };
    };
    const result = await notifyAlerts(
      [{ kind: 'x', severity: 'warning', message: 'hi' }],
      { logger: { warn: () => {}, error: () => {} }, webhookUrl: 'https://hooks/test', fetchImpl }
    );
    expect(result.delivered).toBe(true);
    expect(captured.url).toBe('https://hooks/test');
    expect(captured.init.method).toBe('POST');
    expect(JSON.parse(captured.init.body).text).toContain('hi');
  });

  it('reports failure when webhook returns non-2xx', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const result = await notifyAlerts(
      [{ kind: 'x', severity: 'critical', message: 'down' }],
      { logger: { warn: () => {}, error: () => {} }, webhookUrl: 'https://hooks/test', fetchImpl }
    );
    expect(result.delivered).toBe(false);
    expect(result.status).toBe(500);
  });
});
