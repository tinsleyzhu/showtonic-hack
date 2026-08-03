# Smooth Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished first-run welcome, handle, taste-pick, and first-log handoff that returning users skip.

**Architecture:** A pure CommonJS onboarding module owns validation, storage, personalization, and handoff selection. A focused React component owns wizard presentation. The page gates the existing Convex identity hook until onboarding completes, then reuses all current live-data flows without a schema change.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Convex, Node test runner.

## Global Constraints

- Preserve the existing no-auth local-handle identity model.
- Do not add passwords, email collection, contact import, follows, or a backend onboarding schema.
- Require a 3-20 character lowercase handle matching `[a-z0-9_]+` after stripping one or more leading `@` characters.
- Require at least two artist choices before the handoff step.
- Store completion under `showtonic.onboarding.v1`, handle under `showtonic.handle`, and favorites under `showtonic.favoriteArtists.v1`.
- Keep Convex authoritative for records, ratings, attendance, and recommendation counts.
- Personalization may reorder the Taste-led shelf but must not add or remove records.
- Preserve the current charcoal, teal, and sky-blue visual system and support a 390px viewport.

---

### Task 1: Onboarding Domain and Persistence

**Files:**
- Create: `app/onboarding.js`
- Create: `app/onboarding.d.ts`
- Create: `test/onboarding.test.mjs`

**Interfaces:**
- Produces: `ONBOARDING_ARTISTS`, `normalizeOnboardingHandle`, `validateOnboardingHandle`, `normalizeFavoriteArtists`, `readOnboardingProfile`, `writeOnboardingProfile`, `prioritizeShowsByArtists`, and `findFirstPreferredShow`.
- Consumes: a minimal storage object with `getItem(key)` and `setItem(key, value)`.

- [ ] **Step 1: Write failing validation and persistence tests**

Create `test/onboarding.test.mjs` with cases that assert:

```js
assert.deepEqual(validateOnboardingHandle(" @Maya_7 "), {
  handle: "maya_7",
  error: "",
});
assert.match(validateOnboardingHandle("x").error, /3 characters/);
assert.match(validateOnboardingHandle("bad handle").error, /letters, numbers, and underscores/);
assert.match(validateOnboardingHandle("a".repeat(21)).error, /20 characters/);
```

Use a `Map`-backed storage double and assert an empty read returns:

```js
{
  completed: false,
  handle: "tinsley",
  favoriteArtists: [],
}
```

Assert malformed favorite JSON is ignored, existing handles are migrated into the incomplete profile, and `writeOnboardingProfile` writes the marker only after normalized handle and favorites.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/onboarding.test.mjs`

Expected: FAIL because `app/onboarding.js` does not exist.

- [ ] **Step 3: Add failing personalization and handoff tests**

Use three show objects with `artistNames` and assert:

```js
assert.deepEqual(
  prioritizeShowsByArtists(shows, ["Doechii"]).map((show) => show.id),
  ["doechii", "charli", "jamie"],
);
assert.deepEqual(shows.map((show) => show.id), ["charli", "doechii", "jamie"]);
assert.equal(findFirstPreferredShow(shows, ["Jamie xx", "Doechii"]).id, "jamie");
assert.equal(findFirstPreferredShow(shows, ["Unknown"]).id, "charli");
```

Also assert duplicates and unknown artists are removed while allowed selections preserve input order.

- [ ] **Step 4: Implement the minimal pure module**

In `app/onboarding.js`, define the three storage keys and the exact allowed artist list from the design. Implement defensive storage reads with `try/catch`. `writeOnboardingProfile` must normalize values and call `setItem` in this order: handle, favorite JSON, completion marker.

Implement stable prioritization by decorating each show with its original index and a selected/non-selected rank. Implement `findFirstPreferredShow` by scanning favorite artists in order, then falling back to `shows[0]`.

In `app/onboarding.d.ts`, declare the complete public contract:

```ts
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type OnboardingProfile = {
  completed: boolean;
  handle: string;
  favoriteArtists: string[];
};

export type OnboardingIntent = "explore" | "log";

export type OnboardingShow = {
  artistNames?: readonly string[];
};

export const ONBOARDING_ARTISTS: readonly string[];

