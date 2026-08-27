# Showtonic Agent-Ready — Demo Script

Target: ≤ 4 minutes live + 1 minute for the sponsor/architecture beat. Rehearse twice at
17:00. Record a full run as backup — conference Wi-Fi is a sponsor of nobody.

---

## Setup (before walking up)

- Convex seeded; catalog synced; two seeded friend users with distinct taste vectors.
- Your real camera-roll export (the one that worked in tonight's `exifr` spike) staged
  in a folder.
- Terminal 1: Claude Code (or any MCP client) with NO Showtonic config — it must
  *discover* the endpoint live.
- Terminal 2: squad orchestrator ready to run.
- Browser: app open on Profile (empty-ish diary state for contrast).
- **Fallback state** (see failure drill): a second seeded user whose reclaim + squad flow
  is pre-run, reachable by switching handle.

## Script

**Cold open (20 s).**
"Showtonic is a diary for live music. The problem: nobody backfills a diary. And the
hackathon question: what happens when agents show up? Here's our answer — agents that
reconstruct where you've been, so they can negotiate where you go next."

**Act 1 — Reclaim (90 s).**
1. In the MCP client: "Find Showtonic's agent interface and reclaim my camera roll from
   this folder." Show it hitting `/.well-known/mcp.json` → `reclaim_camera_roll`.
   *(Discovery + Access: mention the scoped token minted in-app, no human auth needed.)*
2. Flip to the app: candidates appear reactively (Convex push — no refresh).
3. Open one evidence card: GPS line, capture window, and — the money row — a night that
   **wasn't in our catalog**, found on the web by the catalog-gap agent (Tavily chip).
   "Every night it can't match, it goes and finds — the catalog grows as a side effect."
4. Accept two candidates (one with the draft caption pre-filled). "Human keeps last touch."

**Act 2 — Identity (20 s).**
Profile: taste stats updated. "Twenty reclaimed nights just taught my agent what I
actually like — not what I told an onboarding form."

**Act 3 — Plan (60 s).**
1. Run the orchestrator: three agents, three tokens, live transcript scrolling
   (Cotal log if landed — "identity the server verifies, not the agent asserts").
2. Converge → all three set going → payer agent checks out (AIsa / "mocked, honestly").
3. Flip to the app: squad plan card, `paid ✓`, tap into the transcript.
   "A human with no AI of their own can read exactly how the night got picked —
   that's the accessibility criterion, in product."

**Close (20 s).**
"One fleet rebuilt the past, updated identity, and a second fleet negotiated the future —
no human relayed anything. Everything you saw ships in Showtonic after this weekend:
the matcher, the MCP surface, the tokens, the catalog-gap agent. Built on Cloudflare,
Tavily, Cotal, AIsa — and Hacker Bob pentested the surface we opened, today."

## Failure drill

| Failure | Move |
|---|---|
| Wi-Fi dies | Backup recording of Act 1; run Act 3 locally (mock checkout, local log) |
| Live reclaim misfires on stage photos | Switch to the pre-run fallback user; narrate honestly ("this is this morning's run") |
| Cotal/AIsa flake | Both have pre-committed fallbacks (plain tokens / mock receipt) — say so plainly; judges reward honesty over smoke |
| MCP client can't discover | Paste the endpoint manually, keep moving — lose 10 s, not the demo |

## Q&A ammo

- **"Is the negotiation real?"** Yes — scored elimination over real taste vectors from real
  logs; deliberately simple. The interesting part is that all three agents used the same
  public front door with scoped tokens — our own fleet has no backdoor.
- **"Why should agents log shows?"** They shouldn't, mostly — humans approve everything.
  Agents do the archaeology and the coordination; the diary stays human.
- **"What's fake?"** (Answer honestly from what shipped: e.g., mock checkout if AIsa
  didn't land, vision agent cut if it was.) Have this list written down at 17:00.

## Demo-operations: seeds are consumed

The matcher refuses to re-propose a night already in the diary, so EVERY
rehearsal consumes its candidates. Before stage: fresh seed via
agents:reclaimCameraRoll on an account whose diary does not already hold those
nights. @walkthrough exists for rehearsals; the on-stage account needs its own
untouched seed. Also on the laptop checklist: disable extensions (Immersive
Translate causes a visible hydration warning in the console).
