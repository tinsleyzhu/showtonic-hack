# JamBase — past shows only

## The decision (human, 2026-08-27)

JamBase is reserved for **historical show data**, nothing else. Ticketmaster
already covers upcoming well (4,900 rows across NY + SF and it renews), and
Tavily/L2's gap agent covers nights neither source has. What no other source
gives us cheaply is a *dense, structured back catalogue* — and past shows are
what the reclaim feature matches against, so they are the scarce input that
decides whether a real camera roll produces matches or refusals.

Current coverage, for scale: San Francisco holds **613 upcoming against 207
past** across a whole year. The past side is the product's bottleneck.

## Status

**Trial quota exhausted** — 1,000 requests, spent. The error is explicit and
permanent, not transient:

```
429 {"title": "Trial Quota Exceeded",
     "detail": "Trial quota of 1,000 requests exceeded. Subscribe to a paid plan"}
```

This is NOT rate limiting. Waiting does not clear it. A new trial key or a
paid plan is the only way through. (Earlier notes in TEAM.md calling this
"rate limited / 429, back off" were wrong about the cause — same status code,
different meaning.)

## What our code already does right

`convex/jambase.ts` uses the current API: origin `https://api.data.jambase.com/v3`,
auth via `Authorization: Bearer <key>` header. Query-string `?apikey=` returns
401 on v3 — if you test with curl, use the header.

## Spending a fresh trial well — 1,000 requests is plenty IF aimed

Do not point a new key at anything upcoming. The whole budget goes to past
windows, and the arithmetic is comfortable: at `perPage=100`, one request
returns up to 100 events, so a year of one city's history is tens of requests,
not hundreds. Both cities' full past year should cost well under half the
trial.

**Order of spend:**
1. **San Francisco, 2025-09-01 → 2026-08-26** — the year a diary can reach,
   and the city the demo runs in.
2. Demo-path rooms first if the budget looks tight: Rickshaw Stop, The Chapel,
   The Independent, Great American, Bimbo's.
3. New York, same window, only after SF is complete.

**Rules, learned from the Ticketmaster sync:**
- **Walk in date windows, and halve any window that comes back dense.** TM had
  an undocumented `size * page < 1000` cap that silently lost two-thirds of NY.
  Verify JamBase's paging behaviour on the FIRST window rather than assuming:
  request a window you know is dense, and check whether `count` exceeds what
  paging can actually reach.
- **Count every request against the 1,000 and log the running total.** A trial
  that dies mid-sweep with no record of where it stopped wastes the next key
  too.
- **Dry-run first** — print the windows and the request estimate before
  spending anything.
- **Write through the ingest chokepoint** (`shows.importUpcoming`, despite the
  name) so the normalized dedup keys apply and the sweep cannot re-fork venue
  spellings the dedup passes just merged.
- **Past shows carry no attendance claim.** A recovered show says a show
  happened, never that anyone was there — same posture as L2's gap agent.

## When the new key arrives

1. `npx convex env set JAMBASE_API_KEY <new-key>` (Convex actions read it from
   the deployment env, not `.env.local`).
2. Verify with a *cheap* call before any sweep: one request, `perPage=1`, a
   past window. A 429 means the key is already spent; a 200 means go.
3. Hand the sweep to L1 with the order above.
