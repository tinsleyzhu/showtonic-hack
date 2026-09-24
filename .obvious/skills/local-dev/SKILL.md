---
name: local-dev
description: How to bring tinsleyzhu/showtonic-hack local dev up (verified onboarding run)
---

# Local Dev — Showtonic Hack

Record of the successful LOCAL-DEV onboarding pass (2026-09-24). Follow in order.

## 1. Runtimes

- Node **>= 22.13** is required (`engines` in package.json). The sandbox default `node` is
  v20.x and crashes vinext with `SyntaxError: 'node:fs/promises' does not provide an export
  named 'glob'`. Use the installed v22 at `~/node22/bin` — prepend to PATH:
  `export PATH=~/node22/bin:$PATH`. bun 1.3.14 is at `/opt/bun/bin/bun`.

## 2. Dependencies

- `bun install` (bun.lock is the source of truth). Do NOT trust `npm ci` —
  package-lock.json is out of sync (`Missing: @emnapi/runtime`).
- If `node_modules` is root-owned (image artifact), fix first:
  `sudo chown -R user:user node_modules` — otherwise Vite/miniflare fail with EACCES on
  `node_modules/.vite` and `node_modules/.mf`.

## 3. Convex backend (local, self-hosted — no cloud login possible in sandbox)

1. Binary already installed at `~/convex-local/convex-local-backend` (from
   get-convex/convex-backend GitHub releases, precompiled build).
2. Start it (tmux session `cxb`):
   `~/convex-local/convex-local-backend --instance-name showtonic-dev --instance-secret <secret>`
   - If it errors `missing _tables.by_id global`, delete the stale
     `~/convex_local_backend.sqlite3*` and restart.
   - Health check: `curl -s http://127.0.0.1:3210/` → HTTP 200.
3. Generate the admin key (matches instance name + secret):
   `~/convex-local/convex-local-backend keygen admin-key --instance-name showtonic-dev --instance-secret <secret>`
   → format `showtonic-dev|<hex>`. Write to `.env.convex-local`:
   ```
   CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
   CONVEX_SELF_HOSTED_ADMIN_KEY=showtonic-dev|<key>
   ```
4. Push schema/functions:
   `npx convex dev --env-file=.env.convex-local --typecheck disable --once`
   (`--dev-deployment local` triggers an interactive login — do not use it.)
5. Seed: `npx convex run --env-file=.env.convex-local seed:run`
   → `{artists: 8, shows: 14, venues: 3, users: 6, insertedLogs: 13}` (idempotent).

## 4. App env + dev server

1. `.env.local`: `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`
2. No leftover lock files needed checking; start in tmux (`dev` session):
   `npm run dev` → parse port from `Local: http://localhost:3000/` log line (port 3000).
3. First compile can return one 500 + `Internal server error: undefined` while the optimizer
   warms; subsequent requests are HTTP 200. `Failed to run dependency scan` warnings about
   `app/*.d.ts` are harmless noise.

## 5. Verify primary flow (evidence)

Headless Chromium via Playwright (`/tmp/pw`, browser in `~/.cache/ms-playwright`), zero
console/page errors, screenshots in `/tmp/evidence/`:

1. Landing → "Build my music diary" / "Already have a diary? Sign in"
2. Sign in with seeded handle `maya` → authenticated home: Festival Guide (Charli XCX · Aug 7 ·
   Golden Gate Park), Home Base San Francisco, seeded venues
3. Browse tab (Discover) → search box query executes against Convex (catalog: 7 shows)

Plus: `npm test` → 456/456 pass; `npm run lint` → 0 errors (26 warnings);
health: `:3210` and `:3000` both HTTP 200.

## 6. Optional (needs secret)

- Live JamBase catalog sync: `npx convex env set JAMBASE_API_KEY <key>` then the `Sync JamBase`
  control or `npx convex run jambase:syncCatalog '…'`. No key in sandbox — skipped.
