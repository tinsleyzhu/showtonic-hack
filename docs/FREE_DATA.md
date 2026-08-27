# Free Live-Music Data — a JamBase replacement

Reverse-engineering of [JamBase Data](https://data.jambase.com/) and a working,
free drop-in for Showtonic's catalog sync.

## What JamBase actually sells

JamBase markets "5M+ performances, 616K+ artists, 91K+ venues, 20K+ festivals,
25 years of history." Stripped down, it is an **aggregation + normalization +
ID-resolution layer** over data that is itself public:

1. **Future shows** — global event listings with venue, date, lineup, ticket
   URL, and (their upsell) historical **ticket pricing**.
2. **Historical shows + setlists** — past performances and songs played.
3. **Artist / venue metadata** — images, genres, hometown, geo coordinates.
4. **Cross-platform ID matching** — one event/artist mapped to Spotify,
   MusicBrainz, Ticketmaster, SeatGeek, Songkick, etc. (12 platforms).
5. **Event-status updates** — rescheduled / cancelled / postponed.

Their real moat is (4) + hand-curation + dedup, not the raw rows. You pay for
"clean and joined," not for data nobody else has. That means the rows are
reconstructable from free sources — you just do the normalization yourself,
which is exactly what `convex/freeEventsUtils.js` does.

## What Showtonic actually needs

Showtonic only consumes the JamBase fields captured by the `upcomingEvent`
validator in [`convex/shows.ts`](../convex/shows.ts): event title, date, start
time, venue (name / city / region / **lat-lon**, which powers the GPS backfill
matcher), image, festival grouping, artist names + a stable artist id, and a
source URL. Plus artist cards (image, genres) and city search. Nothing exotic.

## Free source map

| JamBase capability | Free replacement | Auth | Limits |
|---|---|---|---|
| Future shows, ticket URL, venue geo, genre | **Ticketmaster Discovery API** | free API key | 5,000/day, 5 req/s |
| Historical shows **+ setlists** | **Setlist.fm API** | free API key | ~2 req/s |
| Artist image / genres / preview link | **Spotify Web API** (client credentials) | free app | generous |
| Artist MBID (join key) + hometown / tags | **MusicBrainz** | none | 1 req/s |
| Non-Ticketmaster future dates (optional) | **Bandsintown** | free app id | per-artist |

The join key across the free stack is the **MusicBrainz MBID**: Setlist.fm keys
artists by MBID, MusicBrainz resolves a name → MBID, and Spotify is matched by
name search. That MBID is our free stand-in for JamBase's cross-platform id
matching.

### Ticketmaster does not serve past events

**Discovery API v2 is a ticketing catalog, not an archive.** A query whose
`startDateTime` and `endDateTime` both sit in the past returns zero events.

What we checked before concluding that, since it decides where history comes
from: every documented date parameter is forward-oriented (`startDateTime` /
`endDateTime` filter on event date, `onsaleStartDateTime` / `onsaleEndDateTime`
on the sale window); no `sort` value exposes ended events (the documented set is
name, date, relevance, distance, onSaleStartDate, id, venueName, random);
`includeTBA` / `includeTBD` / `includeTest` control unannounced and test
entities, not past ones; and neither `/attractions` nor `/venues` documents a
past-event history. Ticketmaster's only historical product is the Archtics
Season Ticketing API, which is partner-tier and unrelated.

Honesty about the evidence: Ticketmaster **never states outright** that past
events are unavailable. This is one live probe returning zero plus the complete
absence of any documented mechanism — strongly implied, not officially
confirmed. **Do not force it.** It means Ticketmaster fixes the *upcoming* half
of the catalog and leaves the historical half exactly where it was.

That matters because **backfill matches against past shows.** History has to
come from Setlist.fm (designed below, key still unset) or from the catalog-gap
agent, which turns an unexplained night into a proposed show via web search.

### The 1000-item paging cap

Officially documented: *"we only support retrieving the 1000th item.
i.e. ( size * page < 1000 )"*. A city with more upcoming shows than that
**cannot be paged through** — San Francisco (~807) fits, New York (~2,011) does
not, and the excess is lost silently rather than with an error.

`syncUpcomingCatalog` therefore walks the date horizon in windows and halves any
window that reports more items than can be paged. Note also that TM's own docs
disagree on the rate limit — Getting Started says 5 req/s, the FAQ says 2 req/s
— so we pace to the conservative bound. Both agree on 5,000/day.

### Coverage honesty (where JamBase is genuinely better)

- **Ticketmaster misses non-TM inventory** — small clubs, DICE / AXS / eventbrite
  shows. The optional per-artist **Bandsintown** pass closes most of that gap
  (`includeBandsintown: true`); it is off by default because their terms
  restrict commercial redistribution — review them before shipping it publicly.
- **Setlist.fm is crowd-sourced** — great for touring/known artists, sparse for
  tiny local acts. Historical *pricing* (a JamBase upsell) has no free source.
- You are doing the dedup JamBase does for you. `importUpcoming` upserts by id,
  and free ids are namespaced (`tm:`, `slfm:`, `mbid:`) so they never collide
  with `jambase:` rows or get wiped by the JamBase reconcile pass.

## Migration path (JamBase trial → free)

The free stack is **additive** — `convex/jambase.ts` is untouched and keeps
working for the whole trial. The UI's `syncCatalog()` in `app/useShowtonic.ts`
now tries JamBase first and **automatically falls back to the free sources** if
JamBase throws (expired key, 401/403, network). Nothing breaks the day the trial
ends; the status line just reads "Free sources synced" instead of
"JamBase synced".

When the trial is over and you want to stop calling JamBase entirely, point the
Sync control at `live.syncFreeCatalog()` (already exported from the hook)
instead of `live.syncCatalog()` — a one-line change in `app/page.tsx`.

Existing `jambase:` rows stay valid: free rows use namespaced ids (`tm:`,
`slfm:`, `bit:`), so the two catalogs coexist and dedupe independently.

## How it's wired in

Same shape, same sink as the JamBase path — no schema or frontend changes.

- [`convex/freeEventsUtils.js`](../convex/freeEventsUtils.js) — pure normalizers
  (Ticketmaster / Setlist.fm → the `upcomingEvent` shape; Spotify / MusicBrainz
  field pickers). Unit-tested in `test/freeEventsUtils.test.mjs`.
- [`convex/freeEvents.ts`](../convex/freeEvents.ts) — actions:
  - `syncFreeCatalog` — mirrors `jambase.syncCatalog`: Ticketmaster for the
    city's upcoming music, Setlist.fm for the past-year history of the seeded
    Outside Lands lineup (or any artist names you pass). Reuses
    `shows.importUpcoming`.
  - `previewFreeUpcoming` — dry read of one page, for demos.
  - `enrichArtists` — fills stub artist rows with Spotify + MusicBrainz.
- [`convex/artists.ts`](../convex/artists.ts) — `listNeedingEnrichment` query +
  `enrich` mutation (never clobbers existing values).

## Setup

Get free keys:

- Ticketmaster: https://developer.ticketmaster.com/ → create app → Consumer Key.
- Setlist.fm: https://api.setlist.fm/docs/1.0/index.html → request an API key.
- Spotify (optional, for artist art): https://developer.spotify.com/dashboard →
  create app → Client ID + Secret.

Set them in Convex (server-side only, like `JAMBASE_API_KEY`):

```bash
npx convex env set TICKETMASTER_API_KEY your-key
npx convex env set SETLISTFM_API_KEY your-key
npx convex env set SPOTIFY_CLIENT_ID your-id
npx convex env set SPOTIFY_CLIENT_SECRET your-secret
# optional — enables the Bandsintown pass
npx convex env set BANDSINTOWN_APP_ID your-app-id
```

## Run it

Full free catalog sync for San Francisco (upcoming + past-year lineup history):

```bash
npx convex run freeEvents:syncFreeCatalog '{"city":"San Francisco","historyDays":365,"maxPagesPerRange":10}'
```

Include the Bandsintown pass for wider future coverage:

```bash
npx convex run freeEvents:syncFreeCatalog '{"city":"San Francisco","includeBandsintown":true}'
```

History for specific artists:

```bash
npx convex run freeEvents:syncFreeCatalog '{"city":"San Francisco","historicalArtistNames":["Tame Impala","Vampire Weekend"]}'
```

Grow the upcoming catalog across cities (windowed, so no silent truncation):

```bash
npx convex run freeEvents:syncUpcomingCatalog \
  '{"cities":["San Francisco","New York"],"horizonDays":180,"windowDays":30}'
```

Returns `{ totals, byCity, horizon }`. Watch `truncated` (a single day too dense
to page), `rateLimited` (429 — stop for the day), and `budgetExhausted`
(`maxRequests` hit, default 400). Re-running is safe and resumes: events upsert
by id.

Enrich artist cards:

```bash
npx convex run freeEvents:enrichArtists '{"limit":50}'
```

Dry-run preview (no writes):

```bash
npx convex run freeEvents:previewFreeUpcoming '{"city":"San Francisco"}'
```

`syncFreeCatalog` returns `{ upcoming, historical, historicalArtists, sources }`
with the same insert/update counters as the JamBase sync, so it can back the
same "Sync" UI control.
