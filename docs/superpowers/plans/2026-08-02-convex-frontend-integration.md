# Convex Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Convex authoritative for every included Showtonic hackathon flow while preserving the current social show-diary interface.

**Architecture:** Add validated domain helpers and screen-oriented Convex functions behind one focused React integration hook. Keep the existing page components presentational by adapting Convex documents into their current display types, and retain local constants only for fixed labels and visual fallbacks.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Convex 1.43, Node 24 test runner.

## Global Constraints

- Use local handle identity in `localStorage`, defaulting to `tinsley`; do not add authentication.
- Do not make a live JamBase call on the demo path; render stored JamBase attribution links.
- Preserve the existing single-page navigation and visual language.
- Convex owns shows, users, attendance, logs, media, diary/profile statistics, leaderboards, and taste matches.
- A successful log must survive an optional media-upload failure.
- Remove or honestly disable excluded contact-import, follow, watchlist, comment, and notification controls.
- Follow red-green-refactor for every new non-trivial helper.
- Do not force-push the shared repository.

---

### Task 1: Domain Rules, Schema, And Idempotent Seed

**Files:**
- Create: `convex/showtonicUtils.js`
- Create: `convex/attendance.ts`
- Create: `test/showtonicUtils.test.mjs`
- Modify: `convex/schema.ts`
- Modify: `convex/seedData.ts`
- Modify: `convex/seed.ts`
- Modify: `convex/logs.ts`

**Interfaces:**
- Produces: `validateLogInput({ rating, vibes }): void`
- Produces: `summarizeRatings(logs): { rating: number; ratingCount: number }`
- Produces: `normalizeSearchTerm(value): string`
- Produces: `attendance.set({ userId, showId, status }): Id<"attendance">`
- Produces: `logs.create({ userId, showId, rating, vibes, note?, caption?, song?, createdAt? }): Id<"logs">`

- [ ] **Step 1: Write failing domain tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSearchTerm,
  summarizeRatings,
  validateLogInput,
} from "../convex/showtonicUtils.js";

test("validateLogInput rejects ratings outside half-star steps", () => {
  assert.throws(() => validateLogInput({ rating: 4.2, vibes: ["sweaty"] }), /half-star/);
  assert.throws(() => validateLogInput({ rating: 5.5, vibes: ["sweaty"] }), /between/);
});

test("validateLogInput rejects vibes outside the fixed vocabulary", () => {
  assert.throws(() => validateLogInput({ rating: 4.5, vibes: ["pretty good"] }), /Unknown vibe/);
});

test("summarizeRatings returns a stable zero state and rounded average", () => {
  assert.deepEqual(summarizeRatings([]), { rating: 0, ratingCount: 0 });
  assert.deepEqual(summarizeRatings([{ rating: 4 }, { rating: 5 }]), { rating: 4.5, ratingCount: 2 });
});

