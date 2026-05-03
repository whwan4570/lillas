
  # Skincare Recommendation Platform

  This is a code bundle for Skincare Recommendation Platform. The original project is available at https://www.figma.com/design/CbFtcP6dYXkqKKLoFaAaGw/Skincare-Recommendation-Platform.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  Run `npm run dev:server` to start the backend (also boots the Sephora scheduler when enabled).

  ## Deploy backend to Render

  This repository includes a `render.yaml` Blueprint so Render can create the
  backend service with sane defaults in one go.

  1. In Render, choose **New + → Blueprint** and select this repo.
  2. Render reads `render.yaml` and creates `lillasy-api` with:
     - build: `pnpm install && prisma generate`
     - start: `node server/index.mjs`
     - health check: `/api/health`
     - `TOKEN_SECRET` auto-generated
  3. After creation, fill only the `sync: false` env vars in Render dashboard:
     - `DATABASE_URL`
     - `DIRECT_URL`
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET`
  4. Add custom domain `api.lillasy.com` in Render.
  5. Set `GOOGLE_REDIRECT_URI=https://api.lillasy.com/api/auth/google/callback`.
  6. In Render Shell (or local once with production env vars), run one time:
     - `pnpm prisma db push`

  A copy/paste template for these values is in `.env.render.example`.

  ## Sephora live crawler

  The backend ships with a Sephora product crawler that fetches a product page,
  parses the embedded `__NEXT_DATA__` and JSON-LD blocks, and upserts the result
  into the `ImportedProduct` table. The same data set powers the existing text
  importer, so live and text-imported products land in one place.

  ### One-time setup

  1. Copy `.env.example` to `.env` and adjust values.
  2. Set `SEPHORA_CRAWLER_ENABLED=true` to let the in-process scheduler run a
     refresh once every `SEPHORA_CRAWLER_INTERVAL_HOURS` (default `24`).
  3. Add the Sephora products you want to track (an admin token is required —
     it's the same auth token returned by `/api/auth/login`).

     ```bash
     curl -X POST http://localhost:8787/api/admin/sephora/targets \
       -H "Authorization: Bearer $TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"sourceItemId":"2773299","label":"Supergoop! Mineral Unseen SPF 40"}'
     ```

     You may also pass `sourceUrl` (a full Sephora product URL containing
     `/P<id>`) instead of `sourceItemId`; the API will derive the id for you.

  ### Triggering crawls

  - **Automatic (recommended).** Start the backend with `npm run dev:server`.
    When `SEPHORA_CRAWLER_ENABLED=true` the scheduler polls every 5 minutes,
    detects whether 24 hours have passed since the last successful run, and
    refreshes every enabled target.
  - **Manual via API:** `POST /api/admin/sephora/run` — runs immediately and
    returns a summary of processed/succeeded/failed counts.
  - **CLI / cron / Windows Task Scheduler:** `npm run crawl:sephora` runs the
    same pipeline in a one-shot process. Useful when you prefer an external
    scheduler over the in-process one.

  ### Inspecting status

  - `GET /api/admin/sephora/targets` — list configured targets and their last
    crawl status.
  - `GET /api/admin/sephora/runs?limit=20` — last crawler runs (status,
    processed/succeeded/failed counts, error message if any).
  - `GET /api/admin/imported-products` — the catalog itself; freshly crawled
    items expose a `crawledAt` timestamp plus standardized v2 metadata
    (`schemaVersion`, `qualityScore`, `warnings`, `sizeMl`, `sizeOz`).

  ### Standardization (schema v2) and backfill

  Every product written to `ImportedProduct` is normalized through
  `server/sephoraSchema.mjs` (`standardizeProduct(...)`). It strips HTML,
  decodes entities, normalizes smart quotes (e.g. `Kiehl's`), parses size
  into ml/oz, dedupes arrays, clamps prices/ratings, and computes a
  `qualityScore` (0–100) plus `warnings` for missing required fields.
  Failure thresholds (high failure rate, consecutive failures, bot blocking,
  stale targets) are evaluated after every run by
  `server/crawlerAlerts.mjs` and optionally posted to a Slack/Discord
  webhook (`SEPHORA_ALERT_WEBHOOK_URL`).

  After deploying the v2 schema (`pnpm prisma db push`), backfill the
  existing rows so they get the new columns populated:

  ```bash
  # Preview only (no writes)
  pnpm db:backfill:sephora -- --dry-run

  # Re-standardize every row
  pnpm db:backfill:sephora

  # Only rows still on schemaVersion < 2
  pnpm db:backfill:sephora -- --only-stale
  ```

  Full schema reference: `docs/sephora-schema-v1.md`.

  ### Choosing a fetcher (Akamai bypass)

  Sephora's product pages are protected by Akamai BotManager — direct Node
  `fetch` requests are answered with `403 Access Denied` plus a JavaScript
  challenge that only a real browser can run. The crawler ships with two
  fetchers; pick one with the `SEPHORA_FETCHER` env var.

  | `SEPHORA_FETCHER` | What it does | When to use |
  |---|---|---|
  | `fetch` (default) | Plain `fetch()` with browser-like headers | Local mocks / sources that don't have anti-bot |
  | `playwright` | Headless Chromium that runs the Akamai challenge | The only path that actually works against live `sephora.com` |

  One-time setup for the Playwright fetcher:

  ```bash
  pnpm add -D playwright
  npx playwright install chromium
  ```

  Then enable it via env:

  ```bash
  SEPHORA_FETCHER=playwright npm run crawl:sephora
  ```

  The Playwright fetcher reuses a single Chromium instance for the whole run
  (faster, lower memory). If Chromium itself is detected as a bot (Akamai
  sometimes targets headless fingerprints or specific IP ranges), the crawler
  reports `bot_challenge` cleanly instead of saving garbage data.

  When the default `chromium` headless build still gets blocked, try in order:

  | Env var | Effect |
  |---|---|
  | `SEPHORA_PLAYWRIGHT_HEADLESS=false` | Pops a visible browser window — much harder for Akamai to fingerprint |
  | `SEPHORA_PLAYWRIGHT_CHANNEL=chrome` | Uses locally installed real Chrome instead of bundled Chromium |
  | `SEPHORA_PLAYWRIGHT_PROXY=http://user:pass@host:port` | Routes traffic through a residential proxy (datacenter/VPN IPs are usually pre-flagged) |

  Sephora's BotManager is aggressive against datacenter/VPN IPs and known
  headless fingerprints, so a clean residential IP + headed real Chrome is
  usually required for sustained crawling.

  ### Production crawl tuning (verified)

  Live verification (May 2026) confirmed that the following combo successfully
  pulls real product data from `sephora.com` (brand, name, price, rating,
  review count, image URLs):

  ```bash
  SEPHORA_FETCHER=playwright
  SEPHORA_PLAYWRIGHT_HEADLESS=false        # or true with stealth, see below
  SEPHORA_PLAYWRIGHT_CHANNEL=chrome        # use locally installed Chrome
  SEPHORA_PLAYWRIGHT_PERSISTENT=true       # reuse cookies between runs
  SEPHORA_PLAYWRIGHT_WARMUP=true           # visit sephora.com first
  SEPHORA_PLAYWRIGHT_RESET_AFTER_BLOCKS=2  # reset context if Akamai catches on
  SEPHORA_REQUEST_DELAY_MS=30000           # 30 s between requests
  ```

  Stealth patches are applied automatically when `playwright-extra` +
  `puppeteer-extra-plugin-stealth` are installed (already in `devDependencies`).
  These hide `navigator.webdriver`, the headless Chromium fingerprint, and
  similar tells.

  Discontinued items (e.g. SKU redirected to `/search?keyword=productnotcarried`)
  are detected and saved as `not_found`, not as silent empty rows.

  Failure modes you may still see:

  - **5+ targets in one run = bot challenge**: pace the crawl with
    `SEPHORA_REQUEST_DELAY_MS=30000` (default) and let `RESET_AFTER_BLOCKS`
    auto-recycle the browser context.
  - **All targets blocked**: the IP is flagged. Switch on a residential
    proxy via `SEPHORA_PLAYWRIGHT_PROXY` or run the crawler from a residential
    machine.

  ### Connecting to Supabase (Postgres)

  The default storage is a local SQLite file (`dev.db`). To use Supabase
  Postgres instead:

  1. Create a Supabase project. From **Project Settings → Database** copy:
     - **Pooler** (Transaction mode) connection string → `DATABASE_URL`
     - **Direct** connection string → `DIRECT_URL`
  2. In `.env`:

     ```
     DATABASE_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
     DIRECT_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres"
     ```

  3. In `prisma/schema.prisma`, change the datasource:

     ```prisma
     datasource db {
       provider  = "postgresql"
       url       = env("DATABASE_URL")
       directUrl = env("DIRECT_URL")
     }
     ```

  4. Generate the client and push the schema:

     ```bash
     pnpm prisma generate
     pnpm prisma db push
     ```

  All crawler-related data access (`ImportedProduct`, `SephoraTarget`,
  `CrawlerRun`) goes through the Prisma model API and runs on either provider.
  The legacy `ensureSqlSchema()` bootstrap (which uses SQLite-specific raw SQL)
  automatically becomes a no-op when `DATABASE_URL` is Postgres — Prisma's
  `db push` is responsible for creating those tables on Supabase.

  ### Etiquette and safety

  Sephora does not publish a public crawling API and uses anti-bot protection.
  The crawler ships with conservative defaults to stay polite, but **you are
  responsible** for reviewing Sephora's Terms of Service and `robots.txt`
  before enabling it for your account or environment:

  - Sequential requests (no concurrency) with a `requestDelayMs` gap (default
    `2500ms`) between targets.
  - Browser-like `User-Agent` and headers; configurable via `SEPHORA_USER_AGENT`.
  - Exponential backoff on `429`/`503` responses and timeouts.
  - Bot-challenge detection (`captcha`, `Akamai`, `Pardon our interruption`)
    surfaces a clear `bot_challenge` error instead of writing garbage data.
  - Failures are recorded per target (`lastStatus`, `lastError`) and per run
    (`CrawlerRun` table) so you can audit what happened.

  Keep the target list small (start with a handful of products), monitor the
  `CrawlerRun` rows, and back off if Sephora blocks the requests.
  