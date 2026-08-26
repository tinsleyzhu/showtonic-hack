# Showtonic — Technical Spec (v2)

**Updated:** 2026-08-15 for the `FEATURES.md` scope and the `showtonic-design-exports/` visuals.
Stack: **Next.js 16 (App Router) + React 19 + Tailwind 4 + Convex + Vercel**
Data: **JamBase** via `convex/jambase.ts` sync action (catalog baked into Convex; no live calls
on the render path).

---

## Architecture

```
Browser (Next.js, React 19 — single page, View state machine + bottom tab bar)
   │  useQuery / useMutation  (reactive — updates push automatically)
   ▼
Convex
   ├── queries    discovery.home/search · shows.detail · diary.forUser/profile ·
   │              artists.get · venues.get · taste.similar · leaderboard.list ·
   │              activity.feed (v1.5) · backfill.candidates
   ├── mutations  users.getOrCreate/login/checkHandle · logs.create · attendance.set ·
   │              follows.toggle* · favorites.set · watchlist.toggle ·
   │              backfill.saveCandidates/resolveCandidate · media.generateUploadUrl/attach
   ├── actions    jambase.syncCatalog          ← ONLY place fetch() is allowed
   └── storage    memory posters only (1 chosen photo per log; moments stay local)
```

### Convex rules that will bite you
1. **`fetch` only in actions.** All JamBase calls live in `convex/jambase.ts`. The demo path
   makes zero external calls.
2. **No joins — denormalize.** `artistNames`, `showTitle`, `venueName`, `city`, `genres`,
   `posterUrl` live on the log. Diary lenses, receipts, and taste matching are single passes.
3. **File upload is 3 steps:** `generateUploadUrl` → client `POST` → save `storageId`.
4. **Queries are reactive.** Two phones stay in sync for free.

### Client-side (no backend) by design
- **Backfill scan:** photo selection + EXIF date extraction + night clustering run in the
  browser. Only candidate *metadata* (date, cluster size, matched showId, confidence) is sent
  to Convex. Original photos never upload — mirrors the privacy promise on screen `[07]`.
- **Moments:** media picked in the log flow renders from object URLs; only the one chosen
  **memory poster** uploads.
- **Identity:** handle in `localStorage`; `users` row travels with every mutation. Screens
  `[01]`/`[02]`/`[11]` show Apple/password/claim affordances as inert stubs (v1.5).

---

## Data model (`convex/schema.ts`)

Existing tables (unchanged shape): `artists`, `venues`, `shows`, `logs`, `attendance`,
`artistFollows`, `venueFollows`, `media`.

| Change | Table | Fields |
|---|---|---|
| extend | `users` | + `homeCity?`, `visibility` (`public`/`private`), `claimed: boolean`, `tasteArtistIds?` |
| extend | `logs` | + `posterStorageId?`, `source` (`live`/`backfill`/`reclaim`/`morning_after`) |
| new | `favorites` | userId, showId, logId, rank (1–4) · index by_user |
| new | `watchlist` | userId, targetType (`show`/`artist`/`venue`), targetId, createdAt · index by_user, by_target |
| new | `backfillCandidates` | userId, showId?, clusterDate, photoCount, captureWindow, confidence, status (`pending`/`accepted`/`rejected`/`reassigned`) · index by_user_status |
| new (v1.5) | `reviewLikes` | userId, logId · index by_log, by_user_log |
| new (v1.5) | `activityEvents` | userId, kind (`logged`/`going`/`moments`), showId, logId?, createdAt · index by_created — or derive feed from logs+attendance and skip this table |

**Vibe vocabulary** (fixed, tap-only — screen `[18]`):
`Transcendent · Danced nonstop · Great sound · Too packed · Surprise guest`

---

## Screens

Single-page `View` state machine; bottom tab bar **Discover · Diary · Log · Activity · Profile**
(Activity hidden until the v1.5 flag + content exist). `[NN]` = file in
`showtonic-design-exports/`.

