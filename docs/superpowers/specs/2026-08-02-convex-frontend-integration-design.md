# Convex Frontend Integration Design

## Objective

Connect the existing Showtonic social show-diary interface to the existing Convex backend so the documented hackathon demo works end to end. Convex becomes authoritative for shows, users, attendance, logs, media, diary/profile statistics, leaderboards, and taste matches while the current visual design and single-page navigation are preserved.

The result must support the complete demo path on a phone: discover a show, set attendance, log and rate it, optionally upload one poster image, see the new entry in the diary and profile, and see updated community and taste data.

## Scope

### Included

- Convex React provider and browser client configuration.
- Local handle identity stored in `localStorage`, defaulting to `tinsley`.
- Seed-backed JamBase artist, venue, and show data with visible attribution links.
- Reactive discovery shelves and search.
- Reactive show details, ratings, community logs, attendance, and media.
- Log create/update flow with rating, review, fixed vibe tags, caption, selected song, and one optional image or video.
- Three-step Convex Storage upload and retryable upload failures.
- Reactive diary, profile, artist, venue, leaderboard, and taste-match screens.
- Loading, empty, validation, configuration, submission, and upload-error states.
- Automated backend/helper and client-adapter tests plus TypeScript, ESLint, production-build, Convex, and browser-smoke verification.

### Excluded

- Authentication, passwords, OAuth, and account recovery.
- Comments, notifications, contact import, and direct messaging.
- Production follow graphs and watchlists.
- Live JamBase calls during the demo.
- A production recommendation engine or multi-city data pipeline.
- A route-system rewrite; the existing in-page view navigation remains.

Buttons for excluded capabilities must be removed, disabled with honest copy, or converted to real outbound links. The interface must not present inert controls as working features.

## Architecture

`app/providers.tsx` owns a single `ConvexReactClient` and wraps the application with `ConvexProvider`. The root layout renders this provider. If `NEXT_PUBLIC_CONVEX_URL` is absent, the provider renders a clear setup message instead of constructing an invalid client.

The page uses a focused integration hook rather than calling Convex throughout the 686-line component tree. The hook owns identity initialization, reactive queries, mutations, upload orchestration, and screen-ready view models. Presentational components continue receiving ordinary typed props.

Convex queries return screen-oriented payloads so the client does not reproduce backend joins and aggregation logic. Pure client adapters handle only formatting and fallback presentation values. `app/data.ts` retains fixed vibe vocabulary, track labels, prompts, and safe image fallbacks; it no longer owns user state, attendance, memories, community reviews, or leaderboard results.

JamBase data remains baked into the seed. `convex/jambase.ts` stays available for explicit refresh tooling but is not part of page rendering or the demo's critical path.

## Data Model

### Users

Keep the existing `users` table. On first browser load, call `users.getOrCreate` with the locally stored handle. Store the handle, not a Convex document ID, in `localStorage`; resolve the current document on each environment so switching deployments does not leave a stale ID.

### Attendance

Add an `attendance` table with:

- `userId: Id<"users">`
- `showId: Id<"shows">`
- `status: "interested" | "going" | "logged"`
- `updatedAt: number`

Add indexes by user, by show, and by the `(userId, showId)` pair. The set mutation upserts one row per user/show. Creating a log sets the corresponding attendance row to `logged` in the same mutation so the two states cannot disagree.

### Shows

Extend show documents with the fields required by the current interface:

- `venueId: Id<"venues">`
- `day: string`
- `time: string`
- `memoryPrompt: string`
- optional `ticketUrl: string`

Keep denormalized `venueName`, `city`, `artistNames`, image, stage, festival ID, and JamBase URL. Seed data supplies these values deterministically.

### Logs

Extend logs with:

- optional `caption: string`
- optional `song: string`
- `venueName: string`
- `city: string`
- `artistGenres: string[]`

The create mutation validates ratings from 0.5 through 5 in half-step increments, validates the fixed vibe vocabulary, and upserts by user/show. It returns the log ID for the optional media step.

### Media

Keep media in the existing table and Convex Storage. Screen queries hydrate media records with `ctx.storage.getUrl`. A log may exist without media. A failed optional upload never rolls back a successfully saved log.

## Backend Contracts

### Identity

- `users.getOrCreate({ handle, avatarColor? })` returns the current user.
- `users.getByHandle({ handle })` remains available for lookup.

### Discovery And Search

- A discovery query accepts `userId` and returns named shelves: `popularThisWeek`, `trendingAmongFriends`, `followedArtists`, `nearby`, and `thisWeekend`.
- Each show summary includes IDs, artist names, image, date/time, venue, city, aggregate rating, rating count, attendance counts, and the current user's attendance status.
- A search query matches normalized show title, artist name, venue name, and city.
- Hackathon shelves use deterministic sorting based on ratings, log counts, seeded location, festival/date, and stable fallbacks. They do not claim a real social graph or follow graph.

### Show Detail

