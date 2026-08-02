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

Already scaffolded (Next.js + TS + Tailwind). Remaining setup:

```bash
npm install
```

```bash
npx convex dev
```

That creates the deployment, writes `.env.local` with `NEXT_PUBLIC_CONVEX_URL`, and watches
`convex/`. Leave it running in its own terminal.

Then seed the database (JamBase lineup + fake users):

```bash
npx convex run seed:run
```

Run the app:

```bash
npm run dev
```

The recap-card pass will add `html-to-image`; the backend foundation only needs Convex for now.

## Ground rules for this build

1. **No live API calls on the demo path.** JamBase data is baked into `convex/seedData.ts`. The
   only `fetch` lives in a Convex *action* for the Discover tab.
2. **Denormalize.** Convex has no joins. Artist names live on the log.
3. **Demoable at 1:15.** Never break the demo to add a feature.
4. **No auth.** Handle in `localStorage`.
