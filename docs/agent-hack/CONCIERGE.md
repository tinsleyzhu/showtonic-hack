# Concierge redesign — the app becomes your agent's briefing

**Window:** now → 13:00 feature freeze → 15:00 submission lock.
**Coordinator merges and deploys. Lanes NEVER run `npx convex dev` (see TEAM.md — it silently rewires .env.local to an empty local backend).**

## The inversion

Today the app looks like a catalog with agent features attached. After this
pass it reads as a **concierge suite**: the agent works continuously — rebuilds
where you've been, scouts what fits, convenes who you'd go with — and the app
is where you review its work. The design language is already proven by
PendingCandidates: **every surface is a proposal, with evidence, awaiting one
of three verbs — Yes / No / Why.** Nothing autonomous ever writes to the diary;
the human keeps the last touch.

## The Briefing (new home surface)

One queue, ordered by the rule L6 set: *a decision you owe outranks a summary
of what you have already done.*

```
① DECISIONS YOU OWE       PendingCandidates + SquadPlan invites   (exists)
② WHAT YOUR AGENT FOUND   taste-scored upcoming shows + evidence  (NEW)
③ WHILE YOU WERE AWAY     agent activity feed, incl. refusals     (NEW)
④ WHAT IT BELIEVES        narrated taste profile, correctable     (NEW)
```

Empty-room rule holds everywhere: a fresh account renders none of these, and
section ② explains *why* it's empty ("log 5 nights and I can start scouting").

Discover's browse grid survives as a secondary tab. It is demoted, not deleted.

## Contract-first build

`app/briefing.ts` on main is the single contract: types + realistic fixtures.
UI builds against fixtures from hour zero; backend fills the same shapes; the
swap is a one-line `useQuery` flip. **The contract is coordinator-owned — no
lane edits it. Need a shape change? Post to TEAM.md and keep building.**

## Lane assignments (files never collide)

| Lane | Owns | Builds |
|---|---|---|
| L3 taste | `convex/briefingLogic.js` + `.d.ts`, `convex/briefing.ts`, `test/briefing*` | Pure, tested logic: (a) taste-score upcoming shows → `AgentFind[]` with named evidence; (b) narrate the profile → `TasteBelief[]`; (c) derive `AgentActivityItem[]` from existing tables (backfillCandidates, squadTranscripts, logs — NO schema change). Thin query `briefing.forUser` wraps all three. |
| L6 surface | `app/views/BriefingView.tsx`, `TabBar.tsx`, nav wiring | The Briefing: compose PendingCandidates/SquadPlan (exist) + new sections from fixtures. Evidence rows reuse the PendingCandidates pattern. Yes → watchlist/attendance mutation (exists); No → dismiss; Why → expand evidence. |
| L5 share | `app/views/AgentAccess.tsx`, `app/views/AgentActivity.tsx` (replaces stub), Recap voice | Mint screen becomes **the employment contract**: plain-language scopes ("Can plan nights · Cannot spend money"), `pay` visually fenced. Activity card renders `AgentActivityItem[]`, refusals styled as integrity, not failure. |
| L1, L2 | unchanged | Data + festivals continue; they feed section ② quality for free. |
| Coordinator | contract, stubs, merges, deploys, MCP `get_briefing`, demo script | Publishes the same briefing as an MCP tool — your agent can read its own briefing. |

## Scoring ground rules (L3)

Reuse `tasteMath.js` — do not invent a second taste model. Every score ships
with evidence rows a human can check ("4 nights at this venue rated ≥4★", "bill
overlaps 2 artists you follow"). **No evidence, no card** — same refusal
posture as the matcher. Cap section ② at 5; a concierge recommends, it does not
paginate.

## Schedule

- **T+0** contract + stubs on main (coordinator) → lanes launch in parallel
- **~T+3h wave 1 PRs**: L3 logic+tests · L6 Briefing on fixtures · L5 contract screen
- **merge point** coordinator merges L3, deploys; L6 flips fixtures → live (tiny PR)
- **~T+8h wave 2**: belief corrections ("that's wrong" writes taste evidence), voice pass, TasteMatchView link from ② ("2 people with your taste are going")
- **13:00 freeze** → demo pass, screenshots, submission update
