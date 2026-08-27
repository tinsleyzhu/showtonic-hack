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
### L2 match · 2026-08-27T00:55Z
state:    shipped
now:      catalog-gap agent end to end — pure scorer, Convex action, catalogProposals, eval, wired into reclaim
shipped:  PR #2 (lane/match → main), 9 commits
blocked:  disk full on the machine (120 MiB free) — see NEEDS-HUMAN; git still works
next:     more adversarial fixtures; setlist.fm signal if that key appears

**Two more found by attacking it, both fixed (93f2107).**

*UTC timestamps silently lost whole nights.* An agent sending correct UTC —
`2026-06-27T22:30:00Z` — had its 10:30 PM show read as the next morning, which
falls outside the evening window, so the night vanished with no error and no
candidate. The caller did nothing obviously wrong and got a confidently empty
answer. `reclaim_camera_roll` now refuses these with a message stating the
contract, because silence is the worst failure mode on an agent surface.

*Festival days now return nothing* — **coordinator, this one is your call.**
Every set at Outside Lands shares one coordinate, so nothing distinguishes
them and the ambiguity guard declines the whole day. That is the precision
rule working exactly as designed, and it is the honest answer (we know the
night, not the set). But it means the app's origin story — a festival night —
produces no candidates at all. Three options, none of which I should pick
alone: (a) leave it, declining is correct; (b) match the festival rather than
the set, which needs `festivalId` threaded into the matcher and a product
answer about what a festival diary entry even is; (c) match the headliner and
say so in the evidence card. **Resolved: (a) for tonight, (b) is the product answer.** The human's framing —
festivals should have ONE page, not sixty — turns this from a matcher problem
into a data-model one. Nothing ships tonight; the design is written up in
SPEC.md under "Named future work — a festival is one thing, not sixty", so the
demo answer is backed by a plan rather than improvised. Current declining
behaviour stays pinned by a test.

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

**Vision evidence (SPEC 1c) — CUT, confirmed by the human 2026-08-27.** Not a
shortfall, a decision, and it is now written into SPEC.md as one. The app promises on screen that photos never leave the device.
Doing it properly means a per-night consent step with copy that admits the
exception, a ≤3-photo cap, and deletion after analysis — a UI change in L4's
and the coordinator's territory, not a scoring change in mine. Shipping it
without that consent step would break a promise the product makes in writing,
and the accuracy it buys does not outrank that. Confirmed closed — not building the
analysis side.

**For the coordinator, at deploy:** `convex/_generated/api.d.ts` has hand-added
entries for `catalogGap`/`catalogGapUtils` so the lane typechecks without a
deployment; `npx convex dev` will regenerate them identically. The new table
needs a schema push. Missing `TAVILY_API_KEY` is a deliberate no-op, so
deploying before the key is set breaks nothing.
### L3 taste + p2p · 2026-08-27T00:15Z
state:    building
now:      shipped taste v2 scoring; proposing find_compatible_humans MCP tool below before building it
shipped:  db7094d (tasteScore genre/venue affinity, backward-compatible)
blocked:  -
next:     build find_compatible_humans (see Proposals), then extend squad negotiation edge cases

### L3 taste + p2p · 2026-08-27T00:55Z
state:    shipped
now:      all four lane items done — PR #3 open, 130/130 tests green
shipped:  PR #3 (taste v2, find_compatible_humans, N-agent negotiation, squad plan UI)
blocked:  needs a Convex deploy (taste:compatiblePeers) + wrangler deploy (new tool) — coordinator's call
next:     more negotiation edge-case tests; staying alive per ground rule 6

Read before changing anything: convex/agents.ts:tasteProfile, convex/tasteMath.js,
convex/taste.ts, agents/squad.mjs, worker/mcp/tools.ts, convex/squad.ts.

What landed, and the honest caveats:

1. **Taste v2** — `tasteScore` takes optional genres/venues and blends each in
   only when BOTH sides of a comparison have it. With neither it is byte-for-byte
   the old artist-only formula, so no existing match percentage moves until L1's
   inference actually populates `logs.artistGenres`. Sparsity degrades, it does
   not block.
2. **`find_compatible_humans`** — new MCP tool, `read:taste`, no new scope, no
   new table. Backed by `taste.compatiblePeers`. The low-N refusal is enforced in
   the pure module (`tasteMath.rankCompatiblePeers`) and unit-tested: under five
   logged shows it returns `lowSignal: true` and zero matches. Returns match
   strength + shared artist names only — never the other person's diary.
3. **N-agent negotiation** — logic extracted to `agents/negotiate.mjs`, squad size
   now read from the roster instead of hardcoded three. Three outcomes:
   `consensus`, `split` (largest viable subgroup goes; those left out are NAMED
   in the transcript, not dropped), `refused` (no group of 2+ clears the bar —
   the right answer, not a failure). A member only blocks a show worth nothing to
   their human when they have a better option on the same slate; otherwise an
   opinion-less agent would veto everything.
4. **Squad plan in the app UI** — `app/views/SquadPlan.tsx`, rendered on Profile.
   A human with no agent reads the plan, who is going, the settlement (including
   "simulated, and here's why"), and the full transcript. Empty-room rule holds:
   no plan, no card.

Verified: `npm test` 130/130, `npx tsc --noEmit` clean, `npm run lint` 0 errors
(20 pre-existing `<img>` warnings, none of them mine). Note for other lanes —
these worktrees ship without `node_modules`, so `npm ci` first if you want a
typecheck; tests alone only cover the pure modules.

### L3 taste + p2p · 2026-08-27T02:10Z
state:    shipped
now:      answered the coordinator's jazz-skew note — rarity weighting + genre-first onboarding
shipped:  PR #3, now 8 commits (merged main in; 198/198 tests, tsc clean, lint 0 errors)
blocked:  needs Convex + wrangler deploy — coordinator's call. Cannot dogfood the onboarding UI (no CONVEX_DEPLOYMENT here)
next:     idle in-lane; will keep hardening negotiation and taste tests

**The jazz skew was a real bug in what I had already shipped, not just an
onboarding problem.** Under a plain jaccard, "you both like jazz" scored nearly
as high as a genuine overlap — on a catalog where jazz sits on 154 of the first
220 enriched artists, that is close to "you both like music". Two fixes:

1. **Rarity-weighted genre overlap** (`genreWeights`, standard IDF over the
   population being compared). A genre everyone has weighs 0; a genre one person
   has weighs 1. When the whole weighted union is zero — every genre in play is
   universal — `tasteScore` treats that as NO genre signal and falls back to
   artists and venues, rather than scoring a zero and dragging the match down.
   `matchDetail` now measures rarity over the same population as `similar`,
   because two different percentages for one pair of people is how a match page
   reads as broken.
2. **Genre-first onboarding** (`taste.genresForOnboarding` +
   `taste.artistsForGenre`, ranking pure and tested in
   `convex/onboardingGenres.js`). Ranked by *upcoming* shows weighted toward the
   member's city — a genre you cannot buy a ticket for is a dead slot — and
   capped per genre family, since "jazz" / "vocal jazz" / "jazz fusion" taking
   three slots says nothing "jazz" alone did not. Families are derived from the
   corpus rather than a hardcoded taxonomy (a genre joins a family when a MORE
   COMMON genre appears inside it as a whole word), so a house-heavy city behaves
   identically and a rare genre like "core" never swallows "hardcore". The chips
   lead the taste step; tapping one swaps the artist grid. Persistence is
   unchanged — the step still produces `favoriteArtists`, so every downstream
   consumer keeps working.

⚠️ **Two honest caveats for the coordinator.**
- The onboarding UI is **type-checked and lint-clean but never rendered** — this
  worktree has no `CONVEX_DEPLOYMENT`, so I could not run the app and click
  through the taste step. Worth thirty seconds of your eyes after deploy.
- The taste step runs *before* the home-base step, so at first-run onboarding
  `homeCity` is empty and the city weighting is inert; it only bites for
  returning users. Reordering the wizard would fix that but changes a flow I do
  not own — say the word if you want it.

### L3 taste + p2p · 2026-08-27T03:05Z
state:    shipped
now:      both bugs the coordinator found by rendering the taste step are fixed
shipped:  PR #8 (206/206 tests, tsc clean, lint 0 errors)
blocked:  needs merge + deploy — coordinator's
next:     idle in-lane, hardening tests; say the word if you want me elsewhere

Rendering it found two things no amount of reading my own lane would have.
Both fixed:

**1. Home base now comes before taste.** Worse than the inert weighting I
predicted: with `homeCity` empty the ranking spanned the whole catalog, and
NYC's 1,567 upcoming shows outvoted SF's 746 — a first-run San Franciscan was
offered the New York Philharmonic. Swapped in `ONBOARDING_STEPS`; home base
stays skippable, and skipping just returns the picker to a citywide ranking,
which is the honest fallback rather than an error. The wizard's `Step N of 4`
labels were hardcoded and would have gone wrong here, so they now derive from
the array and cannot drift again. The ordering is pinned by a test that states
*why*, so a future reshuffle has to argue with the bug rather than quietly
bring it back.

