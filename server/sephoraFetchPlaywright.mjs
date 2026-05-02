import { setTimeout as delay } from 'node:timers/promises';
import { SephoraCrawlError, buildProductUrl } from './sephoraCrawler.mjs';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const NEXT_DATA_SELECTOR = 'script#__NEXT_DATA__';

let browserPromise = null;
let contextPromise = null;
let playwrightModulePromise = null;
let shutdownInstalled = false;

async function loadPlaywright() {
  if (!playwrightModulePromise) {
    playwrightModulePromise = import('playwright').catch((error) => {
      playwrightModulePromise = null;
      throw new SephoraCrawlError(
        'Playwright is not installed. Run "pnpm add -D playwright" and "npx playwright install chromium".',
        { kind: 'playwright_missing' }
      );
    });
  }
  return playwrightModulePromise;
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await loadPlaywright();
    const headlessFlag = String(process.env.SEPHORA_PLAYWRIGHT_HEADLESS ?? 'true').toLowerCase();
    const headless = headlessFlag !== 'false' && headlessFlag !== '0';
    const channel = process.env.SEPHORA_PLAYWRIGHT_CHANNEL || undefined;
    const proxyServer = process.env.SEPHORA_PLAYWRIGHT_PROXY || process.env.HTTPS_PROXY;
    const proxy = proxyServer
      ? {
          server: proxyServer,
          username: process.env.SEPHORA_PLAYWRIGHT_PROXY_USERNAME || undefined,
          password: process.env.SEPHORA_PLAYWRIGHT_PROXY_PASSWORD || undefined
        }
      : undefined;
    browserPromise = chromium
      .launch({
        headless,
        channel,
        proxy,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-default-browser-check',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      })
      .catch((error) => {
        browserPromise = null;
        throw new SephoraCrawlError(
          'Failed to launch Chromium. Run "npx playwright install chromium" first. ' +
            (error?.message ?? ''),
          { kind: 'playwright_launch_failed' }
        );
      });
    installShutdownHook();
  }
  return browserPromise;
}

async function getContext() {
  if (!contextPromise) {
    const browser = await getBrowser();
    contextPromise = browser.newContext({
      userAgent: process.env.SEPHORA_USER_AGENT || DEFAULT_USER_AGENT,
      viewport: { width: 1366, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not?A_Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      }
    });
    const context = await contextPromise;
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      window.chrome = window.chrome || { runtime: {} };
    });
    const blockResources = String(process.env.SEPHORA_PLAYWRIGHT_BLOCK_RESOURCES ?? 'false').toLowerCase() === 'true';
    if (blockResources) {
      await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'image' || type === 'media' || type === 'font') return route.abort();
        return route.continue();
      });
    }
  }
  return contextPromise;
}

function installShutdownHook() {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  const shutdown = async () => {
    try {
      if (contextPromise) {
        const ctx = await contextPromise.catch(() => null);
        if (ctx) await ctx.close().catch(() => {});
      }
    } finally {
      contextPromise = null;
    }
    try {
      if (browserPromise) {
        const br = await browserPromise.catch(() => null);
        if (br) await br.close().catch(() => {});
      }
    } finally {
      browserPromise = null;
    }
  };
  process.once('beforeExit', shutdown);
  process.once('SIGINT', () => {
    shutdown().finally(() => process.exit(130));
  });
  process.once('SIGTERM', () => {
    shutdown().finally(() => process.exit(143));
  });
}

export async function closePlaywrightBrowser() {
  try {
    if (contextPromise) {
      const ctx = await contextPromise.catch(() => null);
      if (ctx) await ctx.close().catch(() => {});
    }
  } finally {
    contextPromise = null;
  }
  try {
    if (browserPromise) {
      const br = await browserPromise.catch(() => null);
      if (br) await br.close().catch(() => {});
    }
  } finally {
    browserPromise = null;
  }
}

function looksLikeBotChallenge(html) {
  if (!html) return false;
  const sample = html.slice(0, 4000).toLowerCase();
  return (
    sample.includes('access denied') ||
    sample.includes('captcha') ||
    sample.includes('pardon our interruption') ||
    sample.includes('akamai bot')
  );
}

export async function fetchSephoraProductPagePlaywright(sourceItemId, options = {}) {
  const url = buildProductUrl(sourceItemId, options.sourceUrl);
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const maxRetries = Number(options.maxRetries) || DEFAULT_MAX_RETRIES;

  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    let page = null;
    try {
      const context = await getContext();
      page = await context.newPage();
      let response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      let status = response?.status() ?? 0;

      if (status === 404) {
        throw new SephoraCrawlError(`Sephora product not found (404): ${url}`, {
          status: 404,
          kind: 'not_found',
          sourceItemId
        });
      }
      if (status === 429 || status === 503) {
        throw new SephoraCrawlError(`Sephora rate-limited (${status}): ${url}`, {
          status,
          kind: 'rate_limited',
          sourceItemId
        });
      }

      let html = await page.content();
      if (status === 403 || looksLikeBotChallenge(html)) {
        try {
          await page.waitForLoadState('networkidle', { timeout: 12_000 });
        } catch {
          // ignore; we'll reload below
        }
        await delay(1500);
        try {
          response = await page.reload({ waitUntil: 'networkidle', timeout: timeoutMs });
          status = response?.status() ?? status;
        } catch {
          // ignore; will re-evaluate body below
        }
        html = await page.content();
      }

      try {
        await page.waitForSelector(NEXT_DATA_SELECTOR, { timeout: 8_000 });
        html = await page.content();
      } catch {
        // some pages don't expose __NEXT_DATA__; mapper handles fallbacks
      }

      if (looksLikeBotChallenge(html)) {
        throw new SephoraCrawlError(
          `Sephora returned a bot/captcha challenge for ${url} (status=${status})`,
          { status, kind: 'bot_challenge', sourceItemId }
        );
      }
      if (!response || (status >= 400 && status !== 404)) {
        throw new SephoraCrawlError(`Sephora request failed (${status}): ${url}`, {
          status,
          kind: 'http_error',
          sourceItemId
        });
      }
      return { url: response.url(), html };
    } catch (error) {
      lastError = error instanceof SephoraCrawlError
        ? error
        : new SephoraCrawlError(error?.message || 'Playwright navigation failed', {
            kind: error?.name === 'TimeoutError' ? 'timeout' : 'fetch_error',
            sourceItemId
          });
      const transient =
        lastError.kind === 'timeout' ||
        lastError.kind === 'rate_limited' ||
        lastError.kind === 'fetch_error' ||
        lastError.kind === 'bot_challenge';
      if (!transient || attempt >= maxRetries) throw lastError;
      const backoffMs = Math.min(15_000, 2_000 * 2 ** (attempt - 1));
      await delay(backoffMs);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
  throw lastError ?? new SephoraCrawlError('Playwright fetch failed (unknown)');
}
