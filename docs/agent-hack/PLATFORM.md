# Immersive Commons platform runbook — anb-hack-01

Everything needed to operate on the hackathon platform, plus the payloads drafted
in advance so they can be fired the moment the token exists.

**Status: BLOCKED on token.** The IC MCP server is not connected to the Claude
Code session and no `ic_*` tool is reachable. Both fixes need a human.

---

## Clock (checked Wed 2026-08-26 12:07 PDT)

| | |
|---|---|
| Now | **Wednesday 12:07 PDT — day one, morning already gone** |
| Building clears | 20:00 today, 20:00 Thursday |
| **Submissions LOCK** | **Thursday 15:00** — further calls return `locked` |
| Working hours left | ~8 today + ~5 tomorrow ≈ **13** |

Submissions are idempotent per team and overwrite on every call, so the rule is
**submit a placeholder as soon as the team exists** and overwrite it all day.
Never hold the only submission back until it's finished.

---

## Step 1 — mint the token (human, once, cannot be widened later)

```bash
npx -y @immersivecommons/cli auth --scopes hack:read,hack:register,hack:team,hack:submit,keys:request
```

Scopes **freeze at mint**. A missing scope is not a re-auth, it is a whole new
token plus another human approval. `keys:request` is the one people forget and
it is what asks for model access on the day — it is included above, keep it.

## Step 2 — connect the MCP server

```bash
claude mcp add --scope user immersive-commons --transport http https://www.immersivecommons.com/api/mcp
```

Then restart the session so the `ic_*` tools load.

## Step 3 — orient (reads, run freely)

```
ic_health
ic_capabilities                        # authority on what MY token can reach
ic_hack_get  { eid: "anb-hack-01" }    # phase, seats, NDA, rubric, bounties
ic_hack_me   { eid: "anb-hack-01" }    # ← the "where do I stand" call
ic_request_tier                        # day one; rooms/inbox/directory are gated
```

Plan from `ic_capabilities`, never from an assumption about what should work.
Anything answering `needs_scope:<scope>` is out of reach on this token.

---

## Draft payloads (proposed — nothing is sent without approval)

### If `ic_hack_me` returns `registered: false`

Call `ic_hack_application_form { applicant_type: "solo_builder" }` first — the
real questions and their `why` fields come from the server. Answer to the *why*,
not the prompt. Substance to draw on:

- **What exists already:** Showtonic, a live-music diary. Next.js 16 + Convex on
  Cloudflare, ~935-show SF catalog from JamBase, taste-match scoring, photo
  backfill that reconstructs past nights from a camera roll. Shipped, not a deck.
- **What we're making agent-native:** an MCP front door over the existing Convex
  functions, scoped per-user agent tokens, and a three-agent negotiation that
  plans a night together and pays for the tickets.
- **Project URL:** `https://github.com/tinsleyzhu/showtonic-hack`
- **Agent surfaces served today: none yet.** That is a normal, honest answer and
  it is the whole point of the two days. A claim the platform's probe contradicts
  is worse than "none".

Applying does **not** hold a seat — a person reads it and the seat is consumed at
approval. Re-applying while pending updates the same application, so retrying
after a timeout is safe.

### Team

`ic_hack_team_list` first, then `ic_hack_team_create`. Pass `startup_slug` so the
work attaches to something that outlives the weekend.

### Submission — `ic_hack_submit`

```jsonc
{
  "title": "Showtonic — agent-native live music diary",
  "blurb": "Agents that reconstruct where you've been, so they can negotiate where you go next. A personal agent hands Showtonic's fleet a camera roll; the fleet rebuilds the nights, which updates the taste profile; three agents then negotiate one show, RSVP for all three, and one pays.",
  "repo_url": "https://github.com/tinsleyzhu/showtonic-hack",
  "demo_url": "<worker URL once deployed>",
  "agent_surface": "MCP server (Streamable HTTP) on Cloudflare Workers over Convex: reclaim_camera_roll, get_taste_profile, search_shows, set_attendance, log_show, get_pending_candidates, resolve_candidate, checkout_tickets. Discovery via /.well-known/mcp.json + llms.txt. Machine auth: scoped per-user agent tokens (read:taste, write:attendance, write:logs, pay), pay off by default. Multi-agent handoff over Cotal with a replayable log. Agent payments via AIsa."
}
```

`agent_surface` is what the 30-point band actually scores, so it **names surfaces**
rather than re-describing the product. Trim it to whatever is true at submit time —
never claim a surface that isn't live.

---

## Rubric → what to build next

100 points, five bands:

| pts | band | where we stand |
|---|---|---|
| 30 | the track's agent-native criterion | **0 — no agent surface exists yet** |
| 25 | it runs | strong: 104 tests, build green, live catalog |
| 20 | surface quality / coordination | **0 — no multi-agent coordination yet** |
| 15 | it lands in the product | strong: phase 1 shipped into the real app |
| 10 | the demo | scripted, not rehearsed |

**Half the rubric (50 pts) sits in bands we have not started.** Phase 1's matcher
work feeds the 25 + 15 bands, which were already our strongest. So the ordering
for the remaining hours is not "finish the evidence fleet" — it is:

1. **Phase 2, the MCP front door** — the only thing that opens the 30-point band.
2. **Phase 4, squad negotiation** — the 20-point coordination band.
3. Placeholder submission early, overwritten as each lands.
4. Vision agent and catalog-gap agent only if those two are done.

Track: **EXTERNAL** (customer facing) — the surface is for a user's own agent.

---

## Rules this agent enforces on itself

- Reads run freely. **Writes are proposed with the exact payload and wait for
  approval** — apply, submit, team ops, key requests, anything that spends.
- `{ ok: false, error_kind: "no_token" }` → the fix is a token, not a retry.
- `{ ok: false, error_kind: "rate_limited" }` → back off, do not hammer.
- **HTTP 200 is not success.** Business failures return 200 with `ok:false`;
  read the envelope, not the status code.
- Rooms, agent inbox, member directory and the research corpus need a higher tier
  than a fresh signup carries. Until `ic_request_tier` is approved, route help
  through `ic_feedback_submit` / `ic_feedback_get_status`, which work at public tier.
