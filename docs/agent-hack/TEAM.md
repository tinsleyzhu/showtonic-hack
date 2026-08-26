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

### L2 match · 2026-08-27T00:55Z
state:    shipped
now:      catalog-gap agent end to end — pure scorer, Convex action, catalogProposals, eval, wired into reclaim
shipped:  PR #2 (lane/match → main), 6 commits
blocked:  disk full on the machine (120 MiB free) — see NEEDS-HUMAN; git still works
next:     more adversarial fixtures; setlist.fm signal if that key appears

**Numbers, before → after.** The matcher is unchanged: 88% accuracy, 0 false
matches, against date-only's 38%. What is new is a scoreboard for the layer
under it — nights the catalog *cannot* explain, where there was previously no
consumer at all and therefore no number.

| Catalog-gap strategy | accuracy | precision | refused correctly | false proposals |
|---|---|---|---|---|
| naive (top result) | 100% | 33% | 14% | **6** |
| evidence-gated (shipped) | 100% | 100% | 100% | **0** |

Ten labeled nights, `npm run eval`. Accuracy is identical — the gate costs
nothing on nights the web can actually explain. The whole difference is in the
refusals, which is the argument for building it this way expressed as a number.
The naive baseline is what "just ask the model" looks like; it would have put
`Art and Music Complex`, a Jamie xx show from two years earlier at the right
venue, and a headliner from a contested night into the catalog.

Why a higher bar here (0.6) than the matcher's (0.5): a wrong candidate is one
person's diary, recoverable. A wrong *proposal* becomes catalog data that every
later user matches against. Cost is asymmetric, so the threshold is too.

**Then I attacked my own matcher, and it had two holes.** Both produced a
confident wrong show, so both are now fixed (a3d18e7):

1. *Adjacent venues tied.* "Within a block" was a flat +0.35, so two clubs 60 m
   apart — 1015 Folsom and its neighbours, not a hypothetical — both scored
   0.85 and the winner was whichever row the database returned first.
   Reversing the catalog order changed the answer. GPS is now graded across
   the near band.
2. *Taste decided nights that location could not.* On a GPS-stripped crowded
   night: date 0.5 + taste 0.2 + venue history 0.2 = **0.90 confidence** for
   the show by the artist you already like. Worse than guessing — it is biased
   toward what the system already believed, and it tells people they saw the
   acts they already listen to. Confidence is now split into locating evidence
   (date, gps, volume) and the rest; only locating evidence may separate two
   candidates, and if nothing does, the night is declined.

| Matcher | accuracy | precision | wrong | false matches |
|---|---|---|---|---|
| date-only (v1) | 38% | 33% | 5 | 1 |
| before this fix | 88% | 88% | 1 | 0 |
| **after** | 88% | **100%** | **0** | 0 |

Accuracy is unchanged — the night it now declines is one it previously got
*wrong*, not one it got right. Precision is the promise this feature actually
makes, and it is now perfect on the fixture set.

**Vision evidence (SPEC 1c) — not shipped, and this is a decision, not a
shortfall.** The app promises on screen that photos never leave the device.
Doing it properly means a per-night consent step with copy that admits the
exception, a ≤3-photo cap, and deletion after analysis — a UI change in L4's
and the coordinator's territory, not a scoring change in mine. Shipping it
without that consent step would break a promise the product makes in writing,
and the accuracy it buys does not outrank that. Available on request if the
coordinator wants to own the consent screen.

**For the coordinator, at deploy:** `convex/_generated/api.d.ts` has hand-added
entries for `catalogGap`/`catalogGapUtils` so the lane typechecks without a
deployment; `npx convex dev` will regenerate them identically. The new table
needs a schema push. Missing `TAVILY_API_KEY` is a deliberate no-op, so
deploying before the key is set breaks nothing.

---

## NEEDS-HUMAN — coordinator relays these; do not block on them

- [ ] AIsa credits: confirmed working on the second key. No action.
- [ ] Cotal `cli` actor grant — an operator must run
      `cotal actor grant cli --sub n6TFVkKoOfXvdKqfF87MVP3xXuo9rhl6`.
      Only needed if we want mesh-witnessed transcripts. Not blocking.
- [ ] Door check-in at the badge table — no tool can do it.
- [ ] Spotify developer app (client id + secret) — would make L1 ~9x faster.
- [ ] **Disk is full — 120 MiB free on the whole volume** (found by L2 at
      00:55Z). Not caused by this repo; it will hit every lane's installs,
      builds, and deploys. Reclaimable without touching project files:
      `~/Library/Developer` 18G (Xcode DerivedData), Spotify cache 2.3G,
      Codex cache 1.9G, `~/.npm` 933M. L2 did not delete anything — that is a
      human's call.

## CLAIMED — take a line before you start, so two lanes never collide

| Item | Lane | Since |
|---|---|---|
| artist genre enrichment | L1 | 23:30Z |
| catalog-gap agent (Tavily) | L2 | 23:30Z |
| taste profile v2 | L3 | 23:30Z |
| Runtype spike | L4 | 23:30Z |
