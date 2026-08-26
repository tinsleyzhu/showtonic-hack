# Showtonic — Build Plan (v2, post-hackathon)

> **Status 2026-08-17: Phases 0–6 implemented and verified.** 80 unit tests, lint-clean,
> production build green, every phase browser-tested E2E. Remaining stubs are the deliberate
> v1.5+/v2 exclusions listed at the bottom (real auth, streaming import, contacts, galleries,
> AI summaries, Wrapped, live mode).

**Updated:** 2026-08-15 · supersedes the 3.5-hour Outside Lands hackathon plan (kept in git history).
**Source of truth for scope:** `FEATURES.md` (MVP / v1.5 / v2 phasing).
**Source of truth for visuals:** `../showtonic-design-exports/` (24 numbered screens, referenced
below as `[NN]`).
**Stack (unchanged):** Next.js 16 + React 19 + Tailwind 4 + Convex + JamBase catalog sync.

---

## Where the codebase is today

The hackathon build already covers a real slice of the MVP:

| Area | Built | Notes |
|---|---|---|
| Catalog | ✅ | JamBase sync action (SF, 365-day history), shows/artists/venues tables |
| Onboarding | ⚠️ partial | 4-step flow (welcome → handle → taste → handoff) in `OnboardingFlow.tsx`; no location step, no backfill step, wrong visual language vs `[01]–[07]` |
| Returning sign-in | ⚠️ partial | Handle-only login (`users.login`); designs `[02]` show email/password + Apple — out of scope for web demo, keep handle login styled per `[02]` |
| Discover | ⚠️ partial | `discovery.home` + search; no reason strings, no tabs/filters per `[13]`/`[14]` |
| Show page | ⚠️ partial | Single detail view; needs the two-state future/past split of `[15]`/`[16]` |
| Log flow | ⚠️ partial | Rating + vibes + review + caption + song + 1 photo; needs "moments vs poster" split of `[18]` |
| Diary/Profile | ⚠️ partial | Grid + lenses (Artist/City/Genre/Calendar/Rating/Venue/Photo) + stats; no favorites row, no low-N gating per `[12]`/`[19]`/`[20]` |
| Backfill | ❌ | Nothing. This is the signature feature — `[07]–[11]`, `[17]` |
| Activity feed | ❌ | `[21]` — v1.5 flag |
| Taste match | ⚠️ partial | Jaccard `taste.similar` exists; no detail page per `[22]` |
| Artist/Venue pages | ⚠️ partial | Exist with follows; missing "your history" receipts per `[23]`/`[24]` |
| Attendance | ✅ | interested/going/logged |
| Navigation | ⚠️ | State-machine views in one 1,135-line `page.tsx`; no bottom tab bar (`[13]`) |

**Two global rules** (from FEATURES.md) apply to every phase below:
1. **Never ship an empty room** — people-dependent surfaces stay hidden until they have content.
2. **Low-N rule** — under 5 logged shows, show potential ("12 shows found…") instead of averages/streaks.

---

## Phase 0 — Restructure (foundation, no new features)

Goal: make the app shaped like the designs before adding to it.

- **Bottom tab bar:** Discover · Diary · Log · Activity · Profile (`[13]` et al.). Activity tab
  hidden behind the v1.5 flag (empty-room rule) until the feed exists.
- Split `page.tsx` into per-view components (`DiscoverView`, `ShowView`, `DiaryView`, `LogSheet`,
  `ArtistView`, `VenueView`, `ActivityView`, `TasteMatchView`). Keep the single-page `View`
  state machine — no router change needed.
- Adopt the design-export visual language app-wide: near-black canvas, serif display headlines,
  orange primary CTA, green for ratings/stats only, uppercase tracking for eyebrows/nav.
- Schema additions (one push): `favorites`, `watchlist`, `backfillCandidates`, `reviewLikes`,
  users gain `homeCity`, `visibility`, `claimed`. See SPEC.md data model.

**Exit:** app looks and navigates like the exports; all existing features still work.

## Phase 1 — Onboarding v2 (screens `[01]–[06]`)

Rebuild `OnboardingFlow.tsx` as the 5-step wizard:

1. **Welcome `[01]`** — stacked show-card art, "Build my music diary" primary, "Sign in" link.
2. **Sign-in `[02]`** (returning) — handle lookup restores the diary and skips steps 2–5.
3. **Identity `[03]`** — handle with live availability check (`users.checkHandle` query),
   visibility toggle (public default). No email — "claim" is deferred to `[11]`.
4. **Taste seed `[04]`** — tap grid of catalog artists, ≥5 required, running "N selected ·
   enough to personalize" meter. (Spotify/Apple import button = disabled stub on web.)
