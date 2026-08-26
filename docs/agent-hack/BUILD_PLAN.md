# Showtonic Agent-Ready — Build Plan

> **RE-PLANNED Wed 2026-08-26 12:07 PDT.** Real deadline is **submissions lock
> Thursday 15:00** (see `PLATFORM.md`), not end of day one — so this is a
> two-day build with ~13 working hours left, of which the first morning is gone.
>
> **Rubric changes the order.** 30 pts ride on the agent-native surface and 20 on
> coordination; both are unbuilt. Phase 1 (done) feeds the bands we were already
> winning. So **phase 2 is now the single highest-value thing to build**, ahead of
> finishing the evidence fleet. Phases 3 and 5's vision agent drop to optional.

Every phase ends runnable ("demoable at every hour" — inherited ground rule).

---

## Tonight (prep)

### Done already
- **Convex deploys clean**; schema carries `evidence` + `draft`.
- **Venue coordinates**: JamBase geo now mapped when present, and
  `npm run geocode:venues` (Nominatim, free, no key) filled the rest —
  SF is at **50/70 venues located**. Re-run it after any new city sync.
- **Camera-roll checker built**: `npm run scan:check -- <folder>`.

### Yours to run (nobody else can)
| # | Task | Why |
|---|---|---|
| P1 | Export 2–3 real nights from Photos.app (**File → Export → Export Unmodified Original**, keep "include location"), then `npm run scan:check -- <folder>` | THE risk. Prints date/GPS extraction rates and the nights it found, then tells you if you are ready. Phone-browser uploads strip GPS — use laptop originals. |
| P2 | Decide **which city your photos are from** and sync that catalog if it isn't SF (see "Catalog coverage" below) | Backfill can only match nights the catalog contains. Today the catalog is SF-only with 189 past shows. |
| P3 | Create accounts + keys: Tavily, AIsa, Runtype, Immersive Commons | Human-in-the-loop signups an agent cannot do. See MCP list below. |
| P4 | Skim the sponsor MCP list, install the two or three you'll use | Turns morning spikes into building. |

### Catalog coverage (checked 2026-08-26)
SF only: 935 shows (746 upcoming, **189 historical**), 70 venues, 1087 artists.
Historical depth is the constraint — JamBase's trial tier requires an artist or
venue filter for past events, so past coverage is thin by construction.

```bash
# find a city id
npx convex run jambase:searchCities '{"cityName":"New York"}'
# sync it (past year + upcoming), then re-geocode the new venues
npx convex run jambase:syncCatalog '{"cityId":"jambase:XXXX","cityName":"New York","historyDays":365,"maxPagesPerRange":30,"reconcileHistorical":true}'
npm run geocode:venues
```

This is also exactly why the **catalog-gap agent (phase 3)** exists: it turns a
coverage hole into a web search and a new catalog row, so thin history stops
being a blocker and becomes the demo's best moment.

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

## Phase 2 — ✅ DONE (2026-08-26, deployed) · MCP front door

Live at `https://showtonic-hack.showtonic.workers.dev`. Seven tools, five of
them writes. Discovery serves with no credential. Scoped tokens minted by the
human in-app; `pay` off by default. Verified adversarially: no token and a
forged token get the identical refusal; a valid token missing `write:logs` is
refused by name with its granted scopes listed.

Two traps worth remembering: `exifr` at module scope pulls `fs`/`zlib` into the
Workers SSR bundle and 500s every route (lazy-import it), and a workers.dev
route can take minutes to serve after first deploy — a 1042 is not always a
config error.

<details><summary>original plan</summary>

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

</details>

## Phase 3 — ⏳ PARTIAL · Catalog-gap agent + draft-writer

Tavily key set and verified against a real gap query. The agent itself and the
`catalogProposals` table are not built. Unmatched nights already come back
*named as gaps* from `reclaim_camera_roll`, so the queue exists and is empty of
consumers.

## Phase 3 (original) — 13:30–15:30 · Catalog-gap agent + draft-writer

- `catalogGap.search` Convex action (Tavily) + `catalogProposals` table + approve-on-accept
  wiring into `backfill.resolve`.
- Draft-writer: Claude call producing caption + vibes + evidence-card copy; render draft
  preview in the candidate card (designs `[09]/[10]` + evidence list).
- ✅ Exit: a night that's NOT in the catalog gets found on the web, proposed, accepted,
  logged — and the catalog is one show bigger.

## Phase 4 — ✅ DONE · Squad negotiation + payment (Act 3)

`agents/squad.mjs` runs three agents against the PUBLIC endpoint with three
separate tokens and deliberately uneven scopes — only the payer holds `pay`.
Verified live against production:

- each agent reads only its own human (`get_taste_profile`)
- the convener searches the SQUAD'S taste, not the city; searching generically
  returned twelve shows nobody wanted and the run correctly refused to invent
  consensus, which is how the flaw was found
- consensus reached with stated reasons, all three RSVP for themselves
- **maya and leo attempt `checkout_tickets` and are refused `missing_scope`,
  live, before the payer succeeds** — the scope model doing visible work
- plan + 15-message transcript recorded for a human to read

Settlement: AIsa declines with `recharge_required` (no balance — the $100 is
collected by an organiser, not self-serve), so the receipt records `simulated`
and names the declining rail. A demo that says "simulated" without saying why
is how a demo quietly becomes a lie.

**The last 20 rubric points and the largest open number.** AIsa authenticates
(104 models reachable), so the payer agent can make a real machine payment
rather than a stub. Plan: three tokens with deliberately *different* scopes —
two agents holding `read:taste` + `write:attendance`, only the designated payer
holding `pay` — so the scope model does visible work in the demo instead of
merely existing in the manifest.

## Phase 4 (original) — 15:30–17:00 · Squad negotiation + payment (Act 3)

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
