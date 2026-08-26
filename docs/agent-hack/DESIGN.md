# Showtonic Agent-Ready — Design Notes

New/changed UI only. Everything inherits the existing app's visual language and the
`showtonic-design-exports/` screens; backfill surfaces extend designs `[07]–[11]`, `[17]`.
Principle carried over from FEATURES.md: **never ship an empty room** — agent surfaces stay
hidden until an agent has actually done something.

---

## 1. Evidence card (extends candidate card, designs `[08]/[09]`)

The v1 card says "62% likely". The v2 card **shows its work** — evidence rows under the
show match, one line each, ordered by confidence delta:

```
📍  6 photos within a block of The Midway            +35%
🗓  12 photos, 10:22 PM–1:47 AM on the show date     +50%
🔎  Found via web: 19hz listing for this night        (new show)
👁  Portola flyer visible in photo 3                 +15%
```

- Icons: reuse lucide (`map-pin`, `calendar`, `search`, `eye`).
- A candidate backed by a `catalogProposal` gets a small "found on the web · 19hz.info"
  source chip — attribution is part of trust (mirrors the JamBase attribution rule).
- Draft preview: caption + vibe chips render pre-filled in the accept sheet (design `[10]`),
  every field editable before save. The human always gets last touch.

## 2. Vision consent step (new, sits between scan and results)

The privacy promise on `[07]` is "photos never leave your device." Vision analysis is a
deliberate, *opt-in* exception and the copy must say exactly what happens:

> **Let Showtonic look at 3 photos from this night?**
> We'll check for flyers, stage screens, and the room to confirm the match.
> Photos are analyzed once and deleted — they never appear in your diary unless you
> choose them.
> [ Look at 3 photos ]   [ Match without looking ]

- Per-cluster, not global. Declining still yields date+GPS matching.
- Never pre-checked. No dark patterns in front of judges who read for exactly this.

## 3. "Connect your agent" screen (new, in Profile)

- Explains the deal in two lines: *"Your agent can search shows, read your taste, and
  fill your diary — you approve anything it logs."*
- Scope checklist (read taste / write attendance / write logs / **pay** — pay off by
  default, styled as the dangerous toggle it is).
- Token shown once in a copy field; after that, row shows label + scopes + revoke.
- If Cotal lands: identity badge ("verified via Cotal") on the row.

## 4. Squad plan card (new, Discover top slot + show page)

The Act 3 artifact humans see:

- Show poster + title/date/venue (existing show-card anatomy).
- Attendee row: three avatar dots (existing `avatarColor`) + "Planned by your agents".
- Status chip: `proposed → confirmed → paid ✓` with the receipt ref when paid.
- Tap → **negotiation transcript**: chat-style, one bubble per agent message, each stamped
  with the agent's identity. This is the Accessibility criterion made visible — a human
  with no AI of their own reads exactly how the night got picked.

## 5. Agent activity strip (small, Diary/Profile)

One quiet line per agent action ("`tinsley-agent` reclaimed 14 nights · 2:41 PM"), reusing
the receipts pattern. Suppressed entirely at zero events (empty-room rule).

## Anti-goals

- No new visual language, fonts, or palette — the day has no design budget; consistency
  beats novelty on stage.
- No anthropomorphizing the fleet in UI copy (no "I", no cutesy agent names in product
  surfaces; identity labels are technical: `tinsley-agent`).
- No confidence theater: percentages only ever come from the matcher's actual score.
