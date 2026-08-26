# TEAM — coordination document

**Every agent reads this at the start of every loop iteration and writes to it
before going idle.** It is the only shared state. If it is not written here, it
did not happen.

Hard deadline: **submissions lock Thursday 2026-08-27 15:00 PDT.** Doors close
20:00 both nights; there is no overnight.

---

## Shape

```
                        ┌──────────────────────────────┐
                        │  COORDINATOR  (main session) │
   human ◄────HITL──────┤  · only node that talks to   │
                        │    the human                 │
                        │  · only node that merges     │
                        │  · only node that deploys    │
                        │  · owns the IC submission    │
                        └───┬───┬───┬───┬──────────────┘
             merge PRs ─────┘   │   │   └───── merge PRs
                                │   │
      ┌──────────┬──────────────┴───┴────────────┬──────────┐
      │          │                               │          │
 ┌────▼────┐ ┌───▼─────┐                   ┌─────▼───┐ ┌────▼─────┐
 │ L1      │ │ L2      │                   │ L3      │ │ L4       │
 │ enrich  │ │ match   │                   │ taste   │ │ sponsors │
 │         │ │         │                   │  + p2p  │ │  + demo  │
 └─────────┘ └─────────┘                   └─────────┘ └──────────┘
  worktree     worktree                     worktree     worktree
  st-enrich    st-match                     st-taste     st-sponsors
```

Shape is **writer lanes + merge authority**, because the dominant risk here is
not missed findings — it is *chained dependencies stalling everything* and
*write races on one repo*. Four lanes, each fenced in its own worktree, each
shipping independently; one node holds merge, deploy, and the human.

## Nodes

| Node | Worktree / branch | Model | Lane — and what it does NOT do |
|---|---|---|---|
| **coordinator** | `showtonic-hack` / `main` | Opus 5 | Merges, deploys (Convex + Wrangler), owns the IC submission and the human. Does not write feature code while lanes are live. |
| **L1 enrich** | `st-enrich` / `lane/enrich` | Haiku 4.5 | Artist/venue data enrichment through rate-limited third-party APIs. High call volume, mechanical. Does not touch the matcher or the UI. |
| **L2 match** | `st-match` / `lane/match` | Opus 5 | Backfill accuracy: vision evidence, catalog-gap agent, eval harness. The hardest reasoning and the only lane with a numeric target. Does not touch enrichment sources. |
| **L3 taste + p2p** | `st-taste` / `lane/taste` | Sonnet 5 | Taste-profile v2 and peer-to-peer discovery between agents. Does not touch backfill scoring. |
| **L4 sponsors + demo** | `st-sponsors` / `lane/sponsors` | Sonnet 5 | Sponsor integrations (Runtype, Hacker Bob, Tenki, Nebius) early; demo rehearsal and failure drill late. Does not touch product logic. |

Model routing rationale: Haiku on the lane that is mostly I/O against
rate-limited APIs; Opus on the lane with an adversarial eval and the hardest
scoring logic; Sonnet where the work is design-shaped and broad.

## Trust boundary

Each lane is confined by **its own git worktree** — not by asking nicely. A lane
physically cannot edit another lane's files. Only the coordinator merges to
`main`, only the coordinator runs `npx convex dev --once` or `wrangler deploy`,
and only the coordinator speaks to the human or to Immersive Commons.

That last fence is not bureaucracy. **The Convex dev deployment is shared
mutable state**: if two lanes push functions at once they clobber each other,
and the live demo is the casualty. Lanes prove their work with `npm test` and
pure-module evals, then hand it to the coordinator to deploy.

## Ground rules

1. **Smallest deployable item.** Ship one feature end-to-end, then the next.
   Never build two things that must land together.
2. **Atomic commits.** One logical change per commit, tests passing at each.
3. **Deep research first.** Before writing code in a new area, read the actual
   API docs / existing code. Cite what you read in your status block.
4. **Blocked? Switch.** If you are waiting on the human or another lane, pick up
   the next unblocked item in your own lane. Never idle-wait.
5. **Never break the demo.** `main` must stay deployable at every moment.
6. **Stay alive.** Finishing your task list does not mean exiting. Re-read this
   file, look for unclaimed work in your lane, or improve test coverage.
7. **HITL is the coordinator only.** If you need a human decision, write it under
   NEEDS-HUMAN below and message the coordinator. Do not wait for a reply.

## Handing work to the coordinator

```bash
git add -A && git commit -m "…"        # atomic, tests green
git push -u origin lane/<name>
gh pr create --fill --base main        # then message the coordinator
```

---

## STATUS — append, do not rewrite others' blocks

Format. Keep it to five lines; the point is scannability, not prose.

```
### <lane> · <ISO timestamp>
state:    building | blocked | shipped | idle
now:      one line — what you are doing this iteration
shipped:  PR # or commit sha, or "-"
blocked:  what on, or "-"
next:     the next smallest deployable item
```

### coordinator · 2026-08-26T23:30Z
state:    building
now:      standing up the team; worktrees created, main pushed clean
shipped:  c2aa32f (all lanes branched from here)
blocked:  -
next:     refresh the IC submission; merge lane PRs as they arrive

### coordinator · 2026-08-27T00:42Z
state:    shipped
now:      merged L1 PR #1, deployed, and drained the enrichment backlog. The
          merge gate earned its keep: L1's tests passed (they exercise the JS)
          but tsc failed because freeEventsUtils.d.ts had no declaration for
          inferGenresFromContext. Fixed in a separate atomic commit before it
          reached main, rather than bouncing the PR back.
          Genre coverage 12 -> 220/7191 and climbing; the self-scheduling
          driver is running in Convex's scheduler. `fromContext` is doing real
          work (26 of the first 50), so L1's venue/title inference is earning
          its place, not just padding.
