# Showtonic Hack — Agent Guidance

Live-music diary web app (Outside Lands hackathon build): log shows, backfill from photos,
get a shareable recap card, match taste with other users. JamBase (live music data) + Convex
(backend, storage, realtime).

## Stack

- **Frontend:** Next.js 16 App Router served through **vinext** (Vite + `@cloudflare/vite-plugin`,
  React Server Components) — runs on Node.js >= 22.13 (repo `engines` requirement)
- **Backend:** Convex 1.46 — schema in `convex/schema.ts`, functions in `convex/`
- **Styling:** Tailwind CSS 4
- **Runtime target:** Cloudflare Workers (via wrangler/miniflare in dev)
- **Package manager:** bun (bun.lock committed); package-lock.json exists but is out of sync —
  use `bun install`

## Local dev (verified 2026-09-24)

There is no Compose/Makefile. Two long-running processes are needed:

### 1. Convex backend (local, no cloud account needed)

```bash
# One-time setup (already done in this sandbox):
#   ~/convex-local/convex-local-backend        # binary from get-convex/convex-backend releases
#   .env.convex-local                          # CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY

~/convex-local/convex-local-backend --instance-name showtonic-dev --instance-secret <secret>
# Serves on http://127.0.0.1:3210 (SQLite at ~/convex_local_backend.sqlite3)

npx convex dev --env-file=.env.convex-local --typecheck disable --once   # push schema + functions
npx convex run --env-file=.env.convex-local seed:run                     # deterministic seed
```

`seed:run` is idempotent and offline-safe (8 artists, 14 shows, 3 venues, 6 users incl. `maya`,
`tinsley`, `leo`...). Optional live JamBase sync needs `JAMBASE_API_KEY` set in Convex — not
required for local dev.

### 2. App dev server

```bash
bun install          # or npm install
npm run dev          # WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext dev
```

Serves on **http://localhost:3000** (from startup log; `__debug` endpoint at `/__debug`).
`NEXT_PUBLIC_CONVEX_URL` must be set in `.env.local` (currently `http://127.0.0.1:3210`).

### Environment

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex HTTP endpoint the browser talks to |
| `CONVEX_SELF_HOSTED_URL` / `CONVEX_SELF_HOSTED_ADMIN_KEY` | `.env.convex-local` | CLI → local backend auth |
| `JAMBASE_API_KEY` | `npx convex env set` | Optional live catalog sync (`TODO(confirm)` — no key in sandbox) |

No auth secrets needed — the app has deliberately no authentication (sign-in is by local handle).

## Common commands

| Task | Command |
|---|---|
| Install deps | `bun install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Unit tests | `npm test` (`node --test`, 456 tests) |
| Push Convex functions | `npx convex dev --env-file=.env.convex-local --once` |
| Seed DB | `npx convex run --env-file=.env.convex-local seed:run` |
| Eval harness | `npm run eval` |

## Codebase map

See [codebase-map.md](codebase-map.md).

## Verification (validated 2026-09-24)

### Validation Summary

- **dev_stack_healthy: true** — Convex backend `:3210` HTTP 200, app `:3000` HTTP 200
- **Primary flow (headless Chromium, 0 console/page errors):** landing page ("Build my music
  diary") → Sign in → handle sign-in as seeded user `maya` → authenticated home renders Festival
  Guide (Charli XCX · Aug 7 · Golden Gate Park) + Home Base (San Francisco; venues Golden Gate
  Park, Lands End, Sutro Stage) → Browse/Discover view → search filter executes live Convex query
  (catalog: 7 shows)
- **Tests:** 456/456 pass (`npm test`)
- **Lint:** 0 errors, 26 warnings (`npm run lint`)

### Sandbox snapshot

- **snapshotId:** `og2yz559pgzppccx83th:default` (e2b template; sandbox `i807c9bsmvgv9jdsxmxpt`)
- **Captured:** 2026-09-24T19:12:35.873Z — includes Convex local backend running on :3210 with
  schema pushed + seeded, app dev server on :3000, Node 22.23.3 at `~/node22/bin`,
  backend binary at `~/convex-local/`

## Gotchas

- `node_modules/.vite` and `node_modules/.mf` must be writable — the snapshot's `node_modules`
  is user-owned (was root-owned from image build, fixed via `sudo chown -R user:user`)
- `.d.ts` files in `app/` trip Vite's dependency scanner (`Failed to run dependency scan…
  18 errors`) — harmless warning; the server still compiles and serves
- Convex cloud login is NOT possible in the sandbox — always use the self-hosted local backend
  (`--env-file=.env.convex-local`), never `npx convex dev` interactively
- `AGENTS.md`, `CLAUDE.md`, `.claude/`, `skills-lock.json` are gitignored on purpose