**2. Genre families are learned from co-occurrence, not just substrings.**
`post-bop` and `hard bop` ARE jazz and share no word with it, so no substring
test could ever reach them. Families now also come from how genres co-occur
**on an artist**: if nearly every artist carrying post-bop also carries jazz,
post-bop is jazz. It is directional on purpose — jazz sits on plenty of artists
with nothing to do with post-bop, so jazz never becomes post-bop's child. The
name test is kept as the other half of a hybrid, since it still catches
`jazz fusion` where co-occurrence data is thin.

Counted per **artist**, never per show: a show's genres are the union across the
bill, so two unrelated acts sharing a night would otherwise look like evidence
their genres belong together. That is pinned by a test too.

On your live shape (jazz 561, rock 223, post-bop 195, pop 163, jazz fusion 156,
classical 141, plus the soul pair) this goes from **6 of 11 jazz chips to 2 of
8** — `jazz fusion` and `hard bop` fold away and rock, pop, classical and hip
hop take the freed slots. Still no hardcoded taxonomy: a house-heavy city gets
its own families.

You were right that this and the rarity weighting are the same problem wearing
different hats. Both are now measured from the corpus instead of assumed.

Caveat unchanged and worth repeating: **I still cannot render this.** No
`CONVEX_DEPLOYMENT` in this worktree, so the reorder and the new chip list are
type-checked and unit-tested but unseen by me. The same thirty seconds would be
well spent again — especially that home base now renders with no artists picked
yet (its "including N artists you selected" line already guarded on a non-zero
count, so it should simply be absent).

### L3 taste + p2p · 2026-08-27T04:00Z
state:    shipped
now:      fixed the default artist grid; audited the rest of the app for city-blind ranking
shipped:  PR #9 (211/211 tests, tsc clean, lint 0 errors)
blocked:  needs merge + deploy — coordinator's
next:     idle in-lane

**The default grid came from a query I never touched.** The chips respected
`homeCity`; the "Most seen" grid under them came from `artists.forOnboarding`,
which ranks by total catalog appearances with no city at all. Both of my
previous fixes were correct and the symptom did not move, because the thing
rendering by default was never the thing I was fixing.

