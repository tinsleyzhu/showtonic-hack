# Frontend / Backend Contract

The redesigned frontend currently uses typed local demo data. These are the payloads the backend should expose so the UI can switch to Convex without changing its component model.

## Discover

Return named shelves of show summaries:

- `popular_this_week`
- `trending_among_friends`
- `followed_artists`
- `nearby`
- `this_weekend`

Each show summary needs `id`, `artistName`, `image`, `date`, `venueName`, `city`, `rating`, `ratingCount`, `friendGoingCount`, and `attendanceStatus`.

Search should match show title, artist, venue, and city.

## Show Detail

Return:

- Show date, time, stage, host/label, ticket URL, and JamBase URL.
- Aggregate rating and verified rating count.
- Current user's status: `interested`, `going`, `logged`, or empty.
- Friends and second-degree users going or attended, with one-sentence comments.
- Featured poster: one photo, caption, song, user, and like count.
- Media grouped as `artist`, `crowd`, `fits`, and `venue`, ordered by likes.
- Verified reviews plus an optional AI summary and summary tags.
- Artist summary, preview tracks, and optional set list.
- Venue summary and recommended future shows.

## Log Mutation

Accept `showId`, `rating`, `review`, `vibes`, `friendIds`, `photoStorageId`, `caption`, and `songId`.

The show, artist, and venue review permissions should be derived from a verified show log. Uploaded media should remain local/private until the log is submitted; the demo can upload one selected poster image to cloud storage first and defer the rest.

## Diary and Profile

Return user logs with denormalized artist, venue, city, genre, date, rating, and poster image fields so these lenses do not require client joins:

- Artist
- City
- Genre
- Calendar
- Rating
- Venue
- Photo

The profile also needs favorite show IDs, aggregate counts, city percentile, and one poster image per show.

## Artist and Venue

Artist payloads need follow state, social links, preview tracks, rating, verified reviews, shows, and show photos.

Venue payloads need follow/watchlist state, website, rating, verified reviews, upcoming and historical shows, and categorized photos.

## Leaderboards

Support `city`, `artist`, and `venue` scopes for week/month activity. Taste-neighbor results need match score, shared artists, shared shows, and city visibility state.
