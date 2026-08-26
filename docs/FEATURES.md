# Showtonic — Feature Spec

Polished from the founder's feature brain-dump, 2026-08-15. Enhancements folded in and every
feature phased so nothing ships empty.

**Phases**
- **MVP** — single-player + shareable artifacts. No social graph required to get full value.
- **v1.5** — social turns on once there are real users (friends, feeds, leaderboards).
- **v2** — monetization, live mode, platform.

**Two global rules**
1. **Never ship an empty room.** Any surface that depends on other people (friends going, review
   feeds, leaderboards, galleries) stays hidden until it has real content. Catalog + your own data
   always render fully.
2. **Low-N rule.** Under 5 logged shows, never show averages, histograms, or streaks — show
   potential instead ("12 shows found in your camera roll", "follow 5 artists to unlock your radar").

---

## 1. Onboarding — progressive, not a wall

Goal: from install to a living diary in under 2 minutes, asking for nothing before it pays off.

| Step | Ask | When |
|---|---|---|
| 1 | **Username** (handle) | Immediately — it's identity, keep it fun |
| 2 | **Taste seed** — pick artists you love (Spotify/Apple import offered here) + favorite venues | Immediately — 30-second tap grid, powers everything downstream |
| 3 | **Location** | When Discover first opens ("shows near you") |
| 4 | **Photo access** | Only when backfill offers: "We can find the shows you've already been to" |
| 5 | **Email / phone** | Deferred to the first share or device change ("claim your handle") |
| 6 | **Contacts** | v1.5, when friends exist to find |

**Exit:** user lands on the Diary with backfilled shows already in it — never an empty screen.

## 2. Backfill — "how did it already know?"

The signature trick: reconstruct your show history with near-zero typing.

- **Photo match (MVP):** on-device scan → date + GPS + night-burst clusters + screenshot OCR →
  "Were you at Charli XCX on Aug 8?" → yes routes into the log flow with media pre-attached.
- **Bulk reclaim (MVP):** swipeable stack of found nights; one tap to confirm + rate each.
- **Morning-after prompt (MVP):** show ends → next morning: "Overmono last night?" One tap to log.
- **Artist/venue page reclaim (MVP):** every past show on an entity page has "I was there."
- **Calendar (v1.5):** EventKit — shows you put in your calendar.
- **Email tickets (v1.5):** forward-to-log address (`tickets@…`) — parse forwarded confirmations.
  No inbox OAuth (privacy + Google security-review cost).
- Privacy: photos never leave the device; only matched-show metadata syncs.

## 3. Diary — the home screen, and the thing you're proud of

Photo-first wall of your nights. Your media is the interface; attended = vivid, suggested = faded
ghost tiles that invite logging.

- **Lenses (MVP):** Wall (photos) · Calendar · Artist · Venue · City · Genre · Rating. One grid,
  seven sorts — not seven screens.