test("normalizeSearchTerm is case and diacritic insensitive", () => {
  assert.equal(normalizeSearchTerm("  RÜFÜS  "), "rufus");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/showtonicUtils.test.mjs`

Expected: FAIL because `convex/showtonicUtils.js` does not exist.

- [ ] **Step 3: Implement the domain helpers**

```js
export const VIBE_VOCABULARY = [
  "transcendent",
  "sound was insane",
  "sweaty",
  "too packed",
  "sunset set",
  "surprise guest",
  "all-nighter",
];

export function validateLogInput({ rating, vibes }) {
  if (rating < 0.5 || rating > 5) throw new Error("Rating must be between 0.5 and 5");
  if (!Number.isInteger(rating * 2)) throw new Error("Rating must use half-star steps");
  for (const vibe of vibes) {
    if (!VIBE_VOCABULARY.includes(vibe)) throw new Error(`Unknown vibe: ${vibe}`);
  }
}

export function summarizeRatings(logs) {
  if (logs.length === 0) return { rating: 0, ratingCount: 0 };
  const average = logs.reduce((sum, log) => sum + log.rating, 0) / logs.length;
  return { rating: Math.round(average * 10) / 10, ratingCount: logs.length };
}

export function normalizeSearchTerm(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
```

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `node --test test/showtonicUtils.test.mjs`

Expected: 4 passing tests.

- [ ] **Step 5: Extend the schema and seed contract**

Add the `attendance` table and indexes described in the approved design. Add `venueId`, `day`, `time`, `memoryPrompt`, and optional `ticketUrl` to shows. Add `caption`, `song`, `venueName`, `city`, and `artistGenres` to logs. Extend every seed show with concrete display values, update existing rows as well as inserting missing rows, and remove the duplicate `jambaseUrl` key from the Jamie xx fixture.

Use this attendance index shape:

```ts
attendance: defineTable({
  userId: v.id("users"),
  showId: v.id("shows"),
  status: v.union(v.literal("interested"), v.literal("going"), v.literal("logged")),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_show", ["showId"])
  .index("by_user_show", ["userId", "showId"]),
```

- [ ] **Step 6: Add attendance upsert and atomic log behavior**

Implement `attendance.set` with the `by_user_show` index. Update `logs.create` to call `validateLogInput`, copy all denormalized fields, upsert the log, and upsert a `logged` attendance row before returning the log ID.

- [ ] **Step 7: Validate Task 1**

Run: `npm test`

Run: `npx convex dev --once`

Expected: all Node tests pass and Convex reports functions ready with generated types for `attendance` and the expanded schema.

- [ ] **Step 8: Commit Task 1**

```bash
git add convex/schema.ts convex/showtonicUtils.js convex/attendance.ts convex/seedData.ts convex/seed.ts convex/logs.ts convex/_generated test/showtonicUtils.test.mjs
git commit -m "feat: add live show domain model"
```

---

### Task 2: Screen-Oriented Convex Queries

**Files:**
- Create: `convex/discovery.ts`
- Create: `convex/diary.ts`
- Create: `convex/leaderboard.ts`
- Create: `convex/artists.ts`
- Create: `convex/venues.ts`
- Modify: `convex/showtonicUtils.js`
- Modify: `convex/shows.ts`
- Modify: `convex/media.ts`
- Modify: `test/showtonicUtils.test.mjs`

**Interfaces:**
- Produces: `buildDiscoveryShelves(summaries): DiscoveryShelves`
- Produces: `discovery.home({ userId }): DiscoveryPayload`
- Produces: `discovery.search({ userId, query }): ShowSummary[]`
- Produces: `shows.detail({ showId, userId? }): ShowDetail | null`
- Produces: `diary.forUser({ userId }): DiaryPayload`
- Produces: `diary.profile({ userId }): ProfilePayload`
- Produces: `leaderboard.list({ scope, userId }): LeaderboardPayload`
- Produces: `artists.get({ artistId }): ArtistDetail | null`
- Produces: `venues.get({ venueId }): VenueDetail | null`

- [ ] **Step 1: Write failing shelf and search tests**

```js
test("buildDiscoveryShelves ranks popular shows without inventing records", () => {
  const shows = [
    { id: "quiet", rating: 5, ratingCount: 1, goingCount: 0, date: "2026-08-09" },
    { id: "busy", rating: 4.5, ratingCount: 4, goingCount: 3, date: "2026-08-08" },
  ];
  const shelves = buildDiscoveryShelves(shows);
  assert.deepEqual(shelves.popularThisWeek.map((show) => show.id), ["busy", "quiet"]);
  assert.equal(new Set(shelves.thisWeekend.map((show) => show.id)).size, 2);
});

test("matchesSearch finds artist, venue, city, and title without accents", () => {
  const show = {
    title: "Night Set",
    artistNames: ["RÜFÜS DU SOL"],
    venueName: "Golden Gate Park",
    city: "San Francisco",
  };
  assert.equal(matchesSearch(show, "rufus"), true);
  assert.equal(matchesSearch(show, "golden gate"), true);
  assert.equal(matchesSearch(show, "oakland"), false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/showtonicUtils.test.mjs`

Expected: FAIL because `buildDiscoveryShelves` and `matchesSearch` are not exported.

- [ ] **Step 3: Implement deterministic query helpers**

Add `matchesSearch`, stable popularity sorting, and `buildDiscoveryShelves` to `convex/showtonicUtils.js`. Shelves must contain references from the supplied summary list only; `followedArtists` is labeled as taste-based and sorts by shared logged artists rather than claiming a follow graph.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/showtonicUtils.test.mjs`

Expected: all helper tests pass.

- [ ] **Step 5: Implement shared hydration and discovery queries**

Create `discovery.home` and `discovery.search`. Build each summary from stored shows, logs, attendance, artists, and venues and return:

```ts
type ShowSummary = {
  id: Id<"shows">;
  title: string;
  artistIds: Id<"artists">[];
  artistNames: string[];
  image?: string;
  date: string;
  day: string;
  time: string;
  stage?: string;
  venueId: Id<"venues">;
  venueName: string;
  city: string;
  jambaseUrl?: string;
  rating: number;
  ratingCount: number;
  interestedCount: number;
  goingCount: number;
  loggedCount: number;
  attendanceStatus?: "interested" | "going" | "logged";
};
```

- [ ] **Step 6: Implement detail and aggregate queries**

Update `shows.detail` to return the selected show, artists, venue, rating summary, current attendance, counts, hydrated logs/users/media, and up to four recommended shows. Implement diary/profile, leaderboard, artist, and venue query modules using the exact interfaces above. Add media URL hydration by show as well as by log.

- [ ] **Step 7: Validate Task 2**

Run: `npm test`

Run: `npx convex dev --once`

Run: `npx convex run seed:run`

Expected: tests pass, Convex functions compile, and seed reports 7 shows with inserted or updated logs and no duplicate rows.

- [ ] **Step 8: Commit Task 2**

```bash
git add convex/discovery.ts convex/diary.ts convex/leaderboard.ts convex/artists.ts convex/venues.ts convex/shows.ts convex/media.ts convex/showtonicUtils.js convex/_generated test/showtonicUtils.test.mjs
git commit -m "feat: expose reactive screen data"
```

---

### Task 3: Convex Provider, Client Adapters, And Identity Hook

**Files:**
- Create: `app/providers.tsx`
- Create: `app/liveData.js`
- Create: `app/liveData.d.ts`
- Create: `app/useShowtonic.ts`
- Create: `test/liveData.test.mjs`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: `<Providers>{children}</Providers>` with missing-config fallback.
- Produces: `getStoredHandle(storage): string`
- Produces: `parseUploadResponse(value): string`
- Produces: `toShow(summary): Show`
- Produces: `toMemory(log): Memory`
- Produces: `useShowtonic({ selectedShowId, selectedArtistId, selectedVenueId, query, leaderboardScope })`

- [ ] **Step 1: Write failing adapter tests**

```js
test("getStoredHandle defaults once and normalizes the at-sign", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(getStoredHandle(storage), "tinsley");
  values.set("showtonic.handle", "@Maya");
  assert.equal(getStoredHandle(storage), "maya");
});

test("parseUploadResponse requires a Convex storage id", () => {
  assert.equal(parseUploadResponse({ storageId: "kg2abc" }), "kg2abc");
  assert.throws(() => parseUploadResponse({}), /storageId/);
});

test("toMemory uses uploaded media before the show fallback", () => {
  const memory = toMemory({
    _id: "log1",
    showId: "show1",
    rating: 5,
    vibes: ["transcendent"],
    note: "Great",
    caption: "Fog",
    song: "360",
    showTitle: "Charli XCX",
    showDate: "2026-08-07",
    showImage: "/fallback.jpg",
    artistNames: ["Charli XCX"],
    media: [{ url: "/upload.jpg", kind: "photo" }],
  });
  assert.equal(memory.photo, "/upload.jpg");
  assert.equal(memory.caption, "Fog");
});
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `node --test test/liveData.test.mjs`

Expected: FAIL because `app/liveData.js` does not exist.

- [ ] **Step 3: Implement pure adapters and declarations**

Implement the three tested functions plus `toShow`. Add `app/liveData.d.ts` declarations matching the existing `Show` and `Memory` display contracts so TypeScript callers do not fall back to `any`.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run: `node --test test/liveData.test.mjs`

Expected: 3 passing adapter tests.

- [ ] **Step 5: Add the provider and identity-aware hook**

`app/providers.tsx` must construct `ConvexReactClient` only when the URL exists. `app/useShowtonic.ts` must call `users.getOrCreate` once per handle, skip user-specific queries until identity exists, expose loading/error states, and return mutation methods for attendance and logs.

Use this save contract:

```ts
saveLog(input: {
  showId: Id<"shows">;
  rating: number;
  vibes: string[];
  review?: string;
  caption?: string;
  song?: string;
  file?: File;
}): Promise<{ logId: Id<"logs">; mediaError?: string }>;
```

- [ ] **Step 6: Wrap the application and validate Task 3**

Wrap `children` with `Providers` in `app/layout.tsx`.

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: tests, TypeScript, and production build pass with `.env.local`; removing the variable in a separate shell renders the provider's setup fallback rather than throwing at module import.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/providers.tsx app/liveData.js app/liveData.d.ts app/useShowtonic.ts app/layout.tsx test/liveData.test.mjs
git commit -m "feat: connect React to Convex"
```

---

### Task 4: Migrate Every Included Screen To Live Data

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/data.ts`
- Modify: `app/useShowtonic.ts`
- Modify: `app/liveData.js`
- Modify: `app/liveData.d.ts`
- Modify: `test/liveData.test.mjs`

**Interfaces:**
- Consumes: screen payloads and mutation methods from `useShowtonic`.
- Produces: live Discover, Show, Diary, Profile, Artist, Venue, Leaderboard, and taste-match views.

- [ ] **Step 1: Add failing diary-filter adapter tests**

```js
test("filterMemories sorts ratings and groups only persisted metadata", () => {
  const memories = [
    { id: "low", rating: 3, artistNames: ["A"], city: "SF", venueName: "Park", date: "2026-08-08" },
    { id: "high", rating: 5, artistNames: ["B"], city: "SF", venueName: "Room", date: "2026-08-07" },
  ];
  assert.deepEqual(filterMemories(memories, "Rating").map((item) => item.id), ["high", "low"]);
  assert.equal(filterMemories(memories, "City").length, 2);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/liveData.test.mjs`

Expected: FAIL because `filterMemories` is not exported.

- [ ] **Step 3: Implement diary filtering and verify GREEN**

Implement `filterMemories(memories, filter)` with stable date ordering and highest-rating ordering. Artist, City, Genre, Venue, and Photo return persisted records without duplication; Calendar remains a visual projection of persisted dates.

Run: `node --test test/liveData.test.mjs`

Expected: all adapter tests pass.

- [ ] **Step 4: Replace local state sources in `Home`**

Remove local `attendance`, `defaultMemories`, and mutation-only memory state. Use hook results for shows, current show detail, diary, profile, leaderboard, and taste matches. Keep only navigation, form inputs, selected file/preview, filters, and playback state local.

- [ ] **Step 5: Migrate discovery, show, and log components**

Pass live shelves and backend search results into `DiscoverView`. Pass hydrated detail/reviews/media/status/counts into `ShowView`. Bind attendance controls and log submission to hook mutations. Replace demo review arrays and hard-coded friend counts with payload data.

- [ ] **Step 6: Migrate diary, profile, leaderboard, artist, and venue components**

Render persisted records once; remove all `.concat(memories)` visual duplication. Use backend aggregate counts and taste receipts. Render related show IDs returned by Convex. Remove active follow, watchlist, and contact-import controls; keep real JamBase and website links only when URLs exist.

- [ ] **Step 7: Add loading and empty states**

Show a structured loading panel during identity/query initialization. Show `npx convex run seed:run` when discovery has no shows. Keep logger values after mutation errors and show inline messages. Disable attendance/log buttons while their operation is pending.

- [ ] **Step 8: Validate Task 4**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0, and `rg -n 'demoLogs|fakeUsers|defaultMemories|concat\(memories' app/page.tsx` returns no matches.

- [ ] **Step 9: Commit Task 4**

```bash
git add app/page.tsx app/data.ts app/useShowtonic.ts app/liveData.js app/liveData.d.ts test/liveData.test.mjs
git commit -m "feat: power Showtonic screens with live data"
```

---

### Task 5: Complete Upload Recovery And Demo-State Honesty

**Files:**
- Modify: `app/useShowtonic.ts`
- Modify: `app/page.tsx`
- Modify: `app/liveData.js`
- Modify: `test/liveData.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `media.generateUploadUrl`, Convex upload endpoint, and `media.attach`.
- Produces: explicit `saving`, `uploading`, `saved-with-media-error`, and `idle` UI phases.

- [ ] **Step 1: Write a failing upload-phase test**

```js
test("describeSaveResult preserves a saved log when media fails", () => {
  assert.deepEqual(
    describeSaveResult({ logId: "log1", mediaError: "Upload failed" }),
    { saved: true, phase: "saved-with-media-error", message: "Upload failed" },
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/liveData.test.mjs`

Expected: FAIL because `describeSaveResult` is not exported.

- [ ] **Step 3: Implement upload result behavior and verify GREEN**

Implement `describeSaveResult` and use it in the logger. Keep the diary transition for a saved log, display a non-destructive media warning, and expose a retry that uploads and attaches the original selected file to the existing log.

Run: `node --test test/liveData.test.mjs`

Expected: all adapter tests pass.

- [ ] **Step 4: Complete preview lifecycle and honest controls**

Revoke object URLs when replaced or unmounted. Use `accept="image/*,video/*"`. Label the single-file limit. Remove remaining excluded inert controls and provide accessible labels for icon-only buttons.

- [ ] **Step 5: Update setup documentation**

Document `npm install`, `npx convex dev`, `npx convex run seed:run`, and `npm run dev`. Explain that identity is local-handle based and JamBase data is seeded for offline demo reliability.

- [ ] **Step 6: Validate Task 5**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0 with no test failures, type errors, lint errors, or build errors.

- [ ] **Step 7: Commit Task 5**

```bash
git add app/useShowtonic.ts app/page.tsx app/liveData.js app/liveData.d.ts test/liveData.test.mjs README.md
git commit -m "feat: finish resilient show logging"
```

---

### Task 6: Deployment Verification And Publication

**Files:**
- Modify only if verification exposes a tested defect in an included flow.

**Interfaces:**
- Consumes: the complete integrated application.
- Produces: verified Convex deployment state, browser smoke evidence, clean Git state, and a published branch.

- [ ] **Step 1: Regenerate and deploy Convex functions**

Run: `npx convex dev --once`

Run: `npx convex run seed:run`

Expected: functions are ready and the idempotent seed reports the same user/show/log totals without duplicate insertion.

- [ ] **Step 2: Run the complete automated gate**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

Expected: every command exits 0.

- [ ] **Step 3: Run the browser smoke path**

Start `npm run dev`, then verify in the browser:

1. Discover loads seven seeded shows.
2. Searching `rufus` returns RÜFÜS DU SOL.
3. A show opens and going status persists.
4. Logging with rating, vibe, review, caption, song, and one image succeeds.
5. Show review/status, diary, profile, leaderboard, and taste screens update.
6. Reload preserves the new log.

- [ ] **Step 4: Inspect repository integrity**

Run: `git diff --check`

Run: `git status --short --branch`

Run: `git log --oneline --decorate --max-count=10`

Expected: no unstaged generated noise, no conflict markers, and only intentional commits ahead of the shared base.

- [ ] **Step 5: Finish and publish without force**

Follow `superpowers:finishing-a-development-branch`: rerun the full test suite, merge or push according to the selected integration path, fetch before publishing, and never overwrite remote work. If the remote moved, rebase and re-run the automated gate before pushing.
