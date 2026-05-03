#!/usr/bin/env node
// Backfill ImportedProduct rows to Sephora standardized schema v2.
//
// Usage:
//   pnpm db:backfill:sephora              # backfill all rows
//   pnpm db:backfill:sephora -- --dry-run # show planned updates only
//   pnpm db:backfill:sephora -- --limit=50
//   pnpm db:backfill:sephora -- --only-stale
//
// The script reads each ImportedProduct row, runs it through
// `standardizeProduct(...)`, and writes back the normalized columns
// (including the v2 metadata: schemaVersion, qualityScore, warnings,
// sizeMl, sizeOz).

import { paginateImportedProducts, upsertImportedProduct } from './dbStore.mjs';
import { SEPHORA_SCHEMA_VERSION, standardizeProduct } from './sephoraSchema.mjs';

function parseArgs(argv) {
  const opts = { dryRun: false, limit: null, onlyStale: false, batchSize: 50 };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run' || arg === '-n') opts.dryRun = true;
    else if (arg === '--only-stale') opts.onlyStale = true;
    else if (arg.startsWith('--limit=')) opts.limit = Number(arg.split('=')[1]) || null;
    else if (arg.startsWith('--batch-size=')) opts.batchSize = Number(arg.split('=')[1]) || 50;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`[backfill] unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: pnpm db:backfill:sephora [-- options]

Options:
  --dry-run, -n        Print planned changes without writing.
  --limit=<n>          Process at most N rows.
  --only-stale         Skip rows already at the current schemaVersion.
  --batch-size=<n>     Page size when reading rows (default 50).
  --help, -h           Show this help.
`);
}

async function* iterateAllProducts({ batchSize }) {
  let cursor = null;
  while (true) {
    const { items, nextCursor } = await paginateImportedProducts({ cursor, take: batchSize });
    if (!items.length) return;
    for (const item of items) yield item;
    if (nextCursor == null) return;
    cursor = nextCursor;
  }
}

function summarizeChange(before, after) {
  const fields = ['name', 'brand', 'priceAmount', 'ratingValue', 'reviewCount', 'size', 'sizeMl', 'sizeOz'];
  const diffs = [];
  for (const field of fields) {
    if (before?.[field] !== after?.[field]) {
      diffs.push(`${field}: ${JSON.stringify(before?.[field])} -> ${JSON.stringify(after?.[field])}`);
    }
  }
  return diffs;
}

async function run() {
  const opts = parseArgs(process.argv);
  const startedAt = Date.now();
  console.log(
    `[backfill] start (dryRun=${opts.dryRun}, onlyStale=${opts.onlyStale}, limit=${opts.limit ?? '∞'}, schemaVersion=${SEPHORA_SCHEMA_VERSION})`
  );

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  let withWarnings = 0;
  let qualitySum = 0;
  let scanned = 0;
  let processed = 0;

  for await (const product of iterateAllProducts({ batchSize: opts.batchSize })) {
    scanned += 1;
    if (opts.onlyStale && (product.schemaVersion ?? 1) >= SEPHORA_SCHEMA_VERSION) {
      continue;
    }
    if (opts.limit && processed >= opts.limit) break;
    processed += 1;

    try {
      const standardized = standardizeProduct(product);
      qualitySum += standardized.qualityScore ?? 0;
      if (standardized.warnings.length) withWarnings += 1;

      const diffs = summarizeChange(product, standardized);
      const sameVersion = (product.schemaVersion ?? 1) === standardized.schemaVersion;
      if (!diffs.length && sameVersion && (product.qualityScore ?? null) === standardized.qualityScore) {
        unchanged += 1;
        continue;
      }

      if (opts.dryRun) {
        console.log(
          `[backfill] would update ${standardized.sourceItemId} (quality=${standardized.qualityScore}, warnings=${standardized.warnings.length}) ${diffs.join(' | ')}`
        );
        updated += 1;
        continue;
      }

      await upsertImportedProduct(standardized);
      updated += 1;
      if ((updated + errors) % 25 === 0) {
        console.log(`[backfill] progress processed=${processed} updated=${updated}`);
      }
    } catch (error) {
      errors += 1;
      console.error(
        `[backfill] failed ${product.sourceItemId}: ${error?.message ?? error}`
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const avgQuality = processed ? Math.round(qualitySum / processed) : 0;
  console.log(
    `[backfill] done in ${elapsedMs}ms — scanned=${scanned} processed=${processed} updated=${updated} unchanged=${unchanged} errors=${errors} withWarnings=${withWarnings} avgQuality=${avgQuality}${opts.dryRun ? ' (dry run)' : ''}`
  );

  if (errors > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('[backfill] fatal:', error);
  process.exitCode = 1;
});
