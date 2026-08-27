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

---

## NEEDS-HUMAN — coordinator relays these; do not block on them

- [ ] AIsa credits: confirmed working on the second key. No action.
- [ ] Cotal `cli` actor grant — an operator must run
      `cotal actor grant cli --sub n6TFVkKoOfXvdKqfF87MVP3xXuo9rhl6`.
      Only needed if we want mesh-witnessed transcripts. Not blocking.
- [ ] Door check-in at the badge table — no tool can do it.
- [ ] Spotify developer app (client id + secret) — would make L1 ~9x faster.
- [ ] Runtype MCP OAuth: run `claude mcp login runtype` in an interactive terminal with
      a browser (CLI account already authenticated as tinsleyzhu@gmail.com). Unblocks the
      $500 bounty spike — L4 has ~40 min left in its timebox once this lands.

## CLAIMED — take a line before you start, so two lanes never collide

| Item | Lane | Since |
|---|---|---|
| artist genre enrichment | L1 | 23:30Z |
| catalog-gap agent (Tavily) | L2 | 23:30Z |
| taste profile v2 | L3 | 23:30Z |
| Runtype spike | L4 | 23:30Z |
| Hacker Bob scan | L4 | 2026-08-26T23:50Z |

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
