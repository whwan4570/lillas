# Amazon One-Click Ingest Bookmarklet

This bookmarklet lets you ingest the currently open Amazon product page into
`/api/admin/amazon/ingest-batch` with one click.

## What it extracts

- `asin` from `/dp/{ASIN}` URL or hidden ASIN input
- `title` from `#productTitle`
- `brand` from `#bylineInfo` / brand meta
- `imageUrl` from `#landingImage` (hi-res first)
- `priceAmount` from visible Amazon price blocks
- `size` from selected size variation
- `category` from the breadcrumb trail
- `url` as clean `https://{host}/dp/{ASIN}` (+ optional `?tag=...`)

The saved `url` is used by your app's **Buy Now** button.

## Setup

1. Start backend:
   - `pnpm dev:server`
2. Build bookmarklet URL:
   - `pnpm bookmarklet:build`
3. Copy printed `javascript:...` string.
4. Create a browser bookmark named `Lillas Ingest`.
5. Paste the string into bookmark URL/location.

## First run

On first click, it asks for:

- API base URL (default `http://localhost:8787`)
- Lillas admin email/password (to fetch bearer token)
- Optional affiliate tag (used for Buy Now URL `tag=...`)

These values are stored in `localStorage` on the current `amazon.*` domain.
After that, each product page is one-click ingest.

## Notes

- If token expires, the bookmarklet clears token and asks login again.
- It shows a top-right toast for success/error.
- CORS from Amazon origins is enabled in backend `server/http.mjs`.
