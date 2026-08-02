# Showtonic Hack — Technical Spec

Stack: **Next.js 16 (App Router) + React 19 + Tailwind 4 + Convex + Vercel**
Data: **JamBase** (baked into seed, not called live at demo time)

---

## Architecture

```
Browser (Next.js, React 19)
   │  useQuery / useMutation  (reactive — updates push automatically)
   ▼
Convex
   ├── queries    shows.listByFestival · shows.get · logs.listByShow · taste.similar
   ├── mutations  logs.create · media.generateUploadUrl · media.attach · seed.run
   ├── actions    jambase.fetchUpcoming   ← ONLY place fetch() is allowed
   └── storage    photos + videos (_storage)
```

### Convex rules that will bite you
1. **`fetch` works only in actions**, never in queries or mutations. All JamBase live calls go in
   `convex/jambase.ts` as an action. Seed data is baked, so the demo path makes zero external calls.
2. **No joins — denormalize.** Store `artistNames`, `showTitle`, `imageUrl` directly on the log.
   This is what makes taste-matching a single in-memory pass.
3. **File upload is 3 steps:** `generateUploadUrl` mutation → client `POST` the file to that URL →
   save the returned `storageId` on a `media` row. Read back with `ctx.storage.getUrl()`.
4. Queries are reactive by default. No polling, no refetch. Two phones stay in sync for free.

---

## Data model

See `convex/schema.ts` (already in the repo). Tables:

| Table | Purpose | Key fields |
|---|---|---|
| `artists` | JamBase artist profiles | name, image, genres, hometown, bio, topTrack |
| `shows` | Festival sets + concerts | title, date, venueName, festivalId, stage, artistNames[] |
| `users` | You + 20 fake users | handle, avatarColor, isFake |
| `logs` | The core: a show you attended | userId, showId, rating, vibes[], **artistNames[]** (denormalized) |
| `media` | Photos/videos per log | logId, storageId, kind, caption |

**No auth.** A handle is created on first visit and stored in `localStorage`; the `users` row id
travels with every mutation.

---

## Screens

| Route | Contents |
|---|---|
| `/` | Outside Lands hero + lineup grouped by day. Tap a set → show page |
| `/show/[id]` | Hero image, artist info (genres · hometown · bio · top track preview), **Log this set** CTA, your memories (media grid), who else logged it + their ratings |
| `/diary` | Stat header (sets · artists · avg rating) + IG-style 3-col grid of your logged shows, photo-first |
| `/recap` | The shareable 9:16 card + Share button |
| `/twins` | Taste matches: % + shared artists as chips |
| `/artist/[id]` *(stretch)* | Profile + shows list |
| `/venue/[id]` *(stretch)* | Profile + shows list |

### Log flow (the interaction that must feel fast)
Sheet on the show page: **rating first** (5 half-star tap targets), vibe chips, optional note,
photo/video picker, then the primary CTA at the bottom. Target: under 15 seconds.

Vibe vocabulary (fixed list, tap-only, no typing):
`transcendent · sound was insane · sweaty · too packed · sunset set · surprise guest · all-nighter`

---

## Taste-twin algorithm

Deliberately simple. The production design (ALS matrix factorization, nightly batch) is in
`music-recs-plan.md` and is **wrong for a hackathon** — it needs thousands of users and a pipeline.
Jaccard demos better anyway because you can show the receipts.

```ts
// convex/taste.ts
similarity(A, B) = |artistsA ∩ artistsB| / |artistsA ∪ artistsB|
                 + 0.15 * (count of identical shows attended)   // same night = strong signal
```

Runs in one pass over all logs (~20 users). Returns top 5 with the overlapping artist names so the
UI can show *why*: "You + Maya — 68% · both saw Charli XCX, RÜFÜS DU SOL, The Strokes."

---

## Design

Dark, editorial, photo-forward. Reuse the Showtonic language:
- Canvas near-black `#0A0908`, surface `#141210`, text bone `#F5F1E8`, muted `#8A8177`
- **One action accent** (stamp orange `#FF3B0E`) for every primary button
- **Rating green** (`#B8F14A`) for ratings and stats only, never a button fill
- Display serif for artist names and big numbers; monospace for dates, venues, stub codes
- User photos supply all other color; chrome stays quiet
- Recap card: ticket-stub grammar — perforation divider, stub code, handle always present

---

## JamBase attribution

Sponsor requirement and good practice: link back to the JamBase event/artist page wherever their
data is displayed. Event URLs come back in the MCP payload as `ctas[].url`.
