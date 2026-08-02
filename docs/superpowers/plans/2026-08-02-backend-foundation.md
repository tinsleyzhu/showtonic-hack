# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Convex backend foundation for Showtonic so the app has seeded festival data, core show/log/user operations, and a working taste-match primitive.

**Architecture:** Keep the backend split by responsibility: one seed file for demo data, one small pure module for taste-match math, and focused Convex modules for shows, logs, users, and the seed mutation. The first pass will favor idempotent writes and denormalized reads so the UI can consume the data with minimal lookup logic.

**Tech Stack:** Convex, TypeScript, Node.js built-in test runner, Next.js project scripts

## Global Constraints

- **No live API calls on the demo path.** JamBase data is baked into `convex/seedData.ts`. The only `fetch` lives in a Convex *action* for the Discover tab.
- **Denormalize.** Convex has no joins. Artist names live on the log.
- **Demoable at 1:15.** Never break the demo to add a feature.
- **No auth.** Handle in `localStorage`.

---

### Task 1: Add backend dependency and test harness

**Files:**
- Modify: `/Users/weijiahuang/Desktop/showtonic-hack/package.json`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/test/tasteMath.test.mjs`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/tasteMath.js`

**Interfaces:**
- Consumes: Node.js built-in `node:test` and `node:assert/strict`
- Produces: A repeatable test command for the shared taste-similarity helper

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { tasteScore } from "../convex/tasteMath.js";

test("tasteScore rewards shared artists and same-show overlap", () => {
  const score = tasteScore(
    ["Charli XCX", "RÜFÜS DU SOL", "The Strokes"],
    ["RÜFÜS DU SOL", "The Strokes", "MUNA"],
    2,
  );

  assert.equal(score, 0.8);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tasteMath.test.mjs`
Expected: FAIL with module-not-found or missing export until the helper exists.

- [ ] **Step 3: Write minimal implementation**

Add `convex/tasteMath.js` with the exported function used by the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tasteMath.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json test/tasteMath.test.mjs convex/tasteMath.js
git commit -m "feat: add backend test harness"
```

### Task 2: Add seed data and seed mutation

**Files:**
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/seedData.ts`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/seed.ts`
- Modify: `/Users/weijiahuang/Desktop/showtonic-hack/convex/schema.ts`

**Interfaces:**
- Consumes: `db.insert`, `db.query`, and the existing schema tables
- Produces: An idempotent `seed.run` mutation that populates artists, venues, shows, users, and logs

- [ ] Run `npx convex run seed:run` twice in a local Convex session and confirm the second run reports `insertedLogs: 0` and only `updatedLogs` for existing rows.
- [ ] Implement `seedData.ts` with a compact Outside Lands lineup, a handful of venues, fake users, and seeded logs that share artists across users.
- [ ] Implement `seed.ts` as an idempotent upsert-style mutation that reuses existing rows by JamBase id or handle.
- [ ] Verify the seed path with `npx convex run seed:run` and confirm the returned counts match the seeded data.

### Task 3: Add core Convex query and mutation modules

**Files:**
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/users.ts`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/shows.ts`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/logs.ts`
- Create: `/Users/weijiahuang/Desktop/showtonic-hack/convex/taste.ts`

**Interfaces:**
- Consumes: the seeded tables plus `tasteScore` from `convex/tasteMath.ts`
- Produces:
  - `users.getOrCreate`
  - `shows.listByFestival`
  - `shows.get`
  - `logs.create`
  - `logs.listByUser`
  - `logs.listByShow`
  - `taste.similar`

- [ ] Write a failing query-level smoke check against one of the new Convex functions.
- [ ] Implement the query/mutation surface with denormalized fields on log rows.
- [ ] Verify the module files typecheck with `npx tsc --noEmit`.

### Task 4: Validate the backend slice

**Files:**
- Modify: `/Users/weijiahuang/Desktop/showtonic-hack/README.md`

**Interfaces:**
- Produces: clear backend setup instructions for the next person who picks up the repo

- [ ] Run the project checks that apply to this backend slice.
- [ ] Update README setup notes if the dependency or seed commands changed.
- [ ] Capture any follow-up gaps that belong to the frontend pass, not this backend foundation.
