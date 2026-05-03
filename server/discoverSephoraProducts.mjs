// Discover active Sephora product IDs by scraping a search page.
// Used to bootstrap or refresh SephoraTarget rows without manual lookup.
//
// Usage:
//   node server/discoverSephoraProducts.mjs                     # default: skincare best-sellers
//   node server/discoverSephoraProducts.mjs moisturizer
//   node server/discoverSephoraProducts.mjs "vitamin c serum" --limit=5

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (const arg of args) {
  if (arg.startsWith('--limit=')) flags.limit = Number(arg.split('=')[1]) || 10;
  else if (arg === '--help' || arg === '-h') {
    console.log('Usage: node server/discoverSephoraProducts.mjs [keyword] [--limit=N]');
    process.exit(0);
  } else positional.push(arg);
}
const keyword = positional.join(' ').trim() || 'best skincare';
const limit = Math.max(1, Math.min(50, flags.limit ?? 10));

const headlessFlag = String(process.env.SEPHORA_PLAYWRIGHT_HEADLESS ?? 'true').toLowerCase();
const headless = headlessFlag !== 'false' && headlessFlag !== '0';
const channel = process.env.SEPHORA_PLAYWRIGHT_CHANNEL || undefined;

console.error(
  `[discover] launching chromium (headless=${headless}, channel=${channel ?? 'bundled'}) for "${keyword}"`
);

const browser = await chromium.launch({
  headless,
  channel,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage']
});
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
});
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const url = `https://www.sephora.com/search?keyword=${encodeURIComponent(keyword)}`;
const page = await context.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

// Wait for product tiles to render. Sephora uses /product/<slug>-P<digits>.
try {
  await page.waitForSelector('a[href*="/product/"]', { timeout: 20_000 });
} catch {
  console.error('[discover] no product anchors appeared within 20s');
}
await page.waitForTimeout(2_500);

const items = await page.evaluate((max) => {
  const anchors = Array.from(document.querySelectorAll('a[href*="/product/"]'));
  const seen = new Map();
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/product\/(?:[a-z0-9-]+-)?P(\d+)/i);
    if (!m) continue;
    const itemId = m[1];
    if (seen.has(itemId)) continue;
    const labelText = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
    const tile = a.closest('[data-comp*="ProductTile" i]');
    const tileText = tile ? (tile.textContent || '').replace(/\s+/g, ' ').trim() : '';
    seen.set(itemId, {
      sourceItemId: itemId,
      sourceUrl: new URL(href.split('?')[0], location.origin).toString(),
      label: (labelText || tileText).slice(0, 200) || null
    });
    if (seen.size >= max) break;
  }
  return Array.from(seen.values());
}, limit);

console.error(`[discover] found ${items.length} candidate(s) for "${keyword}"`);

await page.close();
await context.close();
await browser.close();

console.log(JSON.stringify({ keyword, count: items.length, items }, null, 2));
