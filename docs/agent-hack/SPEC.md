# Showtonic Agent-Ready — Technical Spec

**Event:** Immersive Commons agentic hackathon, Cloudflare SF, 2026-08-26 (doors 10:00, out 20:00)
**Track:** EXTERNAL (customer-facing)
**Base:** the existing `showtonic-hack` app (Next.js 16 + React 19 + Convex + JamBase SF catalog).
See `../SPEC.md` for the app as it stands — this doc specs only what the hackathon adds.

---

## The pitch (one sentence)

**Agents that reconstruct where you've been, so they can negotiate where you go next.**

Three acts, one continuous demo:

1. **Reclaim** — your personal agent discovers Showtonic's MCP endpoint and hands off a
   camera-roll job. Showtonic's *evidence fleet* (EXIF/GPS → catalog-gap → vision →
   draft-writer) reconstructs your past nights as diary candidates.
2. **Identity** — accepted candidates become logs; logs update your taste vector
   (existing `tasteMath` — zero new code). Your agent now knows what you actually like.
3. **Plan** — your agent and two friends' agents negotiate the next show using real taste
   profiles, converge, set `going` for all three, and one agent pays for the tickets.
   Humans open the app: history filled in, Friday night planned.

## Judging criteria coverage

| Criterion | How we hit it |
|---|---|
| Discovery | MCP manifest + `/.well-known/` + `llms.txt` — the personal agent finds Showtonic unaided |
| Access | Scoped per-user **agent tokens** (the app deliberately has no human auth; agents get verified identity — Cotal if adoption ≤ 1 hr, plain tokens otherwise) |
| Usability | Human involvement = grant photos + tap approve; everything else is fleet work |
| Payments | Act 3 ticket checkout via AIsa (mock `payments.checkout` fallback) |
| Accessibility | The existing app UI shows non-agent-owning humans everything the agents did |

## Feature 1 — Evidence fleet (upgrades v1 backfill)

v1 (`app/backfill.js`, `convex/backfill.ts`) matches photo clusters to shows by **date only**
with heuristic boosts. The fleet closes its real gaps, in value order:

### 1a. Robust EXIF + GPS (code, not an agent — do first)
- Replace the hand-rolled JPEG-only parser with **`exifr`**: HEIC support (iPhone camera
  rolls!) + GPS IFD. The current parser returns null on HEIC — without this the demo dies
  on real photos.
- New matcher signal: photo GPS vs `venues.latitude/longitude` (already in schema, unused).
  Within 150 m of the show's venue → +0.35 confidence and an evidence string
  ("6 photos within a block of The Midway").
- Clustering/matching stays **client-side**; only metadata + evidence strings go to Convex
  (privacy promise on screen `[07]` holds).

### 1b. Catalog-gap agent
- Trigger: a night cluster with **no** catalog match (or all matches < 0.5 confidence).
- Action (server-side Convex action): **Tavily** search — "events at {nearest venue by GPS}
  {date}" / "{city} concerts {date}" — parse the top results into a proposed show
  `{date, venueName, artistNames, sourceUrl}`.
- Writes to a new `catalogProposals` table (status `pending`). Accepting the backfill
  candidate approves the proposal → inserts into `shows` (source-attributed).
- **Side effect is the point:** every unmatched night grows the catalog.

### 1c. Vision agent (build only if ahead at ~16:00 — first cut)
- Per-cluster explicit consent step, then ≤ 3 photos upload for analysis (this is a
  deliberate, visible exception to "photos never upload" — consent copy in DESIGN.md).
- Claude (`claude-sonnet-5`) reads flyer text / LED-wall artist names / recognizable rooms →
  evidence strings + confidence deltas. Turns "62% likely" into
  "I can see the Portola flyer in photo 3."

### 1d. Draft-writer agent
- Input: matched cluster + evidence. Output: pre-filled log draft — caption, suggested
  vibes (from show genres), hero-shot pick, and the evidence-card copy.
