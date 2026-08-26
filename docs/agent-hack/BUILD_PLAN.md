# Showtonic Agent-Ready — Build Plan (one day)

Doors 10:00, building clears 20:00. Assume demo/judging ≈ 18:00–19:30, so **feature-freeze
17:00**. Every phase ends runnable ("demoable at every hour" — inherited ground rule).

---

## Tonight (prep — do before the event)

| # | Task | Why it's tonight |
|---|---|---|
| P1 | `exifr` spike on YOUR real camera-roll export (AirDrop 2–3 real nights, HEIC included). Confirm dates **and GPS** come out. | #1 risk. If your photos yield no EXIF, the whole Act 1 plan changes and you want to know now, not at 15:00. |
| P2 | `npx convex dev` + `npx convex run seed:run` — confirm the app still boots and seeds. | Dead dev deployment at 10:05 wastes the sharpest hour. |
| P3 | Check the JamBase trial key still works (`jambase:syncCatalog` dry run). | Catalog freshness feeds matching. |
| P4 | Skim Cotal + AIsa quickstarts (15 min each, no code). Write down the one question to ask their engineers. | Turns morning spikes from reading into building. |
| P5 | Read `SPEC.md` + `ARCHITECTURE.md` in this folder once. | Shared context with any co-builder/agent. |

## Phase 1 — ✅ DONE (built early, 2026-08-26) · EXIF/GPS matcher upgrade

Result, measured by `npm run eval`:

| strategy | accuracy | precision | false matches |
|---|---|---|---|
| date-only (v1) | 38% | 33% | 1 |
| gps + evidence | **88%** | **88%** | **0** |

Crowded nights (5 shows, one date) went from 20% → 100%. The false match — one night
where the photos were across town from the only same-date show — is now declined
instead of logged. 100 unit tests pass; `npm run eval` prints the comparison.

- Swap `extractExifDate` for `exifr` (dates + GPS, HEIC). Keep the pure-module shape and
  the existing tests; extend `backfill.test.mjs` with GPS fixtures.
- Extract cluster/match logic into a shared pure module usable from both browser and
  Convex (server-assisted path for the MCP tool).
- Add GPS-vs-venue signal (+0.35 within 150 m) + evidence strings to the matcher.
- Extend `backfillCandidates` schema with `evidence[]`, `draft{}`.
- ✅ Exit: your real photos → clusters → matched candidates with GPS evidence, in the
  existing app UI. **This alone is already a better feature than v1.**

## Phase 2 — 11:30–13:30 · MCP front door

- `agentTokens` table + `agents.mint/revoke` mutations + minimal "Connect your agent"
  screen (token shown once).
- Cloudflare Worker MCP server (streamable HTTP): `search_shows`, `get_taste_profile`,
  `set_attendance`, `log_show`, `get_pending_candidates`, `resolve_candidate`,
  `reclaim_camera_roll` (metadata in → candidates out, using Phase 1's shared module).
- `/.well-known/mcp.json` + `llms.txt`.
- **In parallel (timeboxed 1 hr each, use sponsor engineers):**
  - Cotal spike — verified identity on tokens + message log. Miss the hour → plain tokens.
  - Runtype spike — only if a second pair of hands exists; otherwise skip until Phase 4.
- ✅ Exit: an outside agent (Claude Code on your laptop) discovers Showtonic, reclaims a
  camera roll, and reads a taste profile — Act 1 + 2 demoable end-to-end.

## Phase 3 — 13:30–15:30 · Catalog-gap agent + draft-writer

- `catalogGap.search` Convex action (Tavily) + `catalogProposals` table + approve-on-accept
  wiring into `backfill.resolve`.
- Draft-writer: Claude call producing caption + vibes + evidence-card copy; render draft
  preview in the candidate card (designs `[09]/[10]` + evidence list).
- ✅ Exit: a night that's NOT in the catalog gets found on the web, proposed, accepted,
  logged — and the catalog is one show bigger.

## Phase 4 — 15:30–17:00 · Squad negotiation + payment (Act 3)

- `payments.checkout` action — AIsa if their key works in 30 min, else mock receipt.
- Orchestrator script: 3 agents (3 tokens — 2 seeded users + you), score → propose →
  eliminate → consensus → `set_attendance` ×3 → payer checkout. Transcript into
  `squadPlans`; plan card + transcript view in the app.
- 16:00 checkpoint: **ahead** → vision agent (consent step + `vision.analyze` + evidence
  deltas). **Behind** → cut vision, then Runtype, then drop to 2 agents.
- ✅ Exit: full three-act run works from a cold start.

## Phase 5 — 17:00–18:00 · Freeze, harden, theater

- Hacker Bob scan on the Worker endpoint (~15 min); fix cheap findings, note the rest.
- Two full demo rehearsals off the demo script (`DEMO.md`), including the failure drill
  (pre-seeded fallback state — see DEMO.md).
- Screenshots/recording as backup for flaky conference Wi-Fi.

## Cut order (pre-committed — decide with the clock, not with hope)

1. Vision agent (GPS + web-gap carry accuracy; vision is garnish)
2. Runtype integration
3. Three agents → two
4. AIsa → mock checkout
5. **Never cut:** Act 3 itself, the MCP discovery surface, or the GPS matcher.

## Definition of done

- [ ] Real HEIC photos → matched candidates with GPS evidence in the app
- [ ] Outside agent completes reclaim via MCP with a scoped token it minted in-app
- [ ] An off-catalog night is web-found, proposed, and logged
- [ ] Three (or two) agents converge on a show, all set going, one pays, app shows the plan
- [ ] Sponsor story true on stage: Tavily + (Cotal | tokens) + (AIsa | mock, said honestly) + Hacker Bob scan + Cloudflare Worker
