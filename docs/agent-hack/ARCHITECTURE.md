# Showtonic Agent-Ready — Architecture

> **Updated 2026-08-26 14:45 PDT to match what is deployed.** Kept current as
> work lands. The agent plane below is live at
> `https://showtonic-hack.showtonic.workers.dev`.

Companion to `SPEC.md`. Base system architecture is unchanged from `../SPEC.md`
(browser ↔ Convex reactive queries; `fetch` only in actions). This doc covers the new
agent plane and the schema deltas.

---

## System diagram

```
Personal agent (judge's / user's)          Friends' agents (x2, seeded users)
        │  discovers via /.well-known/mcp.json + llms.txt
        ▼
┌──────────────────────────────────────────────────────────┐
│  MCP server — Cloudflare Worker (worker/, wrangler)      │
│  · streamable-HTTP transport                             │
│  · verifies agent token (or Cotal identity) per call     │
│  · enforces scopes before proxying                       │
└──────────────┬───────────────────────────────────────────┘
               │ Convex HTTP client (server-to-server)
               ▼
┌──────────────────────────────────────────────────────────┐
│  Convex                                                  │
│  queries    (existing) discovery.search · taste.* ·      │
│             backfill.pending · shows/diary/…             │
│  mutations  (existing) attendance.set · logs.create ·    │
│             backfill.saveCandidates/resolve              │
│             (new) agents.mint/revoke · squad.save        │
│  actions    (existing) jambase.syncCatalog               │
│             (new) catalogGap.search   ← Tavily fetch     │
│             (new) vision.analyze      ← Claude API fetch │
│             (new) payments.checkout   ← AIsa fetch       │
└──────────────┬───────────────────────────────────────────┘
               ▼
   Browser app (unchanged) — renders candidates, evidence
   cards, squad plan card, agent-activity transcript
```

The negotiation orchestrator (Act 3) is a local Node script speaking MCP like any outside
agent — it gets **no** privileged path. That's the point: if our own fleet needs a backdoor,
the front door isn't real.

## Data flow — Act 1 (reclaim)

1. Personal agent calls `reclaim_camera_roll` with photo **metadata** batch
   `[{name, takenAt, lat?, lng?}]`. (Browser flow extracts this client-side with `exifr`;
   an agent caller extracts it wherever the photos live. Pixels are not in this payload.)
2. Worker → Convex: cluster into nights (port of `app/backfill.js` logic, now shared in
   `showtonicUtils`-style pure module so browser and server use one implementation),
   match against `shows` with date + GPS-vs-venue signals.
3. Unmatched clusters → `catalogGap.search` action (Tavily) → `catalogProposals` rows;
   proposal joins the candidate as its tentative show.
4. (Optional, consented) `vision.analyze`: ≤ 3 photos per cluster uploaded via the existing
   3-step storage flow, Claude `claude-sonnet-5` returns evidence strings + confidence
   deltas; photos deleted after analysis.
5. Draft-writer (same Claude call or second pass) fills `draft{caption, vibes[]}`.
6. Candidates land in `backfillCandidates` (extended) — the human approves in the app,
   or the agent surfaces them via `get_pending_candidates`. `backfill.resolve` is unchanged:
   accepting creates the log (which reactively updates taste — Act 2 is free).

## Data flow — Act 3 (squad)

```
agentA ─┐                         ┌─ get_taste_profile(self)
agentB ─┼─ shared ordered thread ─┼─ search_shows(upcoming)
agentC ─┘   (Cotal mesh | local)  └─ score → propose → eliminate
                    │
        consensus showId
                    │
   A,B,C: set_attendance(going) · payer: checkout_tickets
                    │
        squad.save → squadPlans row → app renders plan card + transcript
```

## Schema deltas (`convex/schema.ts`)