The repair is not "add a city filter to the second query" — it is that there
should not have been a second query. `taste.artistsForGenre` is now
`taste.artistsForOnboarding` with an **optional** genre, and backs both the
unfiltered and the per-genre grids. Two sources behind one grid is exactly what
let them disagree; there is now one source, one ranking, one promise.
`artists.forOnboarding` is left in place (another lane's file) but has no
callers — safe to delete whenever that lane wants to.

**City-blindness audit, as asked.** With SF's 746 upcoming against NYC's 1,567,
any unscoped ranking reads as a New York app. Three findings, none of them mine
to change:

| Site | State | Risk |
|---|---|---|
| `discovery.home` | ✅ already city-scoped | none |
| `discovery.search` | ⚠️ global, capped at 500 | a broad query ("orchestra", "jazz") fills its 500 from the larger catalog. Fine for a specific artist search; misleading for a browse-shaped one. **Also backs the MCP `search_shows` tool**, so an agent inherits the same bias — and the squad negotiator searches this way. |
| `leaderboard.list` | ⚠️ infers city from the user's **logs**, falling back to a hardcoded `"San Francisco"` | a member with no logs yet is ranked against SF regardless of the home city they just chose. Harmless today only because the hardcoded default happens to be SF. |

I have not touched either — `discovery.ts` and `leaderboard.ts` are outside my
lane, and `search` in particular has an agent-facing consumer, so changing its
semantics is a coordinator call rather than a lane one. Say the word and I will
take either.

### L3 taste + p2p · 2026-08-27T05:00Z
state:    shipped
now:      city gate on onboarding artists; optional city on search; squad slates scoped
shipped:  PR #10 (224/224 tests, tsc clean, lint 0 errors)
blocked:  needs merge + deploy — coordinator's
next:     idle in-lane

**1. Presence is a gate, not a bonus.** The weight was never too small — the
mechanism was wrong. New York Philharmonic: 234 upcoming New York shows, zero
in San Francisco. 234 × 1 beats any 4× an SF artist can earn (they would need
59 SF shows), so it topped the grid for San Franciscans permanently, as an
artist they could not go and see. Now: with a home city known, an artist needs
at least one upcoming show there to appear at all; survivors rank by presence
in that city. With no home city, the global ranking stands — the honest
degraded state. Home and elsewhere are counted separately, because a gate
cannot be built from a number that has already had "somewhere else" blended in.

Same hole existed one level up and is closed too: a city with nothing upcoming
used to fall through to the hardcoded seed list, putting artists three thousand
miles away back on screen. It now shows an empty state naming the city.

**2. Search: `city` is optional and the default is UNCHANGED.**

⚠️ **One instruction I did not follow literally, deliberately.** The brief said
both "defaulting to the caller's `homeCity`" and "an agent that wants a global
search can still get one by passing nothing", and those two cannot both hold —
if omitting `city` means `homeCity`, then every agent already in the field
silently gets narrowed. I followed the stated *principle* over the stated
*default*: **omit `city` → everywhere, exactly as before**; pass a city → scoped;
`"anywhere"`/`"any"`/`"*"`/`"all"` are accepted for a caller that wants to be
explicit. If you did mean homeCity-by-default, it is a one-line change — but I
would want you to choose it knowingly, because it changes what a published tool
returns underneath agents that already read the manifest.

The scoping happens *before* the 500 cap. That was the real defect: the cap had
already spent itself on the larger city before any filter ran.

**3. Squad slates.** `agents/squad.mjs` scopes to the city the members share.
Members split across cities is handled explicitly, as you asked: both cities go
on the table, the transcript says so out loud, and if a squad spread across a
continent cannot converge, the negotiator already knows that refusing is the
right answer.

**4. Leaderboard: noted and left**, per your call. `leaderboard.list` infers
city from the user's *logs* and falls back to a hardcoded `"San Francisco"`, so
a member with no logs is ranked against SF regardless of the home city they
just picked. Cosmetic, off the demo path, correct today only by luck.
`artists.forOnboarding` still has zero callers and is still left alone.

Caveat, fourth time and unchanged: **I cannot render any of this.** The city
gate in particular deserves eyes — the failure mode if I got it wrong is an
*empty* grid rather than a wrong one, which is safer but very visible.

### L5 share · 2026-08-27T06:15Z
state:    shipped
now:      all five lane items done — PR open, 261/261 tests, tsc clean, lint 0 errors
shipped:  PR (lane/share): recap.build, generate_recap, recap card, image export, AIsa caption
blocked:  needs Convex deploy (recap:build + recap:caption) and a wrangler deploy
          (generate_recap) — coordinator's. Cannot render any of this: no
          CONVEX_DEPLOYMENT in this worktree.
next:     idle in-lane; hardening tests. Video editing stays OUT per the brief.

Read before changing anything: `convex/recapSummary.js` (all the counting and
copy), `convex/recap.ts`, `app/recapCanvas.js`, `app/views/RecapCard.tsx`,
`app/views/RecapExport.tsx`, `worker/mcp/tools.ts`.

**Built as an agent capability first, screen second — in that order, on purpose.**
`recap.build` is a Convex query, `generate_recap` (scope `read:taste`, no new
scope) publishes it on the MCP surface, and the card on Profile renders the
identical object. An agent that says "you went to 31 shows" and a card that says
29 cannot both exist, because there is one summary and it is pure.

1. **`recap.build`** — counts, top artists/venues/genres, the span, the
   highest-rated night, and the member's own photos best-nights-first. The span
   copy is *derived from* `describeReclaimSpan` rather than retyped: one word
   list, two lengths of the phrase. Averages stay hidden under five rated shows,
   same promise as `agents.tasteProfile`. Empty diary returns `empty: true` and
   nothing else, so no caller can render a recap of zero nights.
2. **`generate_recap`** — the manifest derives from the registry, so this
   announced itself on `/.well-known/mcp.json` with no hand-edit to
   `discovery.ts`. Eleven tools now; six still write.
3. **Recap card on Profile** — their photos lead when a log has media, show
   artwork stands in when it does not, and the card says which so "add photos"
   reads as an invitation rather than a bug.
4. **Export** — canvas 2D, 1080x1920 and 1080x1080, zero dependencies. The app's
   display face is a system serif stack, so the export looks like the app without
   loading a byte from a CDN. Geometry and wrapping are pure and tested against a
   recording fake context, including an assertion that nothing lands off-canvas
   in either shape.
5. **Caption** — AIsa, not a second provider. The model gets only facts we
   counted and is told it may not add any; if it is unset, unfunded or
   unreachable the locally written caption ships and the UI names the reason.

**WE CANNOT AUTO-POST, and the UI says so rather than designing around it.**
Instagram's Graph API needs a business account and app review; there is no path
to it tonight, and publishing public content for someone needs their consent for
that post regardless. So the copy reads "Ready to post. We generate it, you post
it — Showtonic never publishes to your accounts, and there is no button here
that would," and the buttons hand them the image through the OS share sheet
(`navigator.share` with a File) or a download. A button that silently did nothing
would have been the worse answer, on stage and off.

⚠️ **Three things the coordinator should know, two of which need eyes.**
- **I have not rendered ANY of this** — no `CONVEX_DEPLOYMENT` here. Four rounds
  of L3's onboarding work were type-checked, unit-tested and still visibly wrong
  in a browser, so treat "tsc clean" as exactly as much as it is.
- **The export's real risk is canvas tainting.** Convex storage photos are
  cross-origin; they are loaded with `crossOrigin="anonymous"` and *skipped* when
  that is refused, so the export degrades to a card without that photo rather
  than throwing on `toBlob`. If Convex storage does not send permissive CORS
  headers, every export will be photo-less and the UI will say how many were left
  out. Thirty seconds with the download button settles it.
- **`recap.caption` costs a real AIsa call.** Off by default on the tool
  (`include_caption`), one button in the UI. If the key's balance is out it
  returns `recharge_required` and falls back saying so — same signal L4 flagged
  for `checkout_tickets`.

`convex/_generated/api.d.ts` has hand-added entries for `recap`/`recapSummary` so
the lane typechecks without a deployment; `npx convex dev` will regenerate them
identically. No schema change — recap reads `logs` and `media` and writes nothing.

Video editing stays OUT, per the brief: items 1-5 are shipped but not *rendered*,
and it is the most expensive thing on the list.

---

## Proposals — L3: `find_compatible_humans` MCP tool

**Problem:** `taste.similar` already ranks users by taste affinity, but nothing
on the MCP surface exposes it — an agent can read its own human's taste
(`get_taste_profile`) but can't discover *other* humans without either side
being online. That's the actual peer-to-peer gap: two agents shouldn't need
their humans to already be in the same room (or squad roster file) to find
each other.

**Tool shape:**

```
find_compatible_humans
  scope: read:taste          (no new scope — same trust level as get_taste_profile;
                               it reveals match strength, never raw diary contents)
  input: { limit?: number }  (default 5, max 10)
  output: {
    lowSignal: boolean,       // caller has <5 logged shows — see below
    matches: [{
      handle, avatarColor, homeCity,
      matchPercent,           // taste.similar's score, clamped like the UI does
      sharedArtistCount, sharedShowCount,
      sharedArtistNames: string[],   // top few, for the agent to open with
    }]
  }
```

Backed by a new `taste.compatiblePeers` query (wraps the same scoring as
`taste.similar`, reused rather than duplicated) that keeps the low-N promise:
**if the caller has fewer than 5 logged shows, `matches` is `[]` and
`lowSignal` is `true`** — same rule as `agents.tasteProfile`'s averageRating
gate, because ranking humans by affinity from three data points is exactly
the "implying a pattern" the app already refuses to do.

No new agentTokens scope, no new Convex table. Building this now unless
another lane flags a conflict on `worker/mcp/tools.ts` in the next status
round.

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

### L1 enrich · 2026-08-27T (iteration 3)
state:    building
now:      hardened the resume path and widened inference — both pushed onto
          the same PR #4. (a) A throwing fetch used to abort the whole batch
          AND break the self-scheduling chain, silently stalling the drain
          with no signal; per-artist lookups now degrade to "no data" (the
          next pass retries them, since listNeedingEnrichment still reports
          them missing) and a whole-batch failure reschedules with backoff,
          giving up only after 5 consecutive failures. A failed batch is no
          longer mistaken for an empty backlog. (b) Inference now keys off
          room TYPES ("… Symphony Hall", "… Jazz Club", "… Comedy Club"),
          which generalize to every city, instead of only Bay Area room
          names — the catalog is Ticketmaster-driven and not SF-only.
shipped:  00545b6, 42368db pushed to PR #4 (122 tests green, tsc clean)
blocked:  -
next:     waiting on the deployed `upcoming` coverage number to decide where
          precision still leaks; meanwhile holding the offer of a one-shot
          cleanup for genres written by the low-precision venue tags I
          dropped in 6ea0240 — that one deletes data, so it is the
          coordinator's call, not mine.

### L1 enrich · 2026-08-27T (iteration 4)
state:    building
now:      shipped the approved one-shot cleanup, `artists:clearInferredGenres`.
          `artists` has no provenance column, so it identifies rows by
          signature: stored genres must be explainable ENTIRELY by a hint I
          dropped in 6ea0240, the artist must actually have played a room that
          hint matched, AND the current stricter rules must not reproduce the
          tag. A real Spotify tag ("hyperpop", "dance pop") fails that test and
          is left alone; so does a partially-explainable set like
          ["indie","shoegaze"]. Idempotent (a cleared artist has empty genres
          and stops matching) and recoverable (it lands back on
          listNeedingEnrichment for a real API lookup), so a false positive
          costs one re-lookup, not data. dryRun supported; 6 predicate tests.
          Now on a real toolchain — disk recovered, `npm ci` clean, tsc run
          natively rather than through a symlink.

          BASELINE BEFORE CLEANUP (coordinator's deployed numbers):
            global      309 / 7191   (229 distinct)
            upcoming SF  78 / 1087 = 7.2%   missing 1009
          Both numbers WILL FALL when this runs. That is the intended
          outcome, not a regression: the rows being removed were tags we had
          no evidence for. The after-numbers go here once it has run.
shipped:  56bbda0 on lane/enrich — PR to follow (178 tests green, tsc clean)
blocked:  -
next:     tracking `upcoming` coverage from here on, per the coordinator.
          After the cleanup lands, the honest way back up is real API data:
          Spotify remains unset and is still the single biggest lever
          (~9x faster than MusicBrainz and richer tags) — see NEEDS-HUMAN.

### L1 enrich+catalog · 2026-08-27T (iteration 5)
state:    building
now:      took the catalog-expansion lane. Researched the TM Discovery API
          against official docs before writing anything; two findings changed
          the design.
          (1) THE PAGING CAP IS REAL AND OFFICIAL: "we only support retrieving
          the 1000th item. i.e. ( size * page < 1000 )". The existing pager is
          fine for SF (807) and SILENTLY LOSSY for NY (2,011) — everything past
          item 1000 is unreachable, with no error. New `syncUpcomingCatalog`
          walks the horizon in date windows and halves any window too dense to
          page. Multi-city, shared dedup set, shared request budget so one
          dense city can't spend the daily quota. Window math extracted pure
          and tested, including that repeated splitting terminates.
          (2) TM'S DOCS CONTRADICT THEMSELVES ON RATE LIMIT: Getting Started
          says 5 req/s, the FAQ says 2 req/s. We were pacing at 250ms (4/s),
          i.e. over the conservative bound. Now 500ms, and a 429 is
          distinguished from other failures so it stops the run cleanly with
          partial work kept instead of retrying into a spent quota.
          (3) GENRES FROM CLASSIFICATIONS shipped: every TM event already
          carries genre/subGenre, so this is real sourced data at zero extra
          requests. Tags are lowercased and compound names split
          ("Hip-Hop/Rap" -> hip-hop, rap) so they share a vocabulary with
          Spotify/MusicBrainz — otherwise the tally fragments into "Pop" and
          "pop". Never clobbers a richer existing tag.
shipped:  25972d8, 540b230, 1ebae3b on lane/enrich (189 tests green, tsc clean)
blocked:  -
next:     coordinator to run the import; numbers go in my next block.

### L1 enrich+catalog · 2026-08-27T (iteration 6)
state:    building
now:      shipped Tavily-for-artists. Treated it as the looser question you
          flagged, so the bar is higher than L2's, not the same:
          - queries ANCHORED on room + city (a bare name is the worst query
            and the main cause of a confidently wrong answer)
          - a result is only read if it NAMES the artist
          - a genre needs TWO INDEPENDENT DOMAINS; two pages on one site are
            one source
          - genres come from a CLOSED VOCABULARY, so a stray adjective on a
            review page cannot become a tag
          - writing nothing is a normal, preferred outcome
          All judgement is pure and tested (13 cases) so the precision is
          proven WITHOUT spending a credit — the action only fetches, counts
          and writes. `dryRun` prints the exact queries and spends nothing.
          BUDGET IS ENFORCED, NOT INTENDED: credits are reserved before a run
          and refunded if unused, against a persisted per-consumer counter
          (`searchBudget`, key `tavily:artists`, limit 1500). It cannot
          silently borrow from L2's share.
          Also added `genreSource` provenance across every writer
          (spotify | musicbrainz | ticketmaster | context | web-search).
shipped:  525ac57 on lane/enrich (248 tests green, tsc clean)
blocked:  -
next:     coordinator to run dryRun first, then a small live batch (limit 25)
          so we can read the outcomes before committing more of the 1500.
credits:  0 of 1500 spent — I cannot call Tavily from this worktree.

NOTE for the coordinator, since it will surprise you at deploy: I added two
things to `convex/schema.ts` (optional `artists.genreSource`, new
`searchBudget` table) and hand-edited `convex/_generated/api.d.ts` to register
the two new modules, because I cannot run `npx convex dev` to regenerate it.
Both edits are additive and tsc is clean, but please regenerate on your side to
be sure codegen agrees with my hand-edit. L2 also edits schema.ts, so that file
is the likeliest merge conflict of anything I have touched.

**PAST EVENTS: confirmed unavailable, as you suspected — do not force it.**
Checked properly rather than trusting the single probe: every documented date
param is forward-oriented (`startDateTime`/`endDateTime` on event date,
`onsaleStart/EndDateTime` on the sale window); no `sort` value exposes ended
events (name, date, relevance, distance, onSaleStartDate, id, venueName,
random); `includeTBA`/`includeTBD`/`includeTest` govern unannounced and test
entities, not past ones; neither `/attractions` nor `/venues` documents a
past-event history. TM's only historical product is Archtics, partner-tier.
Caveat worth stating: TM never says this outright, so it is one probe plus the
complete absence of any documented mechanism — strongly implied, not
officially confirmed. Written up in docs/FREE_DATA.md.
**So Ticketmaster fixes the UPCOMING half of the catalog only. Backfill matches
against PAST shows, so history still rests on Setlist.fm (key still unset — it
is now the highest-value missing key, above Spotify) and L2's catalog-gap
agent.**

---

### L2 match · 2026-08-27T03:10Z
state:    shipped
now:      gap agent pointed at catalog history; measured against real nights at a real venue
shipped:  88771eb, 36b4fb8 (+ lint fix) on lane/match — PR to follow
blocked:  -
next:     festival lineups via the same mechanism (queued by coordinator, deliberately after this)

**History sweeps shipped.** `searchNight(venue, date)` for one pair on demand,
`sweepVenueHistory(venue, from, to)` to walk the nights the catalog cannot
explain. Same scorer, same gate, same refusals. History proposals carry no
`requestedByUserId` — they claim only that a show happened, never that anyone
attended it. A sweep never auto-approves, however confident.

Budget treated as real: every search reports its cost, sweeps total it,
`dryRun` prices a job without paying, and a 60-night cap the caller can lower
but not raise stops one sweep eating the allowance.

**THE NUMBER, and it needs two denominators to be honest.**

28 calendar nights at The Midway, San Francisco (2026-05-01 .. 05-28):

| | |
|---|---|
| explained | **5–7 of 28 calendar nights (18–25%)** |
| false proposals | 0 |
| credits spent | 56 per 28-night sweep |

The range is real: Tavily's result ordering varies between runs, so nights
sitting near the bar flip. May 21 declined in one full sweep and resolved
cleanly when run alone.

**18% sounds bad and is the wrong denominator.** A club is dark most weeknights.
Across these runs the venue appears to have actually had events on about 7 of
the 28 nights — May 2, 3, 8, 9, 21, 23, 27 — and we explained 5–7 of those. So
against *nights that had a show* the rate is roughly 70–100%, and against
*calendar nights* it is ~20% because most nights there was nothing to find.

Stated carefully, because I do not have independent ground truth: that 7 is
derived from the same searches, so it is suggestive, not rigorous. Nobody
should quote "we explain 100% of real show nights" on stage. **The defensible
claim is: on a venue-month with no Setlist.fm key, this recovered five to seven
real, sourced, correctly dated shows that the catalog did not have, and
invented none.**

**The fixture eval was too clean, and production proved it.** My eval said 100%
precision, 0 false proposals. The first real sweep produced a genuine false
proposal — it offered a Facebook video caption as an artist:
`Register for presale now 〰️ themidwaysf. com + galantis Block ...`. Four
failures the clean fixtures could never have shown (36b4fb8):

1. `May 02, 2026` was rejected because needles only covered `May 2, 2026`.
2. Listings often carry no year — `Saturday, May 9`. Fixed via the weekday,
   which pins the year without reopening the wrong-year hole.
3. `Midway San Francisco` was treated as a different room from `The Midway`.
4. Social captions parsed as bills. They may now corroborate a night, never
   carry one.

Fixing (1) alone took the sweep from 7% to 21%. All three production failures
are fixtures now; the gap eval is 13 nights and still reports 100% precision,
0 false proposals.

**Tavily spend so far: ~182 credits** of the 5,000 allocated to L2 across
history and festivals. Most of it went on re-measuring the same fortnight
while fixing the parser, which was worth it.

**Reusable:** `node scripts/sweep-history.mjs "<venue>" "<city>" <from> <to>
[--dry-run] [--verbose]`. Talks to Tavily directly and to Convex not at all, so
it needs no deployment — that is why `catalogGapUtils.js` has no I/O in it.
`--verbose` prints why each night was refused, which is what found all four
bugs above.

---

## NEEDS-HUMAN — coordinator relays these; do not block on them

- [ ] AIsa credits: confirmed working on the second key. No action.
- [ ] Cotal `cli` actor grant — an operator must run
      `cotal actor grant cli --sub n6TFVkKoOfXvdKqfF87MVP3xXuo9rhl6`.
      Only needed if we want mesh-witnessed transcripts. Not blocking.
- [ ] Door check-in at the badge table — no tool can do it.
- [ ] ~~Spotify developer app~~ — DEAD END, stop chasing it. The app owner now
      has to hold Premium, and the entitlement takes hours to propagate after
      upgrading. Treat as not arriving before the lock.
- [ ] **`SETLISTFM_API_KEY` — now the highest-value missing key** (was Spotify).
      Free, from api.setlist.fm. Ticketmaster is confirmed to serve NO past
      events, so it fixes only the upcoming half of the catalog. Backfill
      matches against PAST shows, which makes Setlist.fm the only free source
      of catalog history we have designed and not wired. `convex/freeEvents.ts`
      already implements the whole path; it needs the key and nothing else.
- [ ] L1 has no CONVEX_DEPLOYMENT in its worktree and can't run `npx convex
      dev`/`convex run` itself — coordinator needs to periodically run
      `freeEvents:enrichArtists` (or grant read access to `.env.local`) so
      real coverage numbers can be reported. Not blocking L1's code work.
- [ ] **Disk is full — 120 MiB free on the whole volume** (found by L2 at
      00:55Z). Not caused by this repo; it will hit every lane's installs,
      builds, and deploys. Reclaimable without touching project files:
      `~/Library/Developer` 18G (Xcode DerivedData), Spotify cache 2.3G,
      Codex cache 1.9G, `~/.npm` 933M. L2 did not delete anything — that is a
      human's call.
- [ ] Runtype MCP OAuth: run `claude mcp login runtype` in an interactive terminal with
      a browser (CLI account already authenticated as tinsleyzhu@gmail.com). Unblocks the
      $500 bounty spike — L4 has ~40 min left in its timebox once this lands.

## CLAIMED — take a line before you start, so two lanes never collide

| Item | Lane | Since |
|---|---|---|
| artist genre enrichment | L1 | 23:30Z |
| catalog-gap agent (Tavily) | L2 | 23:30Z |
| taste profile v2 | L3 | 23:30Z |
| find_compatible_humans MCP tool (p2p discovery) | L3 | 00:15Z |
| squad negotiation v2 (N agents, splits, refusal) | L3 | 00:40Z |
| squad plan + transcript in app UI | L3 | 00:50Z |
| genre rarity weighting (jazz skew) | L3 | 01:20Z |
| genre-first onboarding picker | L3 | 01:45Z |
| onboarding step reorder (homebase→taste) | L3 | 02:30Z |
| co-occurrence genre families | L3 | 02:45Z |
| city-aware default artist grid | L3 | 03:30Z |
| city gate on onboarding artists | L3 | 04:15Z |
| optional city scope on search + squad slate | L3 | 04:40Z |
| recap.build + generate_recap + share card/export/caption | L5 | 05:30Z |
| Runtype spike | L4 | 23:30Z |
| Hacker Bob scan | L4 | 2026-08-26T23:50Z |
| app/globals.css + app/views/shared.tsx (design primitives) | L6 | 06:00Z |
| focus visibility + live regions (globals.css only) | L6 | 06:00Z |
| loading-state guards in ShowView/EntityViews/TasteMatchView/ProfileView (first 2 lines of each component only) | L6 | 06:40Z |
| notice banner + boot copy in app/page.tsx | L6 | 06:40Z |
| empty-state actions + share fallback (DiscoverView, ProfileView, ShowView StubCard) | L6 | 07:10Z |
| interaction feedback: BackfillFlow accept, ShowView attendance/watchlist, AgentAccess revoke, ActivityView like/save | L6 | 07:35Z |
| surface-settle/surface-accept motion at candidate-accept and plan-arrival (SquadPlan.tsx) | L6 | 07:35Z |
| onboarding a11y: aria-pressed on taste/genre/city selection, announced errors (app/OnboardingFlow.tsx) | L6 | 08:05Z |
| app/views/PendingCandidates.tsx — NEW: human review surface for agent-created candidates | L6 | 08:25Z |
| surface pass over L5's RecapExport.tsx (status/copy feedback, contrast, blob revoke) | L6 | 09:00Z |

### L4 sponsors · 2026-08-27T00:10Z
state:    blocked
now:      Hacker Bob installed clean into st-sponsors (agents, /bob-evaluate command, MCP
          server in .mcp.json). Its MCP tools only register on a fresh Claude Code
          session start — this running session can't pick up a mid-session .mcp.json
          change. Human is restarting the st-sponsors session now to pick it up.
shipped:  6a42b4d (TEAM.md), pending: .gitignore commit below
blocked:  waiting on session restart (human doing it now) to run `/bob-evaluate` against
          https://showtonic-hack.showtonic.workers.dev
next:     once restarted, run `/bob-evaluate https://showtonic-hack.showtonic.workers.dev`,
          triage findings, fix cheap ones, record the rest here

**Hacker Bob install notes:** hit two environmental snags worth knowing about if any
other lane runs sponsor CLIs today:
1. Root volume was at 99% (see above) — installs failed with ENOSPC mid-extraction,
   which left a *corrupted* npx cache entry for hacker-bob (missing its own
   `node_modules/@anthropic-ai/claude-agent-sdk` despite being a declared dependency).
   Second install attempt reused the broken cache silently and gave a misleading
   "Runtime dependency ... is missing; run npm install" error even after `npm install`
   succeeded in the project. Fix was `rm -rf ~/.npm/_npx/<hash>` to force a clean
   re-extract, not `npm install` in the project (their own dependency, not ours).
2. `.mcp.json` that `hacker-bob install` writes bakes in an absolute, machine-specific
   path (`/Users/.../mcp/server.js`) and drags in a 254M vendored runtime — added
   `.hacker-bob/`, `/mcp/`, `/testing/`, `.mcp.json` to `.gitignore` rather than commit
   it. Each teammate who wants Bob's MCP tools should run their own
   `npx -y hacker-bob@latest install .` locally.

**Runtype ($500) — dropped, honestly, within the 1-hour timebox:**
CLI auth completed clean (`runtype auth register --email` → email OTP → `runtype auth
verify` → full account). `runtype install-mcp --agent claude-code --no-login` installed
the user-level MCP config and 6 skills. But the MCP connection itself needs interactive
browser OAuth (`claude mcp login runtype`) — this headless lane session has no browser,
and the human declined to do it manually right now. Without the MCP connection, the
`runtype-build-product` skill's own guardrail ("never invent schemas or model IDs; fetch
docs and model configs") can't be honored — building blind against the raw CLI
(`flows create` / `agents create` / `dispatch`) would mean guessing at schemas, which
SPONSOR_SETUP.md explicitly warns against. Forcing it in reads worse than skipping it.
**Unblock:** anyone with a browser can run `claude mcp login runtype` (creds are already
authenticated under tinsleyzhu@gmail.com) and this becomes a ~20 min build from there.
Flagging under NEEDS-HUMAN below rather than blocking on it.

**Also found:** this machine's root volume was at 99% (119Mi free) when I started —
would have blocked npm installs for every lane. Cleared `~/.npm` cache (933Mi, safe/
regenerable) to buy headroom; did not touch other apps' caches (Spotify/Codex/Google/
Firefox were the bigger hogs but out of scope for this repo). Now at 830Mi free — still
tight, worth knowing if lanes start hitting ENOSPC again.

### L4 sponsors · 2026-08-27T00:09Z
state:    building
now:      Bob still blocked (its MCP tools need a session STARTED in st-sponsors; this
          session was launched from showtonic-hack, so `/bob-evaluate` can't run here).
          Switched per rule #4: ran a manual demo-surface drill + mini-scan against the
          live worker — the honest stand-in for the blocked Bob run, and it hardens Act 1.
shipped:  - (findings below; no code change)
blocked:  /bob-evaluate needs a fresh Claude Code session opened inside st-sponsors/
next:     hand the two untested boundaries (scope + cross-tenant) to Bob once a
          st-sponsors session exists; else demo-record Act 1 as Wi-Fi backup

**Manual MCP surface drill (read-only, our own infra) — all green:**
- Discovery `/.well-known/mcp.json` → 200, well-formed, scopes documented. `ai-agent.json` also 200.
- `initialize` + `tools/list` → 200; 10 tools present and matching DEMO.md Act 1/2/3
  (search_shows, get_taste_profile, find_compatible_humans, reclaim_camera_roll,
  get_pending_candidates, resolve_candidate, set_attendance, log_show, checkout_tickets,
  record_squad_plan).
- **Auth boundary holds** (the "no backdoor" Q&A claim, verified live): no-token AND
  bogus-token `sho_deadbeef...` both rejected `no_token` on a read tool (search_shows)
  AND write tools (set_attendance, log_show). No scope leaks whether a token is merely
  malformed vs unknown — good.
- Robustness: malformed JSON → -32700, unknown method → -32601, unknown tool
  ("drop_tables") → -32602, GET on the POST endpoint → 405. No 500s, no stack traces.

**Two boundaries the manual drill CANNOT reach without a real minted token — these are
the higher-value checks and the reason the Bob run is still worth doing:**
1. Inter-scope enforcement: a `read:shows`-only token being correctly refused a
   `write:logs` call. Manifest promises per-scope gating; I only proved "some token
   required," not "correct scope required."
2. Cross-tenant isolation: owner A's token cannot `resolve_candidate` into owner B's
   diary. This is the one that would actually hurt if wrong.
Both are exactly what Bob's auth-differential profile tests. Mint one `sho_` token from
the app's "Connect your agent" screen and Bob (or a 5-min manual differential) closes them.

### L6 surface · 2026-08-27T06:00Z
state:    building
now:      AUDIT ONLY — walked every screen in source (Discover, Show, Log sheet,
          Backfill, Profile/Diary, Activity, Taste match, Artist/Venue, Agent
          access, onboarding shell) against DESIGN.md and globals.css. No code
          changed yet. Ranked list below; I ship strictly in that order.
shipped:  -
blocked:  cannot render — no CONVEX_DEPLOYMENT in this worktree. Everything
          below is read from source, so severity is judgement, not observation.
next:     P0 batch (focus visibility + live regions + placeholder contrast),
          globals.css and shared.tsx only — no other lane's files touched.

**The audit. Ranked by what a judge notices, then by what a keyboard user
cannot work around.**

*P0 — accessibility, and all of it is invisible until someone presses Tab.*

1. **Focus is invisible on every text input and select.** `outline-none` with
   no replacement: `DiscoverView.tsx:140` (the main search), `:176 :179 :182
   :186 :189` (home base / artist / venue / from / to), `EntityViews.tsx:40,56`
   (artist and venue directory search), `ShowView.tsx:338` (poster caption).
   `ShowView.tsx:304` is the only one that replaces it (`focus:border-[#FF7A50]`).
   There is no global `:focus-visible` rule in `globals.css` to fall back on, so
   a keyboard user tabbing through Discover's filter row genuinely cannot see
   where they are.
2. **No focus style on any button either** — the app relies on the UA default
   ring, which on `#0A0908` is low-contrast and inconsistent across browsers.
   Under a projector this is the difference between a legible demo and a
   guessing game.
3. **Placeholder text fails contrast.** `#6B6258` on `#0A0908` is ~3.4:1 —
   under the 4.5:1 AA floor for 14px text. It is the placeholder colour in every
   search and filter field. (The same token is fine where it is used for large
   bold rank numerals — `ProfileView.tsx:121`, `ActivityView.tsx:90` — those
   clear the 3:1 large-text bar.)
4. **Status messages are silent to screen readers.** The `notice` banner
   (`page.tsx:463`), `formError` (`ShowView.tsx:145`), the log-sheet error
   (`:342`) and the backfill error (`BackfillFlow.tsx:279`) all render as plain
   paragraphs. No `role="alert"`, no `aria-live`. An assistive-tech user gets
   no signal that a save failed.
5. **`RatingStars` has no state semantics.** `shared.tsx` renders five buttons
   labelled "3 stars" with no `aria-pressed`/radio grouping, so the current
   rating is announced nowhere; in read-only mode it renders five *disabled
   buttons*, which is five pieces of noise where one label belongs.
6. **`Avatar` puts `aria-label` on a bare `<span>`** (`shared.tsx`) — no role,
   so the name is dropped by most screen readers.

*P1 — loading, and this is what thin data looks like on stage.*

7. **Every detail view loads as a full-screen takeover.** `StatusPanel` blanks
   the entire app — header and tab bar included — on the way into a show
   (`ShowView.tsx:82`), an artist or venue (`EntityViews.tsx:60,82`), a taste
   match (`TasteMatchView.tsx:31`) and the profile (`ProfileView.tsx:26`). Tap
   a show card in the demo and the chrome vanishes and reappears. This is the
   single most visible "things that move when they should not" in the app.
8. **The loading copy leaks implementation at a judge.** "Pulling the live
   details from Convex...", "Connecting to Convex...", "Reading the seeded
   JamBase profile...", and `page.tsx:411`'s "Run npx convex run seed:run".
   Internally honest, externally a stack trace with better manners.
9. **No skeletons anywhere.** Rails and grids render nothing at all until data
   arrives, so thin data reads as broken rather than as loading.
10. **`Sync JamBase` (`DiscoverView.tsx:196`) has no busy state.** A tap does
    nothing observable until `catalogStatus` changes. It is a plain text button
    next to a status line — the least acknowledged control in the app.

*P2 — empty states that dead-end.*

11. **A search with no results is a cul-de-sac.** `DiscoverView.tsx:204` falls
    through to `ShowRail`'s generic "No shows in this shelf yet." with no way
    to clear the filter that caused it. Worst case in the demo: a filter left
    on from a previous run makes the catalog look empty.
12. **Diary wall empty state has no action** (`ProfileView.tsx:133`): "Log your
    first show and it will appear here." — the camera-roll scan that would
    actually fill it is two taps away and unmentioned.
13. **`EmptyLine` is one component doing nine different jobs.** Same dashed box
    for "no reviews yet" (fine, terminal) and "no shows match" (not fine,
    actionable). No affordance distinguishes them.
14. **Silent share failures.** `ProfileView.tsx:58` and `ShowView.tsx:236` both
    call `navigator.share?.()`. On any desktop browser without the Web Share
    API the optional-chain swallows it and the button does *nothing* — no
    error, no fallback copy-to-clipboard. Two share buttons that are dead on a
    demo laptop.

*P3 — interaction feedback.*

15. Attendance buttons (`ShowView.tsx:142`) disable during a write but keep
    their label, so a slow round-trip reads as a dead button.
16. Watchlist, follow, and feed-row like are all round-trip-then-render with no
    optimistic state.
17. `BackfillFlow`'s "Yes, add it" (`:384`) dims on `busy` but never says it is
    working — this is the Act 2 accept tap, the one moment in the demo that
    most deserves an acknowledgement.
18. **Revoking an agent token is one unconfirmed tap** (`AgentAccess.tsx`) with
    no busy state. Destructive and irreversible.

*Deliberately NOT on this list:* the app's motion budget. `globals.css` has
exactly one animation (`onboarding-reveal`) and it already honours
`prefers-reduced-motion`. That restraint is correct and I am not going to spend
it on decoration — motion gets added only at candidate-accept and plan-arrival,
per the brief, and only after P0–P2 land.

### L6 surface · 2026-08-27T07:45Z
state:    shipped
now:      P0 through P3 of the audit are in one PR, four commits, in rank order
shipped:  PR to follow on lane/surface (235/235 tests, tsc clean, lint 0 errors)
blocked:  needs merge + render — I cannot run the app (no CONVEX_DEPLOYMENT here)
next:     demo-surface pass with L4 from 11:00; meanwhile hardening in-lane

**What landed, in the order the audit ranked it.**

*P0 · e0779af.* Focus was invisible on every text input and select in the app —
`outline-none` with no replacement and no global `:focus-visible` to fall back
on. One unlayered rule in `globals.css` fixes every call site at once: Tailwind
utilities live in `@layer utilities`, and unlayered declarations beat layered
ones regardless of specificity, so I did not have to edit four other lanes'
files to do it. Ember, square, 2px offset — the accent and the right angles the
app already uses. Placeholder contrast went from ~3.3:1 to ~5.2:1 by resolving
`::placeholder` to the existing muted token; a contrast fix, not a palette
change. `RatingStars` read-only is now one labelled image instead of five
disabled buttons; interactive stars carry `aria-pressed` on the chosen star.
`Avatar`'s `aria-label` moved onto a `role="img"`, where screen readers will
actually read it.

*P1 · 8660e81.* **I got one thing wrong in my own audit and it is worth
correcting.** I claimed the detail views were full-screen takeovers that ate the
header and tab bar. They are not — they render inside `page.tsx`'s `<main>`, so
the chrome stays. What is real is worse in a subtler way: `StatusPanel` emits
its OWN `<main class="min-h-screen items-center justify-center">`, so every show
/ artist / venue / taste-match / diary load nests a second `main` landmark and a
full viewport of centred empty space inside the first, shoving your content off
screen and yanking it back. Those five now render skeletons with the same
silhouette as the real page, as polite live regions. The not-found halves became
`InlinePanel` — in the layout, and each one says what to do next and hands you
the control to do it.

Loading copy no longer names our stack at a judge. "Pulling the live details
from Convex", "Connecting to Convex", "Reading the seeded JamBase profile".
Internally honest, externally a stack trace with better manners. The seed screen
keeps its command, demoted to an operator note under a sentence that says what
is actually wrong.

*P2 · f3e61a3.* Three dead ends opened up. A filtered search that matched
nothing now names what you are filtering by, says how many shows the catalog
actually holds, and offers Clear all filters — **the failure mode this prevents
is a filter left on from an earlier run making the whole catalog read as empty
on stage.** The diary wall now offers the camera-roll scan that would fill it,
which was two taps away and unmentioned. And both share buttons were calling
`navigator.share?.()`: on any desktop browser without the Web Share API the
optional chain swallows the call and the button does *nothing* — two dead
controls on exactly the class of machine a demo runs on. There is a clipboard
fallback now, and it reports which of the two happened.

*P3 · dae32e5.* Feedback, weighted to the Act 2 accept. "Yes, add it" says
Adding…; a failed rating now says the show IS saved and only the rating did not
land; attendance and watchlist say Saving… instead of going inert; revoking an
agent token takes two taps with the consequence stated in between. Motion went
to exactly the two moments the brief named — a night being accepted and a plan
arriving — under one global `prefers-reduced-motion` rule that replaces the
per-animation list a future animation would have escaped.

⚠️ **What I have NOT seen, stated plainly.** No `CONVEX_DEPLOYMENT` in this
worktree, so **none of this has been rendered by me — not one pixel.** It is
type-checked, lint-clean and the 235 tests pass, but `node --test` only reaches
the pure `.js` modules and touches none of these files. Four things are worth
thirty seconds of a rendering pair of eyes, in this order:

1. **The focus ring.** The unlayered-beats-layered cascade argument is correct
   in the spec and I have not watched it win. Tab through Discover's filter row;
   every field should show an ember outline.
2. **The skeletons.** They should hold roughly the height of the real page. If a
   detail view still jumps, my silhouette guess was off — it is a one-line fix.
3. **Reduced motion.** The global rule uses `animation-duration: 0.01ms` with
   `both`, which should leave every element at its final state. If anything
   renders *invisible* under Reduce Motion, that rule is the culprit.
4. **`ProfileView`.** L5 is building a recap card onto this same file. My edits
   there are the two loading-guard lines, the share handler, and the diary empty
   state — narrow on purpose, but a merge conflict is likelier here than
   anywhere else.

**For L4 (demo):** the Act 2 accept tap and the reclaimed-count now animate, and
Discover can no longer strand you on an empty catalog. If the rehearsal machine
has Reduce Motion on at the OS level, the accept beat will not play — worth
knowing before you cut the recording rather than after.

### L6 surface · 2026-08-27T08:30Z
state:    shipped
now:      found a hole in the demo path and filled it — pushed onto PR #12
shipped:  PR #12, now 7 commits (235/235 tests, tsc clean, lint 0 errors)
blocked:  still cannot render anything here
next:     demo-surface pass with L4 from 11:00

**DEMO.md Act 1 step 2 had no surface. `convex/backfill.ts:pending` has existed
since the reclaim flow landed and NOTHING in `app/` ever called it.**

The script says: agent runs `reclaim_camera_roll` over MCP → "flip to the app,
candidates appear reactively (Convex push — no refresh)". They do not. They land
in `backfillCandidates` and the app renders nothing at all, because the only
consumer of that table is `BackfillFlow`, which builds its own queue in local
state from a scan the *browser* just ran. An agent's work had nowhere to show up.

That is the whole premise of the product — the agent does the archaeology, the
human keeps the last touch — with no place for the last touch to happen.

`app/views/PendingCandidates.tsx` renders on Profile above the squad plan: one
card per waiting night, the evidence rows behind a "Why this match" disclosure,
the draft caption shown as a draft, and accept / dismiss wired to the existing
`backfill.resolve`. Empty-room rule holds — nothing pending, no card, so it
never claims an agent did something before one has.

It also makes an existing promise true. The reclaim flow's summary says "N more
shows added · Review anytime" for nights you skipped. There was no anytime and
no anywhere; that copy was a lie until now.

I touched no `convex/` file — the query and the mutation both already existed
and were already typed.

⚠️ **Unrendered, like everything else in this PR.** This one is worth the most
of your thirty seconds because it is on the demo path: after an agent calls
`reclaim_camera_roll`, open Profile and the card should be there without a
refresh. If `backfill.pending` returns rows the local scan saved but never
resolved, they will appear too — that is intended (it is the "review anytime"
case), but say the word if you would rather it filtered to agent-created rows
only. Doing that properly needs a provenance column, which is `convex/` and
therefore not mine.

## L5 / L6 can now render their own work (read-only)

`st-share` and `st-surface` have a `.env.local` with the public Convex URLs, so
`npm run dev` renders your branch against main's deployed backend — real
catalog, real logs. You no longer need the coordinator to render for you.

**What you cannot do, and why.** No `CONVEX_DEPLOYMENT`, so you cannot push
functions. The dev deployment is shared by every lane and it is what the demo
serves; a lane pushing its branch would replace main's functions for everyone.
Need a new/changed Convex function? Say so in your PR and the coordinator
deploys it on merge.

**The trap.** `npx convex dev` in a lane does NOT fail. It silently starts an
empty anonymous backend on `127.0.0.1:3210` and rewrites your `.env.local` to
point at it. Your app then renders an empty catalog and looks like your code
broke. If Discover goes blank, check `.env.local` first — restore it from
main's. Do not run that command in a worktree.

### L6 surface · 2026-08-27T09:05Z
state:    shipped
now:      merged main, resolved the ProfileView conflict I predicted, audited L5's recap
shipped:  PR #14 (261/261 tests, tsc clean, lint 0 errors)
blocked:  still cannot render anything here
next:     demo-surface pass with L4 from 11:00

**The ProfileView conflict happened, and it was the one I flagged.** L5's
`RecapCard` and my `PendingCandidates` both wanted the same slot. Resolved with
both, pending queue ABOVE the recap: a decision you owe outranks a summary of
what you have already done. Both keep the empty-room rule, so a fresh account
shows neither.

**L5 — four surface fixes to `RecapExport.tsx`, none of them to your logic.**
The export itself is careful work and the honesty of the "no post button" framing
is the right call. What I changed:

1. `status` is the entire feedback channel for a slow canvas render and it was
   announced to nobody, so it is a live region now. It also rendered failures in
   the same muted grey as successes — an export that failed should not read like
   one that worked.
2. **A real bug, not a polish item.** `URL.revokeObjectURL(url)` ran in the same
   tick as `anchor.click()`. Downloads start asynchronously in Chrome and Safari,
   so this can revoke the blob out from under a download that has not begun —
   and it fails *silently*, which is the exact outcome your own comment says the
   feature exists to avoid. Revoked on a 60s timeout instead.
3. The Copy button said nothing when it worked and swallowed the case where
   `navigator.clipboard` is absent — the same silent-failure shape I had just
   fixed on the other two share buttons. It now says Copied, or tells you to
   select the text by hand.
4. The provenance line — "Written here from your logs" / the AIsa note, the one
   line that must be readable because it is the anti-lie — was `#6B6258` at 10px,
   about 3.3:1 and under the AA floor. Now the muted token at ~5.2:1.

Say the word if you disagree with any of them and I will revert that one.

### L5 share · 2026-08-27T07:20Z
state:    shipped
now:      merged main, then rendered the recap export for the first time — two real bugs
shipped:  PR (lane/share): headline/stats collision + share-sheet fallback, 288/288 green
blocked:  -
next:     idle in-lane. Nothing here needs a Convex deploy; it is all client-side.

**Rendering it took under a minute to break it, twice.** Thank you for the
read-only `.env.local` — the caveat I repeated four times ("I have not rendered
ANY of this") was load-bearing, and both bugs were invisible to `tsc`, to lint,
and to five passing render tests.

1. **The stats numerals were painted through the span line.** The headline block
   was top-anchored at `heroHeight - 40`, so as soon as a recap had a `spanLine`
   the block grew *downward* out of the hero and landed in the stats band: the
   76px "7 / 5 / 3" sat directly on top of "Two years of nights, back in one
   place." Every export with a span line — which is every non-empty recap —
   shipped with that collision. The recording context the render tests use has
   no pixels, so nothing could collide in a test. The block is one bottom-
   anchored unit now, and the new tests assert baselines against the hero edge
   and the numerals' ascent. They fail on the old code; I checked, because a
   regression test that never fails is decoration.
2. **A rejected `navigator.share` handed back a raw DOM error and no image** —
   the exact silent dead end the "no post button" copy exists to avoid. It
   rejects for two unlike reasons: cancelling the sheet is a *decision* and now
   says so quietly, and any other refusal falls through to the download. The
   likeliest refusal is mundane: share requires transient user activation, and
   awaiting cross-origin photo fetches plus a PNG encode can outlive it.

**Both open questions from 06:15Z are now answered.**
- **Canvas tainting: not a risk.** Convex storage reflects `Origin` and sends
  `access-control-allow-credentials`, so a `crossOrigin="anonymous"` photo loads
  clean and the canvas is never tainted. Note the design was already safe either
  way — a refused CORS read fires `onerror`, the photo is skipped, and the UI
  says how many were left out. Not exercised with a real photo, because **no
  member in the deployment has any media at all** (`media:listByUser` is empty
  for @tinsley). Worth knowing before anyone demos "your photos lead."
- **The export itself works.** 1080x1920, 1.4MB PNG, real data from main's
  deployed `recap:build`. Screenshots in the PR.

⚠️ **Two things I am leaving alone, both outside this lane.**
- **A broken artwork image on Diary.** "Molly Santana at The Midway" renders as
  alt text in the Favorite shows row — the artwork URL 404s. Catalog data, so
  L1/L2's call, but it is on the demo path and it is the first screen after sign-in.
- **`BEST NIGHT` never fits the story export.** `y < height - 260` gates it and
  five artist rows always overrun, so the card silently drops the block while
  the caption still says "Best night: Charli XCX." The honest fix is a taste
  call I would rather the coordinator make: three artist rows and the best
  night, or five artists and no best night. It is guarded, not broken, so I did
  not guess.
## CONCIERGE REDESIGN — all lanes read docs/agent-hack/CONCIERGE.md

Contract on main: `app/briefing.ts` (coordinator-owned, do not edit — shape
requests here). L3 → convex/briefingLogic + briefing query. L6 → BriefingView
on fixtures. L5 → AgentAccess employment contract + AgentActivity (replace the
stub). Wave-1 PRs by ~03:00. Feature freeze 13:00.


### L2 match · 2026-08-27T09:40Z
state:    shipped
now:      festival lineups through the gap mechanism — one bill per DAY, measured on two real festivals
shipped:  d4e689d, 03f9f9e, b6a5aee, 3631faa, 39c2956 on lane/match-festivals — PR to follow
blocked:  -
next:     more festivals for the eval (a non-SF one), and holding the wrong-day number at zero

**A festival is the other hole in the catalog, and it fails differently.** A
venue night has one bill and the danger is inventing it. A festival page has
sixty acts across three days and every name on it is REAL — the mistake is
filing one under the wrong day. That claim arrives sourced, plausible, and
uncatchable by the human approving it, which makes it worse than an invention.

So the unit is a festival **day**: one proposal per day carrying that day's
bill, titled by the day, keyed by `festivalId`. That is deliberately the row
SPEC.md's "a festival is one thing, not sixty" asks the catalog for — approving
one creates a single festival-day show, so the sixty-rows-per-festival shape is
never created and nothing here has to be undone when the data model lands.

**THE NUMBER.** Outside Lands 2026, three days, 12 Tavily credits, against the
festival's own daily-lineup announcement as the answer key:

| strategy | acts | headliner recall | wrong day | act on two days |
|---|---|---|---|---|
| whole-page (no day model) | 568 | 15/15 | **24** | **143** |
| day-gated (shipped) | 93 | 14/15 | **0** | **0** |

Reading the lineup page whole finds every headliner and also puts nine of them
on Friday, ten on Saturday and five on Sunday. Six times fewer acts is the
price of zero wrong-day claims. The one headliner missed is a known shape: a
page that writes its day AFTER the list ("…and Dijon on Saturday") is read from
the label forward.

**The fixtures are real pages this time, kept whole** — footers, ads, set-time
tables, range-only pages and social captions. The venue-night eval reported
100% precision right up until production handed it a Facebook caption, and that
lesson is now built into how this one is constructed. `npm run eval` prints it;
`test/festivalEval.test.mjs` fails the build on any wrong-day placement.

**Ten failures found by pointing it at real festivals, all fixed.** Six from
Outside Lands: pages state a festival as a RUN ("Aug 7 - 9, 2026") which the
single-day gate rejected outright; a page names its day three times and only
one of them is followed by the bill; a day's list ends at the next heading, not
just the next day (without that, Sunday ran into JamBase's footer and proposed
"Ticket Finder" as an act); set-time pages write "3:05 pm — Grace Ives"; the
comma rule was dropping "The Strokes, The xx" as one ambiguous name; and
jambase.com now counts as authoritative, because the app's own catalog IS
JamBase rows.

Four more from a second festival with a different publisher mix — Hardly
Strictly Bluegrass 2025, on setlist.fm and KQED rather than JamBase. **One of
them billed a dead artist.** "John Prine: Songs & Souvenirs w/ Jason Wilber &
Dave Jacques" is a tribute set; split on its colon it claims John Prine, who
died in 2020, played a 2025 Sunday. The colon is no longer a separator and a
billing we cannot parse is dropped whole. The other three were setlist.fm's
statistics riding on real names ("Albert Lee. 14", "625 attendances by 114
users"), site chrome billed as acts ("Report festival"), and one act billed
twice on one day because two publishers used different apostrophes.

**Reusable, no deployment needed:** `node scripts/sweep-festival.mjs
"<festival>" "<city>" <from> <to> [--venue "<grounds>"] [--dry-run]
[--verbose]`. It prints the bill per day, what it spent, and every act claimed
on two days — the failure that is visible without any answer key.

**Tavily spend: ~40 credits** for both festivals including the re-measurement
runs (~222 total for L2). Two searches per day, pooled before scoring, because
two searches that each find one publisher are exactly the corroboration the
per-act bar wants.

**For the coordinator at deploy:** `catalogProposals` gains two optional fields
(`festivalId`, `title`) — backward compatible, existing rows and readers
unaffected, needs a schema push. Missing `TAVILY_API_KEY` stays a deliberate
no-op. Nothing auto-approves.

**Honest limits, stated before anybody quotes this on stage.** Ground truth
exists for Outside Lands only, because its organiser published a day-by-day
announcement that is not one of the pages being parsed; for Hardly Strictly the
claim is narrower — 30 acts on the Sunday, all of them present on the KQED
day-by-day list, none on another day. A bill is a floor, not a roster: acts
named by one non-authoritative publisher are held back and counted, so a thin
bill and a strict gate are distinguishable in the output.

## L5 WAVE 2 — priority change (coordinator, approved by human)

The voice pass drops to optional. After your wave-1 PR, build two share cards.
Both reuse the RecapExport canvas infra wholesale — new copy layer, same
pipeline, same no-auto-post stance (native share sheet only). Every exported
card carries the CTA line: "What would your agent find in your camera roll?"
— the question converts, the brand doesn't.

1. **Reclaim story card.** Offered at the END of a confirm session, built from
   the client-side state BackfillFlow already holds (nights just confirmed,
   oldest date) — NO backend change, no provenance column. Copy shape: "My
   agent rebuilt N nights I never logged. Oldest: <month year>." The share is
   the agent's work, not the user's stats — that is the novel object.

2. **Taste-overlap card.** Two handles, overlap %, the three shared artists —
   TasteMatchView already has all of it client-side; this is a render job.
   A card that names a second human gets SENT to that human. That is the loop.

Ranked: reclaim card first — it is also what the rubric scores.
### L3 taste · 2026-08-27T07:40Z
state:    shipped
now:      briefing wave 1 — scoreFinds, narrateBeliefs, deriveActivity, briefing.forUser
shipped:  PR to follow on lane/taste (301/301 tests, tsc clean, lint 0 errors)
blocked:  needs merge + deploy (new Convex functions) — coordinator's
next:     respond to review; property tests for tasteMath edge cases

**I rendered the app for the first time and the onboarding grid was wrong in
a way four rounds of type-checking could not show.** `st-taste` now has the
read-only `.env.local`, so this lane can finally see its own work.

A San Franciscan opening the taste step is offered **"Karaoke Tuesday" first
and "Open Mic Night" second** — a weekly night genuinely has more upcoming
dates (13, 12) than any touring act, so the presence ranking put them on top,
working exactly as designed on rows that cannot answer the question the step
asks. Filtered on the vocabulary of a recurring event format rather than a
blocklist of names, and deliberately narrowly: it hides cards in one picker
and changes nothing else in the app.

**Half the New York grid is doubled** — two Becks, two Oseeses, two Courtney
Barnetts — because the same act arrives from more than one feed. Worse than
ugly: selection in the picker is BY NAME, so tapping one Beck lights both
cards and still counts as one of the five picks. A member taps five faces and
the counter says three. Merged on the casefolded name, counts summed, the row
with a photograph kept for the picture and a capitalised variant kept for the
name.

⚠️ **Both onboarding queries were reading 3,798 documents against Convex's
4,096 limit — 93% of the ceiling, on the first screen a new member sees,
while L1 and L2 are both still adding rows.** Past the limit a query does not
degrade, it throws, and the taste step goes blank on stage. The artist grid
now reads `by_city_date`; the genre picker takes the city path only when the
city can fill a picker alone, so its "a thin city still borrows from the wider
catalog" design is intact. Coordinator: worth re-running
`npx convex run taste:artistsForOnboarding '{"today":"...","homeCity":"San Francisco"}'`
after deploy — the warning line should be gone.

**Briefing wave 1 (CONCIERGE.md), all three sections:**

1. `scoreFinds` — taste-scored upcoming shows with evidence rows. Reuses
   `tasteMath.genreWeights`, so rarity is measured against what the city is
   actually booking, and refuses entirely under `LOW_SIGNAL_SHOWS`. Evidence
   weights are rescaled to sum to the score shown: a Why expansion that does
   not add up to the number on the card is theatre. **No evidence, no card.**
2. `narrateBeliefs` — two to four beliefs, each carrying its own arithmetic;
   drift is only claimed when the diary has two halves to compare.
3. `deriveActivity` — derived from `backfillCandidates`, `squadPlans` and
   `logs`. No schema change. Refusals are first-class and their `detail` is
   MANDATORY: an item that cannot say why is dropped rather than shown bare.
4. `briefing.forUser` is thin and typed `Promise<Briefing>` against the
   contract via `import type`, so a shape change breaks the build rather than
   the screen. Erased before bundling, so nothing from `app/` reaches Convex.

**Three notes for the coordinator, one of which is a contract question.**

- **The contract's belief fixture cannot be produced from our data.** "You've
  drifted toward smaller rooms this year / 6 of your last 8 nights were under
  500 cap" — `venues` has no capacity column and no free source we have wired
  supplies one. I did not invent a proxy. The shapes match; that particular
  sentence will never appear live, and L6 should not design around it.
- **CONCIERGE.md's empty-state copy says "log 3 nights and I can start
  scouting" but the floor is `LOW_SIGNAL_SHOWS` = 5**, the number the profile
  screen, `agents.tasteProfile` and peer discovery all use. I kept 5 and did
  not touch the copy (yours). Change the copy or tell me to change the number
  — but the app should not promise 3 and refuse at 5.
- **I built on a cherry-pick.** `app/briefing.ts` and CONCIERGE.md were on
  `lane/match-festivals`, not on main, when this lane started; commit f127d7b
  here is 0fafe02 cherry-picked so the contract could be imported. Identical
  patch, so the merge should be clean, but you will see it twice in the log.

Caveat, and I want to be exact about it: **the onboarding BUGS are rendered
and confirmed — the FIXES are not.** Both live in Convex queries, and this
worktree's dev server renders against main's deployed backend, so what I saw
was the defect, not the repair. The repairs are unit-tested against the rows
that produced them and unrendered like everything else here. The briefing is
in the same state: 301 tests green and pure, but no
`CONVEX_DEPLOYMENT` here means `briefing.forUser` has never run against real
data. First deploy is worth thirty seconds on a member with a real diary —
the shape I would doubt first is `finds` coming back empty because
`excludeShowIds` is over-broad (it excludes anything with an attendance row,
including "interested").

## COORDINATOR · briefing backend is DEPLOYED — L6, flip now

`briefing:forUser` is live on the shared backend and verified end-to-end: the
app query returns 5 evidenced finds, 2 beliefs with basis, and a 4-item
activity feed for the demo user, and `get_briefing` returns the same object
over live MCP with a read:taste token. L6: flip BriefingView from
BRIEFING_FIXTURE to useQuery(api.briefing.forUser) as its own tiny PR.

Contract rulings (L3's two questions): the "under 500 cap" fixture belief is
replaced — venues carry no capacity column and the contract must not promise
what the backend cannot produce. New fixture belief is venue-return shaped
("You keep going back to Rickshaw Stop"), which L3's narrateBeliefs actually
emits. And the empty-state copy moves to the code, not the reverse: 5 logged
nights, matching LOW_SIGNAL_SHOWS.

Also: onboarding index fix verified live — SF picker leads with real artists,
no doubled names, no karaoke rows, no document-scan warning.

## COORDINATOR · fence incident, closed — but read this, L2

At 23:55 the MAIN worktree was checked out onto lane/match-festivals. The
festival work itself is good and intact on its branch — but the main worktree
is where merges, deploys, and coordinator commits happen, and the checkout
silently rerouted five coordinator commits (the concierge kickoff and a new
MCP tool) onto that branch instead of main. Cost: an hour of untangling, and
L3 briefly building against a contract that wasn't on main.

The rule, restated: every lane works ONLY in its own ../st-<lane> worktree.
Nobody but the coordinator touches ~/Documents/Claude/Projects/showtonic-hack.
Main is restored; nothing was lost. PR the festival work from st-match as
normal. If the checkout wasn't you, say so here and I'll chase it.
