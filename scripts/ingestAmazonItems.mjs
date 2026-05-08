// Ingest Amazon items into the catalog by POSTing them to the backend's
// batch ingestion endpoint. The backend then runs the existing
// `runImportAndEnrichPipeline(...)` for each item and auto-discovers
// Sephora / Ulta / brand_official enrichment candidates.
//
// Usage:
//   node scripts/ingestAmazonItems.mjs path/to/items.json [--token=...] [--api=http://localhost:8787]
//
// items.json format:
//   {
//     "items": [
//       {
//         "asin": "B07L1PHSY9",
//         "title": "Tatcha The Water Cream ...",
//         "brand": "Tatcha",
//         "url": "https://www.amazon.com/dp/B07L1PHSY9",
//         "imageUrl": "https://...",
//         "priceAmount": 70.00,
//         "priceCurrency": "USD",
//         "category": "Moisturizer",
//         "size": "50 ml",
//         "ingredientsText": "..."   // optional, will fall back to Sephora enrichment
//       },
//       ...
//     ],
//     "autoDiscoverCandidates": true,
//     "candidateLimit": 60
//   }

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const opts = { file: null, token: null, api: 'http://localhost:8787' };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--token=')) opts.token = arg.slice('--token='.length);
    else if (arg.startsWith('--api=')) opts.api = arg.slice('--api='.length).replace(/\/$/, '');
    else if (!arg.startsWith('--') && !opts.file) opts.file = arg;
  }
  return opts;
}

async function loginIfNeeded(api, token) {
  if (token) return token;
  const email = process.env.LILLASY_ADMIN_EMAIL ?? 'sarah@lillasy.com';
  const password = process.env.LILLASY_ADMIN_PASSWORD ?? 'demo1234';
  const res = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`auth login failed (${res.status}): ${detail}`);
  }
  const body = await res.json();
  return body.token;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.file) {
    console.error('Usage: node scripts/ingestAmazonItems.mjs path/to/items.json [--token=...] [--api=http://localhost:8787]');
    process.exit(1);
  }
  const filePath = resolve(opts.file);
  const raw = await readFile(filePath, 'utf8');
  const payload = JSON.parse(raw);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error('items.json must contain an `items` array');
  }

  const token = await loginIfNeeded(opts.api, opts.token);
  console.log(`POST ${opts.api}/api/admin/amazon/ingest-batch (items=${payload.items.length})`);

  const res = await fetch(`${opts.api}/api/admin/amazon/ingest-batch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Request failed (${res.status}): ${text}`);
    process.exit(1);
  }
  const summary = JSON.parse(text);
  console.log(JSON.stringify(summary, null, 2));

  const failed = (summary.items ?? []).filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\n${failed.length} item(s) failed:`);
    for (const item of failed) {
      console.error(`  - ${item.asin}: ${item.error}`);
    }
    process.exit(2);
  }
}

main().catch((error) => {
  console.error('[amazon-ingest] fatal:', error?.message ?? error);
  process.exit(1);
});