- **Stats header (MVP):** shows · hours on floor · artists · venues · avg rating (post low-N).
- **Receipts (MVP):** saw-them-early count, venue loyalty, deep-cuts vs headliners, streaks.
- **Moments (MVP):** per-show collage of your photos/videos; aggregates by month, artist, city.
- **Favorites (MVP):** pin your 4 all-time shows at the top (Letterboxd's best mechanic).
- **Watchlist (MVP):** shows/artists/venues you're saving; upcoming ones surface in Discover.
- **Milestones (v1.5):** 50th show, 10th night at a venue, first show in a new city → each mints a
  shareable card automatically.

## 4. Discover — time-aware and always explained

Every recommendation carries a **reason string** ("because you rated RÜFÜS DU SOL 9.4", "3 friends
going"). No black-box recs.

- **MVP:** Tonight · This weekend · Artists you follow/have seen · Venues you've been · Nearby ·
  Search (shows, artists, venues).
- **Lineup radar (v1.5):** an artist from your diary announces a show → push before it sells out.
- **Deep-cut mode (v1.5):** hide arena headliners; surface the 200-cap rooms.
- **Friends layer (v1.5):** friends going · recs from friends · friend review/rating feed.

## 5. Show page — the deepest surface

One page, two states.

**Future show:** hero (flyer/artist) · date/venue/lineup · **Interested / Going** · ticket link ·
who's going (v1.5: friends first, then second-degree, one-sentence comments) · artist preview +
top tracks · venue info · similar-show recs (same artist style / energy / venue vibe) · host/label ·
lists containing this show.

**Past show:** everything above, plus:
- **Log it:** half-star rating (show, plus optional artist & venue ratings) · **vibe tags**
  (tap-not-type: *transcendent · sound was insane · sweaty · too packed · surprise guest*) ·
  optional one-line review · who you went with (v1.5, from contacts).
- **The poster (MVP):** 1 photo + caption + 1 song — an IG-post-format canonical memory, the tile
  that represents this night everywhere. User picks it deliberately (no random cloud upload; chosen
  poster + thumbnails sync, originals stay on device).
- **Your moments (MVP):** your full media for the night, local-first.
- **Gallery (v1.5):** everyone's photos by category — artist · crowd · venue · your crew — with
  likes; most-liked leads. (Yelp's photo IA, applied to nightlife.)
- **Reviews (v1.5):** verified attendees only. AI summary appears only above a volume threshold
  (≥10 reviews) — never summarize three reviews with a robot.
- **Ratings:** public average vs **friends average** side by side (v1.5).
- **Setlist** when available.

## 6. Artist page

- Profile: image, bio, hometown, genres, socials (@ig), **top-track previews** (Spotify API).
- **Follow** (+ follower count once non-embarrassing).
- **Show history with yours highlighted** — your attended shows vivid, the rest faded; includes
  "I was there" reclaim on every past show.
- **Receipts (v1.5):** "You've caught 4 of their 11 SF shows" · "You saw them before 500k monthly
  listeners" (requires popularity snapshot at log time).
- Rating + verified-attendee reviews (v1.5) · photos from their shows (v1.5) · similar artists.

## 7. Venue page

- Profile: photos, website, map, city, capacity/vibe tags.
- **Follow** + save to watchlist.
- Upcoming + past shows (yours vivid, reclaimable).
- **Your history here:** "6 nights at this venue" — loyalty made visible.
- Rating + verified-attendee reviews (v1.5) · show-photo gallery (v1.5).

## 8. People & social (v1.5 — flag-off until density)

- Friends via contacts import; follow people.
- Friend vs public ratings everywhere ratings appear.
- Friend activity feed (logged, rated, reviewed).
- **Taste twins:** "most similar to you in your city," with receipts — the shared artists/shows
  shown, not just a percentage. (Premium unlock candidate, v2.)
- **Leaderboards:** top show-goer per city / artist / venue · most active this week/month.
  Opt-in, and only rendered where a board has ≥10 real entrants. Artist-level "top fan" badges.

## 9. Profile & shareable artifacts — the growth engine

The reason strangers hear about the app. All artifacts carry handle + stub code; one visual grammar.

- **Public profile (MVP):** IG-style grid, 1 poster per show; year switcher (2026 / 2025 / all-time);
  stats header; favorites row; badges (early-fan, streaks) as they're earned.
- **Per-show stub card (MVP):** ticket-stub share card minted at log time.
- **Festival / Season Recap (MVP):** your sets, ratings, top artist, photo collage → 9:16 story.
- **Year Wrapped (v1.5):** the December moment — shows, hours, top artists/venues, genre split, map.
- **Taste passport (v1.5):** your taste identity as a poster.
- **Night Recap video (v2):** auto-cut 9:16 reel from your clips, stamped. The headline artifact.

## 10. Future — live mode (v2+)

- **At-show mode:** detect you're at a festival/show → live moment sharing with others there;
  a real-time crowd gallery per stage; friends-at-the-festival map.
- Group planning (go together), ticketing affiliate, promoted placements — after the diary wins.

---

## Design screen map

The visual ground truth lives in `../showtonic-design-exports/` (24 numbered screens):

| Screens | Covers (section above) |
|---|---|
| `01–06` | §1 Onboarding — welcome, returning sign-in, identity, taste seed, location/home base |
| `07–11` | §2 Backfill — offer, on-device scan, confirm match, quick rating, complete |
| `12`, `19`, `20` | §3 Diary — first populated diary, favorites + lenses, lens detail (by venue) |
| `13`, `14` | §4 Discover — shelves with reason strings, search + filters |
| `15`, `16`, `17`, `18` | §5 Show page — future state, past state, historical reclaim, log flow |
| `21`, `22` | §8 People & social (v1.5) — activity feed, taste match |
| `23`, `24` | §6 Artist page · §7 Venue page — with history receipts |

Implementation phasing against the current codebase is in `BUILD_PLAN.md`; payload shapes in
`FRONTEND_BACKEND_CONTRACT.md`; architecture and data model in `SPEC.md`.

---

## What changed from the draft list (summary)

1. **Phased everything** — social-graph features moved behind v1.5 flags so nothing ships empty.
2. **Onboarding made progressive** — each permission asked at its payoff moment, email deferred.
3. **Artifacts promoted to a first-class section** — recap/stub/Wrapped/passport are the growth
   engine, not a profile footnote.
4. **Added:** morning-after prompt, bulk reclaim, vibe tags, reason strings, receipts (saw-early,
   loyalty, % caught), milestones, low-N rule, deep-cut mode, lineup radar, AI-summary volume gate.
5. **Sharpened:** poster upload is deliberate (user picks; thumbnails sync, originals stay local);
   email backfill via forwarding, not inbox OAuth; leaderboards opt-in + density-gated.