| Change | Table | Fields |
|---|---|---|
| new | `agentTokens` | `userId`, `tokenHash` (SHA-256), `label`, `scopes: string[]`, `cotalIdentity?`, `revoked: boolean`, `createdAt` · index `by_hash`, `by_user` |
| new | `catalogProposals` | `clusterDate`, `venueName`, `artistNames: string[]`, `sourceUrl`, `proposedBy` (`agent`), `status` (`pending`/`approved`/`rejected`), `showId?` (set on approve), `createdAt` · index `by_status` |
| new | `squadPlans` | `userIds: Id<users>[]`, `showId`, `status` (`proposed`/`confirmed`/`paid`), `paymentRef?`, `transcript: {agent, message, ts}[]` (denormalized — it's the demo artifact), `createdAt` |
| extend | `backfillCandidates` | + `evidence?: {kind: "date"/"gps"/"vision"/"web", detail: string, delta: number}[]`, `draft?: {caption: string, vibes: string[]}`, `proposalId?` |
| extend | `logs` | none — `source: "reclaim"` already exists |

## Auth model

- **Humans:** unchanged — localStorage handle, no auth (hackathon stance, stated openly).
- **Agents:** bearer token per user per agent, minted in-app ("Connect your agent" screen
  shows the token once). Worker hashes and looks up, checks scope per tool:
  `read:taste read:shows write:attendance write:logs write:candidates pay`.
  `pay` is **not** granted by default; the demo mints the payer's token with it on stage.
- **Cotal upgrade path (if the spike lands):** token row stores the Cotal-verified agent
  identity; the Worker asks Cotal to verify instead of trusting the bearer string, and
  inter-agent messages go through the Cotal log. The fallback (plain tokens + local ordered
  log) preserves every demo beat, so Cotal can fail without moving the schedule.

## Security posture (for the Hacker Bob scan + judges)

- All third-party keys (Tavily, AIsa, Anthropic, JamBase) in Convex env / Worker secrets.
- Worker validates scope server-side; Convex mutations re-check `userId` ownership
  (pattern already in `backfill.resolve`).
- Vision uploads: explicit consent, ≤ 3 photos, deleted post-analysis.
- Rate limit per token at the Worker (simple counter in KV) — enough to be defensible.
- Late afternoon: point Hacker Bob at the Worker endpoint; fix or document findings.

## What we deliberately do NOT build

- No streaming/queueing between agents — synchronous tool calls are fine at demo scale.
- No token refresh/expiry UX — revoke flag only.
- No embedding-based taste similarity — existing Jaccard `taste.similar` is enough.
- No new renderer for candidates — existing designs `[08]–[11]` screens gain an evidence
  list and a draft preview, nothing structural.


---

## AS BUILT — deltas from the plan above

### Agent plane (live)

Served by `worker/index.ts` **ahead of** the vinext app router, so an agent
arriving with only the domain name is answered before any page render:

```
worker/mcp/handler.ts    JSON-RPC over streamable HTTP + the discovery routes
worker/mcp/tools.ts      10 tool definitions, each declaring its required scope
worker/mcp/auth.ts       bearer extraction, SHA-256 at the edge, scope checks
worker/mcp/discovery.ts  mcp.json / ai-agent.json / llms.txt, all credential-free
```

No MCP SDK: hand-rolled JSON-RPC, ~150 lines, because this runs in the Workers
runtime and a dependency that half-works there would surface on stage.

`CONVEX_URL` reaches the Worker as a plain var (declared in `vite.config.ts`) —
it is the same public URL the browser already ships, not a secret.

### Schema, as actually migrated

| Table | State |
|---|---|
| `agentTokens` | ✅ built — `userId`, `tokenHash` (SHA-256 hex), `label`, `scopes[]`, `revoked`, `createdAt`, `lastUsedAt?`; indexes `by_hash`, `by_user` |
| `backfillCandidates` | ✅ extended with `evidence[]` (`kind`/`detail`/`delta`) and `draft{caption,vibes[]}` |
| `venues` | ✅ `latitude`/`longitude` now populated — JamBase schema.org geo, plus Nominatim for the rest |
| `catalogProposals` | ✅ built — `clusterDate`, `venueName?`, `city?`, `artistNames[]`, `sourceUrl`, `sourceTitle?`, `corroboratingUrls[]?`, `confidence`, `evidence[]?`, `proposedBy`, `requestedByUserId?`, `status`, `showId?`, `createdAt`; indexes `by_status`, `by_date`, `by_date_status` |
| `squadPlans` | ❌ not built — phase 4 |
| `catalogProposals` | ❌ not built — catalog-gap agent still to come |
| `squadPlans` | ✅ built — `userIds[]`, `showId`, denormalized show fields, `status`, `settlement`/`paymentRef`/`amountCents`/`payerUserId`, `transcript[]`; index `by_show`. Rendered on Profile by `app/views/SquadPlan.tsx` |

Hashing happens at the **edge** (browser at mint, Worker at verify), never in a
Convex mutation: mutations are deterministic and Web Crypto belongs outside them.

### Convex functions added

- `convex/agents.ts` — `mint`, `verifyByHash`, `touch`, `listMine`, `revoke`,
  `tasteProfile`, `reclaimCameraRoll`, `resolveCandidate`.
  `listMine` never returns `tokenHash`; `verifyByHash` returns `null` rather
  than throwing, so a bad token cannot be distinguished by timing from an
  unknown one.
- `convex/backfillMatch.js` — the pure scorer, shared by the browser scan and
  `reclaim_camera_roll` so both produce identical evidence and confidence.
- `convex/venues.ts` — `missingCoordinates`, `coordinateCoverage`, `setCoordinates`.
- `convex/catalogGap.ts` — `search` (Tavily), `approve`, `reject`, `record`,
  `pending`, `get`, `locatedVenues`, `markApproved`. Judgement lives in the
  pure `convex/catalogGapUtils.js` so the eval can score it without a key.

### Free-data plane (from the concurrent session)

`convex/freeEvents.ts` + `freeEventsUtils.js` are a working JamBase replacement:
Ticketmaster for future shows, Setlist.fm for history and setlists, Spotify and
MusicBrainz for artist cards. Free ids are namespaced (`tm:`, `slfm:`, `bit:`)
so they never collide with `jambase:` rows or get wiped by its reconcile pass.
`app/useShowtonic.ts` tries JamBase first and falls back automatically.
Design and coverage honesty: `docs/FREE_DATA.md`. Keys: `docs/KEYS.md`.

`artists.listNeedingEnrichment` ranks by catalog appearances (upcoming counted
double) rather than taking an arbitrary slice, because MusicBrainz allows ~1
request a second and the ordering matters more than the batch size.

### The catalog-gap agent, as actually built

`reclaim_camera_roll` has returned `unmatchedNights` since phase 1 with nothing
on the other end. It now schedules `catalogGap.search` (scheduled, not awaited —
reclaim is a mutation and the search is network I/O, so candidates come back at
the old speed).

Split in two on purpose:

```
convex/catalogGapUtils.js   pure — anchoring, date forms, title parsing, scoring
convex/catalogGap.ts        I/O  — Tavily fetch, the table, approval
```

The pure half is why `npm run eval` can score the agent with no API key and no
network, the same trick that makes the matcher measurable.

**A proposal is not a show.** It lives in its own table, carries the URL it came
from, and stays `pending` until a human approves it — at which point it goes
through `shows.importUpcoming`, the same sink JamBase and the free-data plane
use, id-namespaced `gap:` alongside `tm:` and `slfm:` so a reconcile pass never
mistakes it for a JamBase row it should delete.

Four refusals are built in, because a wrong row in the CATALOG is wrong for
every user who matches against it afterwards, not just the one who took the
photos: wrong year at the right venue, a page that never names the anchor room,
a title with no lineup in it, and two sources naming different headliners. On
ten labeled nights that is 0 false proposals against a naive top-result agent's
6 (`npm run eval`).

Budget is bounded — 2 searches per night, 8 nights per run — and a missing
`TAVILY_API_KEY` makes the whole thing a no-op rather than an error, so the
flagship tool cannot be taken down by a credential.

Privacy: the cluster's median coordinates reach the action to pick a venue
*name* and are never stored. The outbound search carries a venue name and a
date; no coordinate leaves Convex.

### A limit the catalog growth exposed

`discovery.home` returned every show in the database. Two cities with a year of
history is ~9,000 rows, over Convex's 8,192-element return cap, and Discover
failed outright. Home is now scoped to the member's home city inside a −400/+210
day window, capped at 4,000, upcoming first and most recent past after; `search`
is capped at 500. Shipping the whole catalog to a phone was never right — the
cap only made it obvious.
