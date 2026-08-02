# Showtonic Hack — 3.5 Hour Build Plan

**Event:** Outside Lands hackathon, 2026-08-02
**Sponsors used:** JamBase (data) + Convex (backend)
**Target users:** Outside Lands attendees, Aug 7–9 2026, Golden Gate Park SF

---

## The one-sentence pitch

> Log the sets you saw, drop in your photos, get a shareable festival recap — and find the
> people whose taste matches yours.

## Demo script (build toward this, 45 seconds)

1. "I went to Outside Lands." → open festival page, full lineup
2. "I saw Charli XCX." → show page → log it: rating + vibe tags + upload 2 photos
3. "Here's my festival diary." → IG-style grid of everything I saw
4. "Here's my recap card." → tap Share → IG Story sheet opens
5. "And here's Maya — 68% taste match, we both saw RÜFÜS DU SOL and The Strokes."

Bonus if time: open a second phone, log a show, watch it appear live on the first (Convex
reactivity, free).

---

## Feature list

### Core (must demo)
- **Festival page** — Outside Lands lineup by day
- **Show page** (the deep one) — hero image, artist info (genres, hometown, bio, top track),
  log/rate CTA, your memories, who else went
- **Log flow** — half-star rating + vibe tags + photo/video upload
- **Diary** — IG-style grid of your logged shows
- **Recap card** — shareable PNG → IG Stories (the viral artifact)
- **Taste twins** — % match vs fake users, with the shared artists shown as receipts

### Should have
- Artist page (profile + list of shows)
- Venue page (profile + list of shows)
- Discover (upcoming SF shows)

### Explicitly cut
Auth (handle in localStorage only), comments, follows, notifications, video auto-editing,
real recommendation engine, multi-city, onboarding.

---

## Timeline

| Time | Phase | Deliverable |
|---|---|---|
| **0:00–0:25** | Setup + data | Convex wired, schema pushed, JamBase seed data committed, 20 fake users |
| **0:25–1:15** | **Phase 1 — walking skeleton** | Festival → show → log (rating + vibes) → diary grid. **Demoable.** |
| **1:15–1:50** | Phase 2 — memories | Convex file storage, photos on show page + diary tiles |
| **1:50–2:30** | Phase 3 — viral artifact | Recap card → PNG → Web Share |
| **2:30–3:00** | Phase 4 — taste twins | Jaccard match + shared-artist receipts |
| **3:00–3:20** | Stretch | Artist + venue pages |
| **3:20–3:30** | Demo prep | Seed own account, rehearse, QR code |

**Hard rule:** something demoable exists at **1:15**. Everything after is additive. Never be in a
state where the demo is broken.

### Cut order if behind
1. Venue page → 2. Artist page → 3. Discover tab → 4. Video (photos only) → 5. Taste twins
   (keep the recap card; it's the viral hook)

---

## Phase detail

### Phase 0 (0:00–0:25) — setup + data
- `npm i convex` → `npx convex dev` (creates deployment, `convex/` wired)
- Add `ConvexProvider` in `app/providers.tsx`
- Paste `convex/schema.ts` (already written, see repo)
- Commit `convex/seedData.ts` from JamBase (lineup + artists)
- `npx convex run seed:run` → populates artists, shows, 20 fake users + their logs

### Phase 1 (0:25–1:15) — walking skeleton
Routes: `/` (festival), `/show/[id]`, `/diary`
- `convex/shows.ts`: `listByFestival`, `get`
- `convex/logs.ts`: `create`, `listByUser`, `listByShow`
- Log sheet: 5 half-star tap + vibe chips. **No media yet.**
- Diary grid: 3-col, poster images, rating badge

### Phase 2 (1:15–1:50) — memories
- `convex/media.ts`: `generateUploadUrl` mutation, `attach` mutation, `listByLog` query
- Client: `<input type="file" accept="image/*,video/*" multiple capture>`
- 3-step upload: get URL → POST file → save `storageId`
- Render with `ctx.storage.getUrl(storageId)`

### Phase 3 (1:50–2:30) — recap card
- `npm i html-to-image`
- A styled 9:16 `<div>`: festival name, your sets, ratings, top artist, photo collage, handle
- `toPng(node)` → `navigator.share({ files: [file] })`, fallback download

### Phase 4 (2:30–3:00) — taste twins
- `convex/taste.ts`: `similar(userId)` — load all logs, build artist sets, Jaccard, return top 5
  with shared artist names
- UI: list of matches with % and the overlapping artists as chips

---

## Success criteria

- Judge can log a show and share a card **on their own phone** in under 60 seconds
- Nothing on stage depends on a live API call
- Both sponsor integrations are visible and credited