export function normalizeOnboardingHandle(value: string): string;
export function validateOnboardingHandle(value: string): {
  handle: string;
  error: string;
};
export function normalizeFavoriteArtists(values: readonly string[]): string[];
export function readOnboardingProfile(
  storage?: StorageLike | null,
): OnboardingProfile;
export function writeOnboardingProfile(
  storage: StorageLike | null | undefined,
  profile: Pick<OnboardingProfile, "handle" | "favoriteArtists">,
): OnboardingProfile;
export function prioritizeShowsByArtists<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T[];
export function findFirstPreferredShow<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T | undefined;
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/onboarding.test.mjs`

Expected: all onboarding tests pass.

Run: `npm test`

Expected: all existing and onboarding tests pass.

- [ ] **Step 6: Commit the domain layer**

```bash
git add app/onboarding.js app/onboarding.d.ts test/onboarding.test.mjs
git commit -m "feat: add onboarding domain model"
```

---

### Task 2: Guided Onboarding Interface

**Files:**
- Create: `app/Onboarding.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `OnboardingProfile`, `OnboardingIntent`, `ONBOARDING_ARTISTS`, and `validateOnboardingHandle` from Task 1.
- Produces: `Onboarding`, accepting `initialProfile` and `onComplete(profile, intent)`.

- [ ] **Step 1: Define the component contract before implementation**

Add this exact public interface to `app/Onboarding.tsx`:

```ts
type OnboardingProps = {
  initialProfile: OnboardingProfile;
  onComplete: (profile: OnboardingProfile, intent: OnboardingIntent) => void;
};
```

The component owns `step`, `handle`, `favoriteArtists`, and `handleError`. Steps are `welcome`, `handle`, `taste`, and `handoff`.

- [ ] **Step 2: Implement navigation and validation using tested helpers**

Welcome advances directly. Handle progression calls `validateOnboardingHandle`, displays its exact error in an `aria-live="polite"` region, and only saves the normalized handle on success. Taste toggles allowed artists and disables `Continue` until two are selected. Handoff calls `onComplete` with `completed: true` and either `explore` or `log`.

Use a heading ref and focus the active `h1` after every step change. Add Back controls on every step after Welcome without clearing prior input.

- [ ] **Step 3: Implement the visual system**

Build a full-height `#14181C` stage with:

- A desktop narrative column with oversized `01-04` progress, diagonal teal rule, and three product proof points.
- A bordered active panel with a sky-blue eyebrow, large editorial heading, and high-contrast primary action.
- Artist choices rendered as poster-like two-column tiles on mobile and a responsive grid on desktop.
- Native buttons, visible focus rings, `aria-pressed`, and at least 44px tap targets.

Add only two global CSS utilities: an onboarding reveal keyframe and a `prefers-reduced-motion: reduce` override that disables it. Do not change the global palette or existing page typography.

- [ ] **Step 4: Run static gates**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: 0 lint errors; existing image warnings may remain.

- [ ] **Step 5: Commit the isolated interface**

```bash
git add app/Onboarding.tsx app/globals.css
git commit -m "feat: build guided onboarding flow"
```

---

### Task 3: Identity Gate, Personalization, and Handoff

**Files:**
- Modify: `app/useShowtonic.ts`
- Modify: `app/page.tsx`
- Modify: `README.md`
- Test: `test/onboarding.test.mjs`

**Interfaces:**
- Consumes: all Task 1 helpers and Task 2 `Onboarding`.
- Produces: an onboarding-gated Home page and a `useShowtonic` hook that accepts `handle?: string`.

- [ ] **Step 1: Add a failing test for session-only completion fallback**

Add a storage double whose `setItem` throws. Assert `writeOnboardingProfile` still returns a normalized completed profile:

```js
assert.deepEqual(writeOnboardingProfile(failingStorage, {
  handle: "@Maya",
  favoriteArtists: ["Doechii", "Charli XCX"],
}), {
  completed: true,
  handle: "maya",
  favoriteArtists: ["Doechii", "Charli XCX"],
});
```

Run: `node --test test/onboarding.test.mjs`

Expected: FAIL until persistence returns the in-memory profile even when writes fail.

- [ ] **Step 2: Make storage failure non-blocking**

Update `writeOnboardingProfile` so normalization happens before storage writes and the normalized profile is returned from both successful and failed write paths.

Run: `node --test test/onboarding.test.mjs`