- The detail query accepts `showId` and optional `userId`.
- It returns the show, artists, venue, aggregate rating, verified logs with users, hydrated media, attendance counts, current-user status, and recommended shows.
- Reviews are verified because every review is attached to a stored show log.

### Attendance And Logging

- `attendance.set({ userId, showId, status })` upserts interested or going state.
- `logs.create` accepts user/show IDs, rating, vibes, optional review, caption, song, and timestamp.
- `logs.create` upserts the log, copies denormalized show/artist/venue fields, and sets attendance to logged atomically.

### Diary, Profile, Artist, Venue, And Leaderboard

- The diary query returns the current user's hydrated logs and media plus aggregate show, artist, venue, city, and rating statistics.
- The profile query returns the same trusted counts and up to four highest-rated favorite shows.
- Artist and venue queries return their stored profiles, related shows, aggregate ratings, verified reviews, and hydrated media.
- The leaderboard query supports city, artist, and venue scopes using stored logs. It labels its period as all seeded activity unless a real time window is supplied.
- `taste.similar` remains the source for taste neighbors and returns match score, shared artists, and shared shows.

## Client Data Flow

1. The provider validates configuration and connects to Convex.
2. The integration hook reads or creates the local handle, then calls `users.getOrCreate`.
3. Once the user document exists, reactive queries load discovery and user-specific data in parallel.
4. Selecting a show changes local navigation state and enables the show-detail query.
5. Attendance controls call the upsert mutation and disable while submitting.
6. Saving a log validates local input and calls the atomic log mutation.
7. If a file is selected, the client requests an upload URL, posts the file, receives `storageId`, and calls `media.attach` with the returned log ID.
8. Reactive queries update show details, diary, profile, leaderboard, and taste matches without manual refetching.
9. A successful log closes the logger and opens the diary. A failed media upload keeps the saved log visible and offers a retry for that file.

Object URLs used for local previews are revoked when replaced, submitted, or unmounted.

## Screen Behavior

### Discover

Render live summaries and deterministic shelves. Search switches to backend results after non-empty normalized input. Loading uses skeleton cards; an empty database shows the exact seed command `npx convex run seed:run`.

### Show

Render live artists, venue, rating aggregate, community reviews, media, attendance counts, current-user status, and recommended shows. Attendance and log controls use Convex IDs rather than seed slugs. JamBase attribution opens the stored source URL.

### Log Sheet

Require a valid rating. Vibes are tap-only from the fixed list. Review, caption, song, and media are optional. The submit button exposes saving and uploading phases, rejects duplicate clicks, and displays actionable mutation or upload errors.

### Diary And Profile

Render only persisted logs for the current user. Filters operate on returned denormalized metadata. Calendar derives active dates from real logs. Counts, averages, favorites, and media grids do not duplicate entries to make the screen look fuller.

### Leaderboard And Taste

Render backend-calculated activity rows for the selected scope. Render `taste.similar` results with scores and shared-artist/show receipts. Empty results explain that another logged show will improve matching.

### Artist And Venue

Render Convex profiles, related shows, aggregate ratings, verified reviews, and stored media. Static preview-track labels may be used when JamBase seed data has only one top track. Follow/watchlist controls remain excluded and are not rendered as active controls.

## Failure Handling

- Missing `NEXT_PUBLIC_CONVEX_URL`: render a configuration panel with the local setup command.
- Identity failure: show a retry action and do not issue user-specific queries with an undefined ID.
- Query loading: preserve page structure with skeletons rather than flashing seed state.
- Empty seed: show the seed command and keep navigation stable.
- Invalid rating or vibes: reject before mutation and display inline feedback.
- Mutation failure: keep the log sheet and entered values open for retry.
- Upload failure: preserve the saved log, keep the selected file available while the page remains mounted, and expose retry or skip-photo actions.
- Missing related records: Convex queries omit invalid optional relations and return a consistent payload rather than crashing the page.

## Testing And Verification

Pure backend helpers cover rating/vibe validation, aggregate calculations, deterministic shelf ordering, and attendance upsert decisions. Pure client adapters cover conversion from Convex payloads to display models, fallbacks, diary filters, and upload result parsing. Every new helper follows a red-green-refactor cycle.

Required automated verification:

- `npm test`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Convex code generation and function type validation through the configured development deployment

Required browser smoke path:

1. Load discover with seeded Convex data.
2. Search for an artist and open a show.
3. Set going, then log the show with rating, vibe, review, caption, song, and one image.
4. Confirm the show status and community review update.
5. Confirm the new persisted item in diary and profile.
6. Confirm leaderboard/taste screens render backend results.
7. Reload and confirm the log remains.

## Completion Criteria

- No current user attendance, memories, reviews, profile statistics, leaderboard rows, or taste results come from local demo arrays.
- The full demo path works from a clean browser against the seeded Convex deployment.
- Optional media failure cannot lose a successful log.
- No included screen contains a misleading inert primary control.
- Tests, TypeScript, ESLint, production build, Convex validation, and browser smoke verification pass.
- The working tree is clean and the completed integration is published to the shared GitHub repository without force-pushing.
