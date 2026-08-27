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
- Browser: app open on **the Briefing** — that is home now, not Profile. The tab bar
  is Briefing / Browse / Diary / Log / Activity; "Profile" no longer exists as a tab
  (it is the Diary tab).
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
2. Flip to the app: candidates appear reactively (Convex push — no refresh) in the
   Briefing's first section, **"Your agent rebuilt these"**, under Decisions you owe.
3. Open one evidence card: GPS line, capture window, confidence.
   ⚠️ **The Tavily/web chip is NOT on the current on-stage candidate** — its evidence
   is `date` + `gps` + `volume`. Do not promise a row that will not be there. See the
   reconciliation note below; either seed a candidate that has a `web` row, or use the
   beat that IS live, which is stronger:
4. **The refusal (new, and the best 15 seconds we have).** The demo roll now carries a
   deliberate unplaceable night, so the scan reports nights rebuilt **and one declined**,
   live. Scroll to "While you were away": a HELD BACK row, reason always visible —
   *"Declined to name the night of <date> — no show in the catalog near where these were
   taken."* Say it out loud while it is on screen: **the summary in sans is the record,
   the reason in the serif is the agent speaking. One is an entry, the other is an
   explanation.** Nothing else in the demo shows the product refusing to guess.
5. Accept two candidates (one with the draft caption pre-filled). "Human keeps last touch."
6. **The share card appears on accept** — "Worth showing someone": *"My agent rebuilt N
   nights I never logged. Oldest: <month year>."* Story 9:16 / Square 1:1, and the line
   that matters: "We generate it, you post it — Showtonic never publishes to your
   accounts, and there is no button here that would."

**Act 2 — Identity (20 s).**
**Diary tab** (not "Profile"): taste stats updated. Say the number the scan actually
produced — the demo roll picks **6** nights plus the deliberate gap, so it is "six
reclaimed nights", not twenty. An inflated count is the one number a judge can check
against the screen behind you.

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
| JamBase images flake | Nothing to do — posters degrade to the ember note mark, not broken images. If someone asks, that is the fallback working |
| Refusal row absent on the account | The roll's gap night was already consumed. Re-seed, or narrate the one on @walkthrough honestly |

## Q&A ammo

- **"Is the negotiation real?"** Yes — scored elimination over real taste vectors from real
  logs; deliberately simple. The interesting part is that all three agents used the same
  public front door with scoped tokens — our own fleet has no backdoor.
- **"Why should agents log shows?"** They shouldn't, mostly — humans approve everything.
  Agents do the archaeology and the coordination; the diary stays human.
- **"What's fake?"** (Answer honestly from what shipped.) Known as of this pass:
  checkout settlement returns **"simulated"** and says so rather than implying a ticket
  was bought; the recap caption falls back to a **locally written** line, naming the
  reason, if the AIsa key is unset or unfunded. Have the final list written down at 17:00.
- **"Can the agent write to my diary?"** Show the Access screen — it is an employment
  contract now: duties in plain language, and two fenced under *Never on by default* —
  `pay`, and `resolve:candidates`, because an agent that can propose a night must not be
  able to approve its own proposal. That split is enforced server-side, not just in copy.

## Demo-operations: seeds are consumed

The matcher refuses to re-propose a night already in the diary, so EVERY
rehearsal consumes its candidates. Before stage: fresh seed via
agents:reclaimCameraRoll on an account whose diary does not already hold those
nights. @walkthrough exists for rehearsals; the on-stage account needs its own
untouched seed. Also on the laptop checklist: disable extensions (Immersive
Translate causes a visible hydration warning in the console).


## Reconciliation against prod — L5, after six merges

Walked the deployed build claim by claim. What I changed above is factual drift; what
needs a human call is here.

**Fixed in place:** home is the Briefing, not Profile ("Profile" is not a tab any more);
candidates land in "Your agent rebuilt these"; the reclaim share card is a real beat on
accept; Act 2's "twenty reclaimed nights" was inflated — the roll picks six.

**Needs a decision, not a doc edit:**
1. **Act 1's "money row" does not exist on the on-stage candidate.** @tinsley's only
   pending candidate carries `date` / `gps` / `volume` evidence and no `web` row, so the
   Tavily catalog-gap chip cannot be opened on stage. Either seed a candidate that has
   one, or retire that line and let the refusal carry the beat. The refusal is verified
   live; the chip is not.
2. **The sponsor close is unaudited.** I did not verify which of Cloudflare / Tavily /
   Cotal / AIsa / Hacker Bob actually landed in a form worth naming. Whoever owns the
   close should check each name against something that runs.
3. **Two lane outputs have no beat at all**: the taste-overlap share card (the only card
   with a named recipient — it gets *sent* to the other person, which is the p2p loop in
   one artifact), and the Access screen as the trust story. I put the Access screen in
   Q&A ammo rather than the script, because the run is already at four minutes.

**Timing:** Act 1 grew by the refusal and the share card. If it needs to come back under
90 s, cut step 3's evidence card — the refusal row shows evidence-driven reasoning more
vividly than the card does, and it is the one nobody else at the hackathon has.
