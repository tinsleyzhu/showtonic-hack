# Smooth Onboarding Design

## Goal

Give first-time Showtonic visitors a clear, polished path from landing in the app to exploring or logging a show, while preserving the existing local-handle identity model and Convex-backed product flows.

## Scope

The onboarding flow will:

- Introduce Discover, Diary, and taste matching.
- Let the visitor choose a local handle.
- Let the visitor choose at least two favorite artists from the seeded lineup.
- Personalize the Taste-led shelf from those artist choices.
- End with a choice to explore shows or open the logger for a featured show.
- Persist completion, handle, and artist choices in `localStorage`.
- Skip onboarding for returning visitors who completed version 1.

The flow will not add authentication, passwords, email collection, contact import, social follows, or a backend onboarding schema.

## Product Behavior

### First Visit

A client that does not have `showtonic.onboarding.v1=complete` sees a full-screen onboarding experience before a Convex user is created. Existing clients that already have `showtonic.handle` but do not have the versioned completion marker see onboarding once with that handle prefilled. While browser storage is being checked, the page renders a branded initialization panel so neither the profile loader nor the main app flashes first.

### Step 1: Welcome

The opening panel explains the product in one sentence: discover live shows, log the feeling, and build a music diary. Three short proof points describe live discovery, verified memories, and taste matching. The primary action is `Start your diary`.

### Step 2: Handle

The handle field is prefilled from `showtonic.handle`, falling back to `tinsley`. Input is normalized to lowercase and may contain only ASCII letters, numbers, and underscores after an optional leading `@` is removed.

Validation rules:

- Minimum length: 3 characters.
- Maximum length: 20 characters.
- Allowed pattern: `[a-z0-9_]+`.
- Empty or invalid input keeps the visitor on this step and shows an inline error.

The flow does not check global uniqueness because handles are the existing no-auth identity key. If a matching Convex user already exists, the app opens that profile as it does today.

### Step 3: Taste Picks

The visitor selects at least two artists from the known Outside Lands lineup. Artist buttons expose selected state through `aria-pressed`. The primary action remains disabled until two artists are selected. Choices can be toggled without losing the handle.

The initial choice set is:

- Charli XCX
- RÜFÜS DU SOL
- Doechii
- The Strokes
- Vampire Weekend
- MUNA
- Jamie xx

### Step 4: Handoff

The final panel confirms the chosen handle and artist count. It offers two explicit paths:

- `Explore shows`: finish onboarding and open Discover.
- `Log your first show`: finish onboarding, scan selected artists in selection order, open the first matching live show, and open its logger. If no selected artist has a show, use the first live discovery result.

Completion is recorded only when either final action is chosen.

## Persistence Contract

The browser storage keys are:

- `showtonic.onboarding.v1`: exact value `complete` after the final action.
- `showtonic.handle`: normalized handle.
- `showtonic.favoriteArtists.v1`: JSON array of selected artist names.

Reads are defensive. Invalid or unavailable storage yields an incomplete onboarding state with the default handle and no favorites. Malformed favorite JSON is ignored. Completion writes the handle and favorites first, then writes the completion marker last. If storage is unavailable, the current session still proceeds using in-memory state, but the visitor may see onboarding again after reload.

## Personalization

The backend remains authoritative for show records, ratings, attendance, and recommendation counts. Onboarding preferences only reorder the existing Taste-led shelf:

1. Shows containing a selected artist come first.
2. Matches retain their existing backend order.
3. Non-matches retain their existing backend order.

No records are invented or removed. All other discovery shelves remain unchanged.

## Architecture

### `app/onboarding.js`

Pure, testable behavior for:

- Reading and writing the versioned onboarding profile.
- Normalizing and validating handles.
- Normalizing selected artists against the allowed lineup.
- Stable preference-based show prioritization.

### `app/onboarding.d.ts`

Type declarations for the JavaScript module so the React client remains fully typed.

### `app/Onboarding.tsx`

A focused client component owns step state, input errors, selection state, and final intent. It receives the initial profile and an `onComplete` callback. It does not call Convex directly.

### `app/page.tsx`

The page reads onboarding state once on the client, renders onboarding while incomplete, and passes the completed handle into the live-data hook. It stores the final intent until discovery data is available, then either remains on Discover or opens the selected show logger. The Taste-led shelf receives the stable personalized ordering.

### `app/useShowtonic.ts`

The hook accepts an optional `handle`. It skips `users.getOrCreate` and all user-dependent queries until a completed handle exists. When the handle changes, it clears stale identity state before resolving the new Convex user.

No Convex schema change is required.

## Visual Direction

The onboarding extends Showtonic's existing charcoal, teal, and sky-blue editorial language. It uses a bold split composition, oversized numeric progress, poster-like artist choices, and a restrained staggered reveal. It does not introduce purple gradients, generic centered SaaS cards, or a separate visual system.

Desktop uses a two-column stage with product narrative beside the active panel. Mobile becomes a single-column full-height flow with large tap targets and no horizontal overflow.

## Accessibility

- Every input has a visible label.
- Step progress is readable text, not color alone.
- Artist toggles use `aria-pressed`.
- Validation errors are connected to the handle field and announced.
- Primary actions use native buttons and keyboard focus styles.
- Motion respects `prefers-reduced-motion`.
- Focus moves to the new step heading after progression.

## Error Handling

- Handle validation stays local and never submits invalid data.
- A storage failure does not block the current session.
- Convex identity errors continue to use the existing structured error panel after onboarding completes.
- If the preferred show cannot be found, the log intent falls back to the first live show.
- An empty database still shows the existing seed command instead of a broken handoff.

## Testing

Unit tests will cover:

- Default and migrated onboarding reads.
- Handle normalization and every validation boundary.
- Favorite artist filtering and deduplication.
- Completion persistence.
- Stable preferred-show ordering without record loss.
- Selection of the first preferred show for the logger handoff.

Integration verification will cover:

- First-run onboarding from empty storage.
- Returning-user bypass after completion.
- Handle creation through Convex.
- Explore and first-log handoffs.
- Desktop and 390px mobile layouts.
- No console errors or horizontal overflow.

## Acceptance Criteria

1. A fresh browser sees onboarding before any profile-loading screen.
2. Invalid handles cannot advance.
3. Fewer than two artist picks cannot advance.
4. Completing onboarding persists the normalized handle and favorites.
5. Reloading skips onboarding.
6. The selected handle resolves through Convex.
7. The Taste-led shelf places selected artists first without changing its membership.
8. `Log your first show` opens a real live show logger.
9. The flow is usable at desktop and 390px widths with keyboard controls.
10. Tests, TypeScript, lint, Convex compilation, and the production build pass.
