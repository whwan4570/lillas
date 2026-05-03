import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { SephoraCrawlError, buildProductUrl } from './sephoraCrawler.mjs';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const NEXT_DATA_SELECTOR = 'script#__NEXT_DATA__';
const SEPHORA_HOME = 'https://www.sephora.com/';

let chromiumPromise = null;
let contextPromise = null;
let warmedUp = false;
let shutdownInstalled = false;
let consecutiveBotChallenges = 0;
const MAX_BOT_CHALLENGES_BEFORE_RESET = Number(process.env.SEPHORA_PLAYWRIGHT_RESET_AFTER_BLOCKS) || 2;

async function loadChromium() {
  if (!chromiumPromise) {
    chromiumPromise = (async () => {
      try {
        const { chromium } = await import('playwright-extra');
        try {
          const stealthMod = await import('puppeteer-extra-plugin-stealth');
          const stealth = (stealthMod.default || stealthMod)();
          chromium.use(stealth);
        } catch (stealthError) {
          console.warn(
            '[sephora-playwright] stealth plugin unavailable, continuing without it:',
            stealthError?.message ?? stealthError
          );
        }
        return chromium;
      } catch (extraError) {
        // Fallback to plain playwright if playwright-extra isn't available.
        try {
          const { chromium } = await import('playwright');
          return chromium;
        } catch (error) {
          chromiumPromise = null;
          throw new SephoraCrawlError(
            'Playwright is not installed. Run "pnpm add -D playwright" and "npx playwright install chromium".',
            { kind: 'playwright_missing' }
          );
        }
      }
    })();
  }
  return chromiumPromise;
}

function buildLaunchOptions() {
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
  return {
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
  };
}

function buildContextOptions() {
  return {
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
  };
}

async function resolveUserDataDir() {
  const explicit = process.env.SEPHORA_PLAYWRIGHT_USER_DATA_DIR;
  if (explicit) return explicit;
  if (String(process.env.SEPHORA_PLAYWRIGHT_PERSISTENT ?? '').toLowerCase() === 'true') {
    const dir = path.join(os.tmpdir(), 'lillas-sephora-playwright');
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
  return null;
}

async function applyAntiDetection(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' }
      ]
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    window.chrome = window.chrome || { runtime: {}, app: {} };
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }
  });
  const blockResources =
    String(process.env.SEPHORA_PLAYWRIGHT_BLOCK_RESOURCES ?? 'false').toLowerCase() === 'true';
  if (blockResources) {
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });
  }
}

async function getContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const chromium = await loadChromium();
    const launchOptions = buildLaunchOptions();
    const userDataDir = await resolveUserDataDir();
    let context;
    if (userDataDir) {
      try {
        context = await chromium.launchPersistentContext(userDataDir, {
          ...launchOptions,
          ...buildContextOptions()
        });
      } catch (error) {
        contextPromise = null;
        throw new SephoraCrawlError(
          `Failed to launch persistent Chromium context at ${userDataDir}: ${error?.message ?? error}`,
          { kind: 'playwright_launch_failed' }
        );
      }
    } else {
      let browser;
      try {
        browser = await chromium.launch(launchOptions);
      } catch (error) {
        contextPromise = null;
        throw new SephoraCrawlError(
          'Failed to launch Chromium. Run "npx playwright install chromium" first. ' +
            (error?.message ?? ''),
          { kind: 'playwright_launch_failed' }
        );
      }
      context = await browser.newContext(buildContextOptions());
      context.__ownerBrowser = browser;
    }
    await applyAntiDetection(context);
    installShutdownHook();
    return context;
  })();
  return contextPromise;
}

async function warmUpSession(context) {
  if (warmedUp) return;
  if (String(process.env.SEPHORA_PLAYWRIGHT_WARMUP ?? 'true').toLowerCase() === 'false') {
    warmedUp = true;
    return;
  }
  const page = await context.newPage();
  try {
    await page.goto(SEPHORA_HOME, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    await delay(1500 + Math.floor(Math.random() * 1500));
    await page.mouse.move(200, 200);
    await page.mouse.move(600, 400, { steps: 10 });
    await page.evaluate(() => window.scrollBy(0, 400));
    await delay(800);
    warmedUp = true;
  } catch (error) {
    console.warn('[sephora-playwright] warmup failed:', error?.message ?? error);
  } finally {
    await page.close().catch(() => {});
  }
}

function installShutdownHook() {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  const shutdown = async () => {
    try {
      if (contextPromise) {
        const ctx = await contextPromise.catch(() => null);
        if (ctx) {
          const owner = ctx.__ownerBrowser;
          await ctx.close().catch(() => {});
          if (owner) await owner.close().catch(() => {});
        }
      }
    } finally {
      contextPromise = null;
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
      if (ctx) {
        const owner = ctx.__ownerBrowser;
        await ctx.close().catch(() => {});
        if (owner) await owner.close().catch(() => {});
      }
    }
  } finally {
    contextPromise = null;
    warmedUp = false;
    consecutiveBotChallenges = 0;
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

function looksLikeUnavailable(html) {
  if (!html) return false;
  const sample = html.slice(0, 8000).toLowerCase();
  return sample.includes('this product is not available') || sample.includes('sorry, this product');
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
      await warmUpSession(context);
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

      const finalUrl = page.url();
      if (
        /productnotcarried/i.test(finalUrl) ||
        /\/search\?/i.test(finalUrl) ||
        /\/category\//i.test(finalUrl)
      ) {
        throw new SephoraCrawlError(
          `Sephora product no longer carried (redirect to ${finalUrl})`,
          { status, kind: 'not_found', sourceItemId }
        );
      }

      let html = await page.content();
      if (status === 403 || looksLikeBotChallenge(html)) {
        try {
          await page.waitForLoadState('networkidle', { timeout: 12_000 });
        } catch {
          // ignore; we'll reload below
        }
        await delay(1500 + Math.floor(Math.random() * 1500));
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
        consecutiveBotChallenges += 1;
        if (consecutiveBotChallenges >= MAX_BOT_CHALLENGES_BEFORE_RESET) {
          console.warn(
            `[sephora-playwright] ${consecutiveBotChallenges} consecutive bot challenges — resetting browser context.`
          );
          await closePlaywrightBrowser().catch(() => {});
          consecutiveBotChallenges = 0;
        }
        throw new SephoraCrawlError(
          `Sephora returned a bot/captcha challenge for ${url} (status=${status})`,
          { status, kind: 'bot_challenge', sourceItemId }
        );
      }
      if (looksLikeUnavailable(html)) {
        throw new SephoraCrawlError(
          `Sephora product unavailable / discontinued: ${url}`,
          { status, kind: 'unavailable', sourceItemId }
        );
      }
      if (!response || (status >= 400 && status !== 404)) {
        throw new SephoraCrawlError(`Sephora request failed (${status}): ${url}`, {
          status,
          kind: 'http_error',
          sourceItemId
        });
      }
      consecutiveBotChallenges = 0;
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