Expected: PASS.

- [ ] **Step 3: Gate Convex identity by completed handle**

Add `handle?: string` to `HookArgs` in `app/useShowtonic.ts`. In the identity effect:

- Clear stale `user` and `identityError` whenever `handle` changes.
- Return without calling `users.getOrCreate` when `handle` is absent.
- Call `getOrCreateUser({ handle })` only for a completed handle.
- Set `isIdentityLoading` to `Boolean(handle) && !user && !identityError`.

All existing queries already skip without `userId`; preserve that behavior.

- [ ] **Step 4: Integrate first-run state in Home**

In `app/page.tsx`:

- Import `Onboarding`, onboarding types, and pure helpers.
- Add `onboardingProfile` state initialized to `null` and read it from `window.localStorage` in a mount effect.
- Add `pendingOnboardingIntent` state.
- Pass `onboardingProfile?.completed ? onboardingProfile.handle : undefined` to `useShowtonic`.
- While the profile is `null`, render a branded `Preparing your first set` loading panel.
- While incomplete, render `Onboarding` before checking Convex identity state.
- On completion, call `writeOnboardingProfile`, store the returned profile, and save the intent.

- [ ] **Step 5: Apply taste personalization and first-log intent**

Pass `favoriteArtists` into `DiscoverView`. For the `Taste-led picks` shelf only, call `prioritizeShowsByArtists` before adapting rows. Change its eyebrow to `Based on your setup picks` when favorites exist and retain the current eyebrow otherwise.

Add an effect that waits for `pendingOnboardingIntent === "log"` and a non-empty live show list. Use `findFirstPreferredShow`, set `selectedShowId`, initialize the first track, open the logger, switch to `show`, clear the pending intent, and scroll to the top. The `explore` intent clears immediately and stays on Discover.

- [ ] **Step 6: Document onboarding behavior**

In `README.md`, add a short `Onboarding` paragraph explaining versioned local completion, local handle identity, artist-based shelf ordering, and that clearing site storage replays onboarding.

- [ ] **Step 7: Run the complete automated gate**

Run: `npm test`

Expected: all tests pass.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: 0 errors.

Run: `npm run build`

Expected: production build succeeds and `/` is generated.

- [ ] **Step 8: Commit integration**

```bash
git add app/useShowtonic.ts app/page.tsx README.md test/onboarding.test.mjs
git commit -m "feat: connect onboarding to live discovery"
```

---

### Task 4: End-to-End Verification and Publish

**Files:**
- Verify only; modify implementation files only when a reproduced defect has a failing regression test.

**Interfaces:**
- Consumes: the completed local onboarding flow and existing Convex deployment.
- Produces: verified local behavior and a synchronized GitHub `main`.

- [ ] **Step 1: Verify Convex compilation**

Run: `npx convex dev --once`

Expected: `Convex functions ready` with no schema or type errors.

- [ ] **Step 2: Verify first-run desktop flow**

Start `npm run dev` on port 3000 and open that origin in a fresh in-app browser tab. Verify Welcome appears before identity loading, invalid handles stay on Step 2, one artist cannot advance, two artists can advance, and `Explore shows` opens live Discover with the selected artists first in Taste-led picks. Do not inspect or mutate browser storage through automation.

- [ ] **Step 3: Verify returning-user and log handoff flows**

Reload port 3000 and verify onboarding is skipped. Start a second local server on port 3001 so the browser has a clean origin without storage manipulation, complete onboarding there with `Log your first show`, and verify a live show opens with the logger visible. Do not submit a log during this smoke test.

- [ ] **Step 4: Verify mobile and console health**

At `390x844`, verify no horizontal overflow, all buttons remain reachable, and the artist grid is usable. Confirm browser console has no errors or warnings attributable to onboarding.

- [ ] **Step 5: Re-run final evidence gate**

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` as separate commands.

Expected: tests, typecheck, lint, and build all exit 0.

Run `git diff --check`, then `git status -sb`.

Expected: no whitespace errors and a clean worktree ahead only by intended onboarding commits.

- [ ] **Step 6: Integrate the latest remote safely and push**

Run `git fetch origin`. If `origin/main` moved, merge it without force-pushing, resolve only actual conflicts, and repeat Step 5. Push with `git push -u origin main`, then verify `HEAD` equals `origin/main`.
