import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main() {
  const sourcePath = resolve('scripts/lillasIngestBookmarklet.source.js');
  const source = await readFile(sourcePath, 'utf8');
  // Keep source as-is before encoding so we never corrupt literals like
  // "http://..." while trying to strip comments with regex.
  const compact = source.trim();
  const bookmarklet = `javascript:${encodeURIComponent(compact)}`;
  console.log('\nCopy this into a browser bookmark URL:\n');
  console.log(bookmarklet);
  console.log('\nLength:', bookmarklet.length);
}

main().catch((error) => {
  console.error('[buildBookmarklet] failed:', error?.message ?? error);
  process.exit(1);
});
