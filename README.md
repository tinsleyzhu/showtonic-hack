# Showtonic Hack

Log the sets you saw at Outside Lands, drop in your photos, get a shareable recap card, and find
the people whose taste matches yours.

Built at the Outside Lands hackathon, 2026-08-02, on **JamBase** (live music data) + **Convex**
(backend, storage, realtime).

- Plan and timeline: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)
- Technical spec: [`docs/SPEC.md`](docs/SPEC.md)
- Event data notes: [`docs/DATA.md`](docs/DATA.md)
- Schema: [`convex/schema.ts`](convex/schema.ts)

## Stack

Next.js 16 (App Router) · React 19 · Tailwind 4 · Convex · Vercel

## Setup

Install the project dependencies:

```bash
npm install
```

```bash
npx convex dev
```

That creates or selects the development deployment, writes `.env.local` with
`NEXT_PUBLIC_CONVEX_URL`, deploys the schema and functions, and watches `convex/`. Leave it
running in its own terminal.

Then seed the database (JamBase lineup + demo users):

```bash
npx convex run seed:run
```

The demo reads JamBase data from the deterministic seed. To run an optional JamBase v3 refresh,
configure the sponsor key in Convex and invoke the backend action explicitly:

```bash
npx convex env set JAMBASE_API_KEY your-key
```

```bash
npx convex run jambase:syncUpcoming '{"sourceUrl":"https://api.data.jambase.com/v3/events?name=Outside%20Lands&eventDateFrom=2026-08-07&eventDateTo=2026-08-09&perPage=100","festivalId":"outside-lands-2026"}'
```

Run the app:

```bash
npm run dev
```

The browser stores the local handle `tinsley` in `localStorage` and resolves the corresponding
Convex user on every load. There is deliberately no authentication in the hackathon build.

JamBase artist, venue, and event data is baked into the idempotent seed so the demo does not
depend on an external API call. JamBase source links remain visible in the interface.

## Live flows

- Discover and search the seeded lineup.
- Set interested or going status.
- Log and rate a show with vibes, review, song, caption, and one optional poster.
- Retry an optional media upload without losing the saved show log.
- Browse the reactive diary, profile, artist, venue, leaderboard, and taste-match views.

## Ground rules for this build

1. **No live API calls on the demo path.** JamBase data is baked into `convex/seedData.ts`. The
   only `fetch` lives in an optional Convex refresh action.
2. **Denormalize.** Convex has no joins. Artist names live on the log.
3. **Demoable at 1:15.** Never break the demo to add a feature.
4. **No auth.** Handle in `localStorage`.
