# Codebase Map — showtonic-hack

| Path | What it is |
|---|---|
| `app/` | Frontend (Next.js App Router via vinext). `page.tsx`/`layout.tsx` shell, `providers.tsx` Convex client; `*.js` + `*.d.ts` pairs are client data/logic modules (activity feed, backfill, briefing, discover, identity, onboarding, recap canvas, receipts); `views/` holds screen components (DiscoverView, BriefingView, ActivityView, BackfillFlow, EntityViews for artist/venue pages, ShowView, SquadPlan, TasteMatchView, RecapCard/Export, ProfileView, TabBar); `useShowtonic.ts` is the main state hook |
| `convex/` | Convex backend: `schema.ts` (users, artists, shows, venues, logs, media, follows, favorites, watchlist, reviews, squad plans, leaderboard, diary, recap…), one module per domain (shows, artists, venues, users, attendance, diary, discovery, briefing, recap, media, squad, taste, jambase sync, freeEvents, catalogGap, dedup, backfill, artistSearch, onboarding*), `seed.ts` + `seedData.ts` (deterministic offline seed), `_generated/` (do not edit) |
| `agents/` | MCP-style agent scripts (`squad.mjs`, `negotiate.mjs`) for the agent-access surface |
| `worker/` | Cloudflare Worker entry (`index.ts`) + `worker/mcp` — workerd deploy target |
| `scripts/` | Node utilities: venue geocoding, dedup planning, festival/history sweeps, catalog-refs snapshot, camera-roll check |
| `test/` | `node --test` unit tests (35 files, 456 tests) mirroring `app/` + `convex/` logic modules |
| `eval/` | Eval harness (`npm run eval`): festival/gap/match fixtures + report |
| `docs/` | BUILD_PLAN, SPEC, DATA, FEATURES, FRONTEND_BACKEND_CONTRACT, KEYS, plus agent-hack/superpowers notes |
| `showtonic-design-exports/` | 24 static PNG design comps (screen reference, not shipped code) |
| `public/` | Static assets (og image, svgs) |
| root config | `vite.config.ts` + `sites-vite-plugin.ts` (vinext/Cloudflare plugin wiring), `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs` |
