# Showtonic Agent-Ready — Architecture

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