5. **Home base `[05]`/`[06]`** — geolocation with payoff preview ("18 shows this weekend,
   including 3 artists you selected") or manual city search with upcoming-show counts; skippable.

**Exit:** step 5 hands off to the Backfill offer (Phase 2), never to an empty diary.

## Phase 2 — Backfill (screens `[07]–[11]`, `[17]`) — the signature feature

On web there is no camera-roll access, so the scan is **simulated but honest**: user picks photos
via `<input type="file" multiple>` (or a "demo camera roll" button seeds a curated set); EXIF
date/time is read client-side and matched against the historical JamBase catalog already in Convex.

- **Offer `[07]`** — privacy trio (on-device, originals never uploaded, nothing added without
  confirmation). Choose photos / pick years / "I'll add shows manually" escape hatch.
- **Scan `[08]`** — progress UI: photos checked, night clusters, matched, need-your-help.
  Cluster = same night, ≥3 photos in an evening window; match = cluster date × catalog show
  (+ taste-seed artist boost). Persist as `backfillCandidates`.
- **Confirm stack `[09]`** — one card per candidate ("1 of 11"), evidence panel (photo count,
  capture window, match %), **Yes / No / Right night, wrong show** (opens show search).
- **Quick rating `[10]`** — immediately after each Yes: stars + "save and next". No long forms
  in the loop; "Add a review or poster" is the optional branch.
- **Complete `[11]`** — "N shows reclaimed" summary → **Open my diary**. "Claim and sync"
  rendered as a stub.
- **Entity reclaim `[17]` + morning-after:** every past show on artist/venue/show pages gets
  "I was there"; on app open, if an attended-status show ended yesterday, show the one-tap
  morning-after prompt.

**Exit:** a new user reaches a populated diary `[12]` in under 2 minutes without typing a show name.

## Phase 3 — Diary & log upgrades (screens `[12]`, `[18]`, `[19]`, `[20]`)

- **Favorites row `[19]`** — pin exactly 4 all-time shows above the grid; edit mode.
- **Lens chips** — Wall · Calendar · Artist · Venue · City · Genre · Rating as one grid with
  seven sorts; lens detail views ranked like `[20]` ("Most visited", "Recent venue history").
- **Stats header + low-N gate `[12]`** — shows/artists/venues/avg; under 5 logs show potential
  copy instead. "Next: make it yours" nudge card after backfill.
- **Log sheet v2 `[18]`** — sections in order: rate → vibe chips (*Transcendent · Danced
  nonstop · Great sound · Too packed · Surprise guest*) → one-line review → **Your moments**
  (local previews, not uploaded) → **Memory poster** (pick 1 photo + caption + song; only the
  poster uploads to Convex storage and becomes the diary tile).
- **Watchlist** — save shows/artists/venues; surfaces in Discover.

## Phase 4 — Discover & show pages (screens `[13]–[16]`)

- **Discover `[13]`** — Shows/Artists/Venues tabs, Upcoming/Past toggle, home-base pill,
  shelves (Popular this week · Because you follow… · Venues you've been · Nearby · This
  weekend). **Every card carries a reason string** — computed server-side with the shelf.
- **Search & filters `[14]`** — date presets (Tonight / This weekend / Custom), chips for
  genre, venue, distance, price, followed-only. (Friends-going chip = v1.5 flag.)
- **Future show `[15]`** — hero, Interested/Going/Tickets row, top-track previews, venue
  signal card (rating + one-liner), similar shows. Friends section flag-off.
- **Past show `[16]`** — aggregate rating in hero, Log CTA, **Your memory** (your rating,
  review, poster + moments), reclaim path for un-logged past shows (`[17]`).

## Phase 5 — Receipts & entity pages (screens `[23]`, `[24]`)

- **Artist `[23]`** — genre · hometown eyebrow, bio, Follow + Instagram, top-song previews,
  Upcoming/Past with your attended shows vivid + "I was there" on the rest, **"Your artist
  history"** receipt ("You first saw X in 2022. Your average rating is 4.8").
- **Venue `[24]`** — capacity + vibe tags, Follow/Watchlist/Website, **"Your history here"**
  ("Your second most-visited venue. Last seen: …"), upcoming with reason strings, verified
  venue reviews (from show logs at that venue).
- **Shareable artifacts** (kept from hackathon, restyled): per-show stub card at log time +
  season recap 9:16; both carry handle + stub code.

## Phase 6 — v1.5 social (flag-on when there are real users; screens `[21]`, `[22]`)

- **Activity feed `[21]`** — Friends/Following/You tabs; logged/going/added-moments events;
  review likes + save-show quick action. Unhide the Activity tab.
- **Taste match detail `[22]`** — overlap % with receipts chips, "You were both there",
  "What X recommends" (their 5★ logs you haven't seen), Follow.
- Friend ratings next to public averages; leaderboards stay density-gated (≥10 entrants).

### Explicitly not in this plan (v1.5+/v2 per FEATURES.md)
Real auth (email/password/Apple), Spotify/Apple import, contacts, calendar/EventKit + email-ticket
backfill, photo galleries with likes, AI review summaries, milestones, Wrapped/passport, live mode.
Where a design shows one (`[01]` Apple button, `[02]` password, `[11]` claim), render an inert,
honest stub — the visual grammar ships now, the capability later.

---

## Order of operations & cut order

Phases 0→3 are the spine (identity → history → diary pride) and must land in order.
Phases 4 and 5 are parallelizable. Phase 6 only when density exists.

If time pressure returns, cut from the bottom of each phase, never the spine:
1. Taste match detail → 2. Activity feed → 3. Search filter chips → 4. Lens detail views →
5. Morning-after prompt. **Never cut:** backfill confirm loop, poster-based diary, reason strings.

## Success criteria

- New user: install → populated diary (≥3 confirmed shows) in **< 2 min**, typing only a handle.
- Every recommendation on screen has a visible reason string.
- No surface ever renders empty or with embarrassing low-N stats.
- A logged show produces a share-ready stub card in **< 15 s** from the past-show page.