| Surface | Design | Contents |
|---|---|---|
| Onboarding wizard | `[01]–[07]` | 5 steps: welcome → identity (handle availability + visibility) → taste seed (≥5 artists) → home base (geo or city search, skippable) → backfill offer. Returning sign-in `[02]` restores diary, skips the rest |
| Backfill scan/confirm | `[08]–[11]`, `[17]` | Scan progress → candidate cards (evidence + %, Yes / No / right-night-wrong-show) → quick rating → "N shows reclaimed" summary → diary |
| Discover | `[13]` | Home-base pill, search, Shows/Artists/Venues tabs, Upcoming/Past toggle, shelves with **reason strings**, tab bar |
| Search & filters | `[14]` | Date presets, genre/venue/distance/price/followed chips, result rows with reason strings |
| Show — future | `[15]` | Hero, Interested/Going/Tickets, top-track previews, venue signal, similar shows; friends section v1.5 |
| Show — past | `[16]` | Aggregate rating, Log CTA, Your memory (rating/review/poster/moments), reclaim if unlogged; friends' reviews v1.5 |
| Log sheet | `[18]` | Rate (half-stars) → vibes → one-line review → your moments (local) → memory poster (1 photo + caption + song → diary tile) → save. Target < 15 s |
| Diary | `[12]`, `[19]` | Profile header, stats (low-N gated), favorites row (pin 4), lens chips over one grid |
| Lens detail | `[20]` | e.g. By Venue: most-visited ranked list + recent history |
| Artist | `[23]` | Bio + genres/hometown, follow + IG, top songs, upcoming/past (yours vivid, rest reclaimable), "Your artist history" receipt |
| Venue | `[24]` | Capacity + vibe tags, follow/watchlist/website, "Your history here" receipt, upcoming with reasons, verified reviews |
| Activity (v1.5) | `[21]` | Friends/Following/You; logged/going/moments events; likes + save-show |
| Taste match (v1.5) | `[22]` | Overlap % + receipts chips, "You were both there", their 5★ recs, follow |
| Recap/stub artifacts | — | 9:16 recap + per-show stub card (html-to-image → Web Share); handle + stub code always present |

### Global rendering rules
1. **Never ship an empty room** — any people-dependent section (friends going, reviews, feeds,
   leaderboards) renders nothing until it has real content. Catalog + own data always render.
2. **Low-N rule** — under 5 logs: no averages/histograms/streaks; show potential copy instead.
3. **Reason strings everywhere** — no unexplained recommendation. Reasons are computed with the
   shelf server-side (`because you rated…`, `from your watchlist`, `trending near you`).

---

## Backfill matching (client-side)

```
photos → EXIF datetime → group into "nights" (same calendar night, ≥3 photos,
evening capture window) → for each night, query catalog shows on that date in the
user's cities → score = date match + capture-window overlap (+0.2 if artist in
taste seed, +0.2 if venue previously visited) → candidates ≥0.5 saved with
confidence; user confirms every one (nothing auto-enters the diary).
```

Web caveat: no GPS in most browser EXIF paths — venue proximity (shown on `[09]`) is displayed
only when coordinates exist; date/time evidence is the baseline.

## Taste-twin algorithm (unchanged)

```ts
similarity(A, B) = |artistsA ∩ artistsB| / |artistsA ∪ artistsB|
                 + 0.15 * (identical shows attended)   // same night = strong signal
```
Single pass over logs; returns top matches with shared artists/shows as receipts (`[22]`).
Deliberately not ALS/matrix factorization — receipts demo better and need no pipeline.

## Design language

Per the exports (Cinematic Nocturne × Archival, mobile-first):
- Canvas near-black `#0A0908`, surface `#141210`, text bone `#F5F1E8`, muted `#8A8177`
- **One action accent** — stamp orange (`#FF7A50` range in exports) for every primary CTA
- **Rating green** `#B8F14A`/mint for ratings, stats, and success copy — never a button fill
- Display serif for headlines, artist names, big numbers; letterspaced uppercase for
  eyebrows/nav labels; monospace for dates, stub codes
- User photos supply the color; chrome stays quiet. Stub cards keep the ticket grammar
  (perforation, stub code, handle)

## JamBase attribution

Sponsor requirement and good practice: link to the JamBase event/artist page wherever their
data appears (`jambaseUrl` is stored on artists/venues/shows).
