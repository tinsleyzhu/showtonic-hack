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

The deterministic seed keeps the demo usable offline. To enable the live JamBase catalog, set the
sponsor key in Convex:

```bash
npx convex env set JAMBASE_API_KEY your-key
```

The `Sync JamBase` control imports the available past-year San Francisco shows for artists on the
Outside Lands lineup and all future San Francisco shows. Historical requests use exact JamBase
artist IDs because the trial API requires an artist or venue filter for past events. Results are
paginated, deduplicated, and reconciled into Convex.

You can run the same sync from the terminal:

```bash
npx convex run jambase:syncCatalog '{"cityId":"jambase:4226966","cityName":"San Francisco","historyDays":365,"maxPagesPerRange":30,"reconcileHistorical":true}'
```

Run the app:

```bash
npm run dev
```

After onboarding, the browser stores the chosen local handle in `localStorage` and resolves the
corresponding Convex user on every load. There is deliberately no authentication in the hackathon
build.

## Onboarding

Showtonic records versioned local onboarding completion before it creates the local-handle Convex
identity. Selected artists reorder the Taste-led picks shelf, and clearing site storage replays the
onboarding flow.

Seeded JamBase artist, venue, and event data keeps the core demo deterministic. A live catalog
sync expands Discover with the past year and upcoming city events while preserving source links.

## Live flows

- Discover and search seeded plus live JamBase shows.
- Set interested or going status.
- Log and rate a show with vibes, review, song, caption, and one optional poster.
- Retry an optional media upload without losing the saved show log.
- Browse the reactive diary, profile, artist, venue, leaderboard, and taste-match views.

## Ground rules for this build

1. **Keep the JamBase key server-side.** All JamBase requests run in a Convex action; the key is
   never exposed to the browser.
2. **Denormalize.** Convex has no joins. Artist names live on the log.
3. **Demoable at 1:15.** Never break the demo to add a feature.
4. **No auth.** Handle in `localStorage`.
