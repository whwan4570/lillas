/* eslint-disable no-alert */
// Lillas Amazon one-click ingest bookmarklet source.
//
// Build bookmarklet text:
//   node scripts/buildBookmarklet.mjs
//
// First run asks for:
// - API base URL (default: http://localhost:8787)
// - Lillas admin email/password (used to get Bearer token)
// - Optional affiliate tag (for Buy Now URL tag=...)
//
// Saved in localStorage on amazon.* domain so next products are one-click.

(async () => {
  const KEY_BASE_URL = '__lillas_ingest_api_base_url';
  const KEY_TOKEN = '__lillas_ingest_bearer_token';
  const KEY_AFFILIATE_TAG = '__lillas_affiliate_tag';
  const KEY_EMAIL = '__lillas_ingest_email';

  function toast(message, tone = 'info') {
    const bg = tone === 'error' ? '#7f1d1d' : tone === 'success' ? '#14532d' : '#1f2937';
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = [
      'position:fixed',
      'top:16px',
      'right:16px',
      'z-index:2147483647',
      'max-width:360px',
      'padding:10px 12px',
      'border-radius:10px',
      'color:#fff',
      `background:${bg}`,
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      'box-shadow:0 10px 24px rgba(0,0,0,.3)'
    ].join(';');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function parseMoney(raw) {
    if (!raw) return null;
    const cleaned = String(raw).replace(/[^0-9.,-]+/g, '').replace(/,/g, '');
    const value = Number.parseFloat(cleaned);
    return Number.isFinite(value) ? value : null;
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node ? String(node.textContent || '').trim() : '';
  }

  function attr(selector, name) {
    const node = document.querySelector(selector);
    return node ? String(node.getAttribute(name) || '').trim() : '';
  }

  function extractAsin() {
    const fromPath = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (fromPath) return fromPath[1].toUpperCase();
    const fromInput = attr('input#ASIN', 'value') || attr('input[name=ASIN]', 'value');
    if (fromInput) return fromInput.toUpperCase();
    return '';
  }

  function extractBrand() {
    const byline = text('#bylineInfo');
    if (byline) {
      return byline
        .replace(/^Visit the\s+/i, '')
        .replace(/\s+Store$/i, '')
        .replace(/^Brand:\s*/i, '')
        .trim();
    }
    return attr('meta[name="brand"]', 'content') || '';
  }

  function extractImageUrl() {
    const hiRes =
      attr('#landingImage', 'data-old-hires') ||
      attr('#imgTagWrapperId img', 'data-old-hires') ||
      attr('#main-image-container img', 'data-old-hires');
    if (hiRes) return hiRes;
    const src =
      attr('#landingImage', 'src') ||
      attr('#imgTagWrapperId img', 'src') ||
      attr('img[data-a-image-name="landingImage"]', 'src');
    return src || '';
  }

  function extractSize() {
    return (
      text('#variation_size_name .selection') ||
      text('#variation_size_name .a-dropdown-prompt') ||
      text('#variation_size_name .a-button-text') ||
      ''
    );
  }

  function extractPrice() {
    const priceText =
      text('#corePrice_feature_div .a-offscreen') ||
      text('#tp_price_block_total_price_ww .a-offscreen') ||
      text('#priceblock_ourprice') ||
      text('#priceblock_dealprice') ||
      text('.a-price .a-offscreen');
    return parseMoney(priceText);
  }

  function extractCategory() {
    const crumbs = Array.from(
      document.querySelectorAll('#wayfinding-breadcrumbs_feature_div li a')
    )
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
    return crumbs[crumbs.length - 1] || '';
  }

  function cleanedProductUrl(asin, affiliateTag) {
    const base = `${location.protocol}//${location.host}/dp/${asin}`;
    if (!affiliateTag) return base;
    const url = new URL(base);
    url.searchParams.set('tag', affiliateTag);
    return url.toString();
  }

  async function ensureToken(apiBaseUrl) {
    const existing = localStorage.getItem(KEY_TOKEN);
    if (existing) return existing;
    const savedEmail = localStorage.getItem(KEY_EMAIL) || '';
    const email = prompt('Lillas admin email', savedEmail || 'sarah@lillasy.com');
    if (!email) throw new Error('Login canceled: email is required.');
    const password = prompt('Lillas admin password');
    if (!password) throw new Error('Login canceled: password is required.');

    const loginRes = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const loginBody = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok || !loginBody.token) {
      throw new Error(loginBody.error || `Login failed (${loginRes.status}).`);
    }
    localStorage.setItem(KEY_EMAIL, email);
    localStorage.setItem(KEY_TOKEN, loginBody.token);
    return loginBody.token;
  }

  try {
    if (!/amazon\./i.test(location.hostname)) {
      throw new Error('This bookmarklet runs only on Amazon product pages.');
    }

    const asin = extractAsin();
    if (!asin) throw new Error('Could not find ASIN on this page.');

    const title = text('#productTitle') || attr('meta[property="og:title"]', 'content');
    if (!title) throw new Error('Could not find product title on this page.');

    let apiBaseUrl = localStorage.getItem(KEY_BASE_URL) || '';
    if (!apiBaseUrl) {
      apiBaseUrl =
        prompt('Lillas API base URL', 'http://localhost:8787')?.trim().replace(/\/+$/, '') || '';
      if (!apiBaseUrl) throw new Error('API base URL is required.');
      localStorage.setItem(KEY_BASE_URL, apiBaseUrl);
    }

    let affiliateTag = localStorage.getItem(KEY_AFFILIATE_TAG);
    if (affiliateTag == null) {
      affiliateTag = prompt('Optional affiliate tag for Buy Now URL (leave blank to skip)', '') ?? '';
      localStorage.setItem(KEY_AFFILIATE_TAG, affiliateTag.trim());
    }

    const token = await ensureToken(apiBaseUrl);
    const payload = {
      items: [
        {
          asin,
          title,
          brand: extractBrand() || undefined,
          imageUrl: extractImageUrl() || undefined,
          category: extractCategory() || undefined,
          size: extractSize() || undefined,
          priceAmount: extractPrice() || undefined,
          priceCurrency: 'USD',
          url: cleanedProductUrl(asin, affiliateTag?.trim())
        }
      ],
      autoDiscoverCandidates: true,
      candidateLimit: 60
    };

    toast(`Ingesting ${asin}...`);

    const res = await fetch(`${apiBaseUrl}/api/admin/amazon/ingest-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem(KEY_TOKEN);
      }
      throw new Error(body.error || `Ingest failed (${res.status})`);
    }
    const item = body.items?.[0];
    if (!item?.ok) throw new Error(item?.error || 'Pipeline returned failure.');

    const status = item.result?.product?.status || 'unknown';
    toast(`Ingested ${asin} ✓ (status: ${status})`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast(message, 'error');
    console.error('[lillas-bookmarklet]', error);
  }
})();
