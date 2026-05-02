import { prisma } from './dbStore.mjs';
import { runSephoraCrawl } from './sephoraRunner.mjs';

function parseArgs(argv) {
  const args = { trigger: 'cli' };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--delay=')) args.requestDelayMs = Number(arg.slice('--delay='.length));
    else if (arg.startsWith('--timeout=')) args.timeoutMs = Number(arg.slice('--timeout='.length));
    else if (arg.startsWith('--retries=')) args.maxRetries = Number(arg.slice('--retries='.length));
    else if (arg.startsWith('--trigger=')) args.trigger = arg.slice('--trigger='.length);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(
    [
      'Usage: node server/runSephoraCrawl.mjs [options]',
      '',
      'Options:',
      '  --trigger=<name>     Identifier stored on the run (default: cli)',
      '  --delay=<ms>         Delay between requests (default: 2500)',
      '  --timeout=<ms>       Per-request timeout (default: 20000)',
      '  --retries=<n>        Max retries per target (default: 3)',
      '  --help               Show this help text',
      '',
      'The crawler reads enabled targets from the SephoraTarget table.',
      'Use POST /api/admin/sephora/targets to add targets while the server is running,',
      'or seed them by inserting rows into the SephoraTarget table directly.'
    ].join('\n')
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  try {
    const result = await runSephoraCrawl(args);
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0 && result.succeeded === 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('[sephora-crawler] fatal:', error?.message ?? error);
    process.exitCode = 1;
  } finally {
    if (String(process.env.SEPHORA_FETCHER ?? '').toLowerCase() === 'playwright') {
      try {
        const mod = await import('./sephoraFetchPlaywright.mjs');
        await mod.closePlaywrightBrowser();
      } catch {
        // ignore
      }
    }
    await prisma.$disconnect();
  }
}

main();
