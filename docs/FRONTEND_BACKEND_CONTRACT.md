# Frontend / Backend Contract

**Updated:** 2026-08-15 to match `FEATURES.md` and the design exports. These are the payload
shapes the Convex layer exposes so the UI never does client joins. Fields marked **(v1.5)** ship
behind the social flag and may be absent — the UI must render without them (empty-room rule).

## Onboarding

- `users.checkHandle(handle)` → `{ available: boolean, suggestion?: string }` — live check on
  the identity step.
- `users.getOrCreate({ handle, visibility, homeCity?, tasteArtistIds? })` → user doc.
- `users.login({ handle })` → existing user or null; success restores the diary and skips the
  wizard.
- Taste seed grid needs a lightweight artist list: `id`, `name`, `image`, `genres` — from the
  seeded catalog, ordered popular-first.
- Home base step needs city suggestions with `upcomingShowCount` per city.

## Backfill

- `backfill.saveCandidates(userId, candidates[])` — client-computed:
  `{ clusterDate, photoCount, captureWindow, matchedShowId?, confidence }`.
- `backfill.candidates(userId)` → pending candidates joined with denormalized show summary
  (title, artistNames, venueName, city, date, image) for the confirm cards.
- `backfill.resolveCandidate({ candidateId, action })` — `accept` (creates a log with
  `source: "backfill"`, returns `logId` for the quick-rating step), `reject`, or
  `reassign(showId)` for "right night, wrong show".
- Show/artist/venue pages expose "I was there" via the same log mutation with
  `source: "reclaim"`; the morning-after prompt uses `source: "morning_after"`.

## Discover

Named shelves of show summaries, each shelf carrying its **reason string** server-side:

- `popular_this_week` · `because_you_follow` · `venues_youve_been` · `nearby` ·
  `this_weekend` · `from_your_watchlist` · **(v1.5)** `friends_going`

Show summary: `id`, `artistName`, `image`, `date`, `venueName`, `city`, `reason`,
`rating`, `ratingCount`, `attendanceStatus`, **(v1.5)** `friendGoingCount`.

Search accepts `query` plus filters: `datePreset` (`tonight`/`weekend`/`custom range`),
`genre`, `venueId`, `maxDistance`, `maxPrice`, `followedOnly`, and scope tab
(`shows`/`artists`/`venues`) with an upcoming/past toggle. Results carry reason strings.

## Show Detail

One payload, two render states (future/past):

- Date, time, stage, ticket URL, JamBase URL; aggregate rating + verified count.
- Current user: `attendanceStatus` (`interested`/`going`/`logged` or empty), and their log if
  logged (rating, vibes, review, poster URL).
- Artist summary + preview tracks; venue summary + "venue signal" (rating + one-line note);
  similar upcoming shows with reasons; optional setlist.
- **(v1.5)** friends going with one-sentence comments; friends' reviews with like counts;
  media gallery grouped `artist`/`crowd`/`venue`/`crew` ordered by likes; AI summary only at
  ≥10 reviews.

## Log Mutation

`logs.create` accepts `showId`, `rating`, `vibes[]`, `review?`, `caption?`, `songId?`,
`source` (`live`/`backfill`/`reclaim`/`morning_after`), **(v1.5)** `friendIds?`.

Poster is deliberate: at most **one** photo uploads (`media.generateUploadUrl` → POST →
`media.attach` with the returned `storageId`); it becomes `posterStorageId` on the log and the
diary tile. All other moments stay local to the device. Review permissions for show/artist/venue
derive from having a verified log.

## Diary & Profile

`diary.forUser` returns logs with denormalized `artistNames`, `venueName`, `city`, `genres`,
`date`, `rating`, `posterUrl` so all seven lenses (Wall/Calendar/Artist/Venue/City/Genre/Rating)
sort client-side without joins.

`diary.profile` returns: counts (shows/artists/venues), average rating, favorites (≤4 show
refs with posters, ranked), receipts (most-visited venues with year ranges, saw-them-early,
streaks), and `lowN: boolean` — when true the UI suppresses averages/streaks and shows
potential copy instead.

`favorites.set(userId, showIds[])` — max 4, ordered.
`watchlist.toggle(userId, targetType, targetId)`; watchlisted upcoming items feed the
`from_your_watchlist` shelf.

## Artist & Venue

Artist: profile (image, bio, hometown, genres, socials), follow state (+ count once
non-embarrassing), preview tracks, upcoming + past shows with `attended: boolean` per show
(vivid vs reclaimable), and a **history receipt**: `{ showCount, firstSeenYear, avgRating }`.
**(v1.5)** verified reviews, show photos, similar artists.

Venue: profile (image, website, map, city, capacity, vibe tags), follow + watchlist state,
rating, upcoming (with reasons) + past shows (attended flag), and a **history receipt**:
`{ showCount, rankAmongUserVenues, lastSeen: { artistName, date } }`.
**(v1.5)** verified venue reviews, photo gallery.

## Activity (v1.5)

`activity.feed(userId, scope: "friends" | "following" | "you")` → events newest-first:
`{ kind: "logged" | "going" | "moments", user: { handle, avatarColor }, showSummary,
rating?, reviewExcerpt?, momentThumbUrls?, likeCount, commentCount, createdAt }`.
`reviewLikes.toggle(userId, logId)`. Feed sections render only when non-empty.

## Taste Match & Leaderboards

`taste.similar(userId)` → top matches with `matchPercent`, `sharedArtists[]` (name + count),
`sharedShows[]` (both-there receipts with each rating), `city`, and `recommendations[]`
(their 5★ logs for artists you haven't seen). **(v1.5)** follow state.

`leaderboard.list(scope: "city" | "artist" | "venue")` — opt-in, rendered only where a board
has ≥10 real entrants.