shipped:  merged PR #1 + type fix, main pushed, Convex deployed
blocked:  -
next:     refresh the IC submission (still says negotiation/payments are "in
          progress" when both shipped); merge L2/L3/L4 PRs as they arrive

**L3: genre inference is MERGED AND DEPLOYED. 220 artists carry genres now and
the number is climbing on its own. Jazz dominates (154) because the SF catalog
is jazz-heavy, so build genre-first onboarding to handle a skewed distribution —
a picker that shows the top N genres will show mostly jazz. Weight by the user's
city and by upcoming shows, not by raw catalog counts.**

### L1 enrich · 2026-08-26T (iteration 1)
state:    building
now:      read freeEvents.ts/freeEventsUtils.js/artists.ts + docs/FREE_DATA.md,
          docs/KEYS.md. enrichArtists (Spotify->MusicBrainz, patch-only) was
          already resumable/idempotent by construction — re-running only ever
          touches artists still missing image/genres, one committed mutation
          per artist, no batch transaction to roll back on interruption.
          Added the genre-inference-from-context fallback (item 3): pure
          `inferGenresFromContext` in freeEventsUtils.js keys off venue name +
          show title keywords (symphony/jazz/club-name lists), wired into
          enrichArtists as a last resort when Spotify+MusicBrainz both miss.
          listNeedingEnrichment now carries each artist's venueNames/titles so
          the action doesn't need a second query. 121 tests green.
shipped:  d2f0662, 6e1bc1e on lane/enrich, PR opened against main
blocked:  can't produce a real coverage number — this worktree has no
          CONVEX_DEPLOYMENT (no .env.local; only the coordinator's worktree is
          linked) and I'm fenced from `npx convex dev`. Coverage today per
          the task brief: ~12/7191 artists have genres.
next:     coordinator: once merged/deployed, one call —
          `npx convex run freeEvents:enrichArtistsContinuously '{"limit":50}'`
          — drives the whole backlog (it self-schedules batches until the
          queue is empty; safe to re-run/interrupt any time). Then
          `npx convex run artists:enrichmentCoverage '{}'` for the real
          number. I'll keep hardening / re-reading TEAM.md meanwhile.
**L3: the venue/title genre-inference fallback (item 3) has landed — you're
unblocked to build genre-first onboarding against it once merged/deployed.**

### L1 enrich · 2026-08-27T (iteration 2)
state:    building
now:      acted on both coordinator notes. (1) PRECISION over coverage: broad
          rooms that book every genre (Fillmore, Warfield, arenas, most indie
          clubs) no longer infer anything — "played the Fillmore" carries no
          genre information and tagging it rock/pop padded the number. Hints
          now carry a `family`; a context matching more than one family infers
          NOTHING, so an artist booked at both Davies and Public Works is read
          as "the venue signal is meaningless here" rather than tagged both.
          A confident room outranks a conflicting title. This will LOWER raw
          coverage and that is the intended trade. (2) enrichmentCoverage now
          reports an `upcoming` slice (optional city/today args, coveragePct on
          both) — the number onboarding and taste actually read.
          Also adopted `tsc --noEmit` as a pre-push gate after the .d.ts miss;
          reproduced that exact failure locally before merging your fix.
shipped:  6ea0240, ebfa019 on lane/enrich — PR opened
blocked:  still no CONVEX_DEPLOYMENT here, so numbers below are yours to run.
          Note: this machine's disk is at ~99% (720Mi free) — `npm install`
          failed with ENOSPC and I had to symlink node_modules from the main
          worktree to get tsc. Worth a look before it bites a deploy.
next:     coordinator: after merge/deploy, `npx convex run
          artists:enrichmentCoverage '{"city":"San Francisco"}'` — please
          report BOTH the global and the `upcoming` block. Expect global
          coverage to dip as the low-precision venue tags stop being written
          (already-written ones persist; say the word and I'll add a one-shot
          cleanup for genres inferred from the rooms I just dropped).
          I'll keep widening high-precision venue coverage meanwhile.

---

## NEEDS-HUMAN — coordinator relays these; do not block on them

- [ ] AIsa credits: confirmed working on the second key. No action.
- [ ] Cotal `cli` actor grant — an operator must run
      `cotal actor grant cli --sub n6TFVkKoOfXvdKqfF87MVP3xXuo9rhl6`.
      Only needed if we want mesh-witnessed transcripts. Not blocking.
- [ ] Door check-in at the badge table — no tool can do it.
- [ ] Spotify developer app (client id + secret) — would make L1 ~9x faster.
- [ ] L1 has no CONVEX_DEPLOYMENT in its worktree and can't run `npx convex
      dev`/`convex run` itself — coordinator needs to periodically run
      `freeEvents:enrichArtists` (or grant read access to `.env.local`) so
      real coverage numbers can be reported. Not blocking L1's code work.

## CLAIMED — take a line before you start, so two lanes never collide

| Item | Lane | Since |
|---|---|---|
| artist genre enrichment | L1 | 23:30Z |
| catalog-gap agent (Tavily) | L2 | 23:30Z |
| taste profile v2 | L3 | 23:30Z |
| Runtype spike | L4 | 23:30Z |
