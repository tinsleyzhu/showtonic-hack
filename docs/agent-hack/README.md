# Agent-Ready Hackathon docs (Cloudflare SF, 2026-08-26)

Plan of record for the Immersive Commons agentic hackathon build. Reading order:

0. [`PLATFORM.md`](PLATFORM.md) — Immersive Commons runbook: token scopes, MCP
   connect, the clock, drafted apply/submit payloads, and the rubric ordering.
1. [`SPEC.md`](SPEC.md) — what we're building: the three-act pitch, evidence fleet,
   MCP front door, squad negotiation, sponsor map, out-of-scope list.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — agent plane, data flows, schema deltas,
   auth model, security posture.
3. [`BUILD_PLAN.md`](BUILD_PLAN.md) — tonight's prep + hour-by-hour phases with exit
   criteria and the pre-committed cut order.
4. [`DESIGN.md`](DESIGN.md) — new UI surfaces only (evidence cards, vision consent,
   connect-your-agent, squad plan card).
5. [`SPONSOR_SETUP.md`](SPONSOR_SETUP.md) — which sponsor MCPs to install, exact
   commands, and the three signups only a human can do.
7. [`DEMO.md`](DEMO.md) — the 4-minute script, failure drill, Q&A ammo.

## Keeping these current

These docs are updated **as work lands**, not written once and left. When a
change ships, the same commit updates whichever of these it invalidates:
`SPEC.md` for what a feature is, `ARCHITECTURE.md` for how it is wired,
`BUILD_PLAN.md` for phase status, `../KEYS.md` for a new credential,
`../FREE_DATA.md` for a new data source. A doc that describes a plan the code
has outgrown is worse than no doc, because someone will trust it.

Base app docs: [`../SPEC.md`](../SPEC.md), [`../BUILD_PLAN.md`](../BUILD_PLAN.md),
[`../FEATURES.md`](../FEATURES.md). Nothing in this folder changes the base app's scope;
it adds an agent plane on top.