- Extends `backfillCandidates` with `evidence[]` and `draft{caption, vibes[]}`.
- Accept flow reuses `backfill.resolve` unchanged.

## Feature 2 — Agent front door (MCP)

Remote MCP server on a **Cloudflare Worker** (we're already on wrangler), calling Convex
over HTTP with the agent token.

Tools (thin wrappers over existing Convex functions unless noted):

| Tool | Backs onto | Notes |
|---|---|---|
| `reclaim_camera_roll` | new orchestration | Flagship: accepts photo metadata batch (takenAt, gps), runs cluster+match server-assisted, returns candidates. The cross-party handoff. |
| `get_taste_profile` | `taste.*` / user's logs | Genre/artist vector + top venues |
| `search_shows` | `discovery.search` | Upcoming filter param |
| `set_attendance` | `attendance.set` | interested / going |
| `log_show` | `logs.create` | Rating in half-steps, validated |
| `get_pending_candidates` / `resolve_candidate` | `backfill.pending` / `backfill.resolve` | Lets the agent surface drafts for human approval |
| `checkout_tickets` | new `payments.checkout` action | AIsa; mock fallback returns a receipt id |

Discovery surface: MCP manifest, `/.well-known/mcp.json`, `llms.txt` at the app root.

**Agent identity:** new `agentTokens` table — per-user, scoped
(`read:taste`, `write:attendance`, `write:logs`, `pay` — `pay` off by default), SHA-256
hash stored, label shown in the app. Minted from a "Connect your agent" screen. If the
Cotal spike (1-hr budget, use their on-site engineer) lands, tokens are bound to
Cotal-verified agent identities and handoffs go through their replayable log — which then
doubles as the demo's audit visual.

## Feature 3 — Squad negotiation (Act 3)

- A small orchestrator script (Node, Claude Agent SDK or plain loop) runs **three agents**,
  one per seeded user, each holding only its own scoped token.
- Protocol (simple on purpose): each agent pulls its human's taste profile + upcoming shows
  via MCP → scores candidates against its vector → agents exchange scored slates over a
  shared thread (Cotal mesh if adopted, else a local ordered log) → iterative elimination
  until one show clears every agent's floor → all three `set_attendance("going")` →
  designated payer calls `checkout_tickets` (its token has `pay`).
- Result lands in a new `squadPlans` table so the app can render the plan card and the
  negotiation transcript (Accessibility criterion).
- Honest but simple: real calls against real data; no cleverness required.

## Sponsor integrations (each must do real work)

| Sponsor | Where | Status |
|---|---|---|
| Tavily | catalog-gap agent search | core |
| Cotal | agent identity + replayable handoff log | 1-hr timeboxed spike |
| AIsa | `checkout_tickets` | core, mock fallback |
| Hacker Bob | scan the new MCP surface (~15 min, late afternoon) | cheap add |
| Runtype | optional: draft-writer/negotiation as Runtype flows | 1-hr morning spike **with their engineer**, walk away at the hour |
| Cloudflare | Worker hosts the MCP server | already on stack |
| Nebius / Mitosis / HUD / Tenki | no honest fit | skip |

## Out of scope (say no on-site)

- Real human auth (localStorage handle stays; agent tokens are the auth story)
- NYC/RA catalog, iOS app, voice — different repos, different days
- Multi-city, festival flows, activity feed changes
- Negotiation "intelligence" beyond scored elimination — demo needs correctness, not genius

## Ground rules (inherit from the OL build, still true)

1. Keys server-side only — Tavily/AIsa/Claude keys live in Convex env or Worker secrets,
   never the browser.
2. Denormalize; no joins.
3. **Demoable at every hour.** Each phase ends runnable; never break Act 1 to build Act 3.
4. Cut order when squeezed: vision agent → Runtype → three agents becomes two.
   **Never cut Act 3 entirely** — it carries the theme.
