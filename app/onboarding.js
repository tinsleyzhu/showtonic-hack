const HANDLE_KEY = "showtonic.handle";
const FAVORITES_KEY = "showtonic.favoriteArtists.v1";
const COMPLETION_KEY = "showtonic.onboarding.v1";
const SESSION_KEY = "showtonic.session.v1";
const HOME_CITY_KEY = "showtonic.homeCity"; // shared with the Discover home-base picker
const VISIBILITY_KEY = "showtonic.visibility.v1";
const DEFAULT_HANDLE = "tinsley";

// Fallback taste-seed suggestions when the live catalog has not loaded yet.
const ONBOARDING_ARTISTS = [
  "Charli XCX",
  "RÜFÜS DU SOL",
  "Doechii",
  "The Strokes",
  "Vampire Weekend",
  "MUNA",
  "Jamie xx",
];

// The 5-step wizard (design exports 01–07). "welcome" doubles as the sign-in
// gate; "handoff" becomes the backfill offer in Phase 2.
const ONBOARDING_STEPS = ["welcome", "identity", "taste", "homebase", "handoff"];

// Design 04: "Pick at least five" — the UI gate for leaving the taste step.
const TASTE_SEED_MIN = 5;
// Persistence invariant for a completed profile. Deliberately lower than the
// UI gate so profiles stored by earlier builds keep working.
const TASTE_COMPLETE_MIN = 2;
const FAVORITES_CAP = 24;

function normalizeOnboardingHandle(value) {
  const handle = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return handle || DEFAULT_HANDLE;
}

function validateOnboardingHandle(value) {
  const input = String(value ?? "").trim().replace(/^@+/, "");
  if (!input) {
    return { handle: DEFAULT_HANDLE, error: "Handle is required." };
  }
  const handle = normalizeOnboardingHandle(value);
  if (handle.length < 3) {
    return { handle, error: "Handle must be at least 3 characters." };
  }
  if (handle.length > 20) {
    return { handle, error: "Handle must be 20 characters or fewer." };
  }
  if (!/^[a-z0-9_]+$/.test(handle)) {
    return { handle, error: "Handle may use only letters, numbers, and underscores." };
  }
  return { handle, error: "" };
}

// Taste seeds come from the live catalog (design 04), so any non-empty artist
// name is allowed; dedupe case-insensitively, keep first casing, cap the list.
function normalizeFavoriteArtists(values) {
  const seen = new Set();
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string") continue;
    const artist = value.trim();
    const key = artist.toLowerCase();
    if (!artist || seen.has(key)) continue;
    seen.add(key);
    normalized.push(artist);
    if (normalized.length >= FAVORITES_CAP) break;
  }
  return normalized;
}

function normalizeVisibility(value) {
  return value === "private" ? "private" : "public";
}

function normalizeHomeCity(value) {
  return String(value ?? "").trim().slice(0, 60);
}

function onboardingStepIndex(step) {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index === -1 ? 0 : index;
}

function nextOnboardingStep(step) {
  const index = onboardingStepIndex(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
}

function previousOnboardingStep(step) {
  const index = onboardingStepIndex(step);
  return ONBOARDING_STEPS[Math.max(index - 1, 0)];
}

// Whether the wizard may advance past `step` with the current draft.
// Home base is deliberately skippable (design 06: "Skip for now").
function canLeaveOnboardingStep(step, draft = {}) {
  if (step === "identity") {
    const { error } = validateOnboardingHandle(draft.handle);
    if (error) return { ok: false, reason: error };
    return { ok: true, reason: "" };
  }
  if (step === "taste") {
    const count = normalizeFavoriteArtists(draft.favoriteArtists).length;
    if (count < TASTE_SEED_MIN) {
      return {
        ok: false,
        reason: `Pick ${TASTE_SEED_MIN - count} more ${TASTE_SEED_MIN - count === 1 ? "artist" : "artists"} to personalize Discover.`,
      };
    }
    return { ok: true, reason: "" };
  }
  return { ok: true, reason: "" };
}

// The meter line under the taste grid (design 04).
function describeTasteSelection(count) {
  if (count <= 0) return `Pick at least ${TASTE_SEED_MIN} artists you'd cross town to see.`;
  if (count < TASTE_SEED_MIN) {
    const missing = TASTE_SEED_MIN - count;
    return `${count} selected · ${missing} more to personalize`;
  }
  return `${count} selected · enough to personalize`;
}

function readOnboardingProfile(storage) {
  const profile = {
    completed: false,
    handle: DEFAULT_HANDLE,
    favoriteArtists: [],
    homeCity: "",
    visibility: "public",
  };
  if (!storage) return profile;

  let hasValidHandle = false;

  try {
    const validation = validateOnboardingHandle(storage.getItem(HANDLE_KEY));
    if (!validation.error) {
      profile.handle = validation.handle;
      hasValidHandle = true;
    }
  } catch {}

  try {
    const parsed = JSON.parse(storage.getItem(FAVORITES_KEY) ?? "null");
    profile.favoriteArtists = normalizeFavoriteArtists(parsed);
  } catch {
    profile.favoriteArtists = [];
  }

  try {
    profile.homeCity = normalizeHomeCity(storage.getItem(HOME_CITY_KEY));
  } catch {
    profile.homeCity = "";
  }

  try {
    profile.visibility = normalizeVisibility(storage.getItem(VISIBILITY_KEY));
  } catch {
    profile.visibility = "public";
  }

  try {
    const sessionState = storage.getItem(SESSION_KEY);
    const hasReturningSession = sessionState === "authenticated";
    const finishedOnboarding =
      storage.getItem(COMPLETION_KEY) === "complete" &&
      profile.favoriteArtists.length >= TASTE_COMPLETE_MIN;
    profile.completed =
      sessionState !== "signed-out" && hasValidHandle && (hasReturningSession || finishedOnboarding);
  } catch {
    profile.completed = false;
  }
  return profile;
}

function markOnboardingSignedOut(storage, profile) {
  const result = {
    completed: false,
    handle: normalizeOnboardingHandle(profile?.handle),
    favoriteArtists: normalizeFavoriteArtists(profile?.favoriteArtists),
    homeCity: normalizeHomeCity(profile?.homeCity),
    visibility: normalizeVisibility(profile?.visibility),
  };
  if (!storage) return result;

  try {
    storage.setItem(SESSION_KEY, "signed-out");
  } catch {
    // The signed-out state can continue in memory when storage is unavailable.
  }
  return result;
}

function writeOnboardingProfile(storage, profile) {
  const validation = validateOnboardingHandle(profile?.handle);
  const handle = validation.handle;
  const favoriteArtists = normalizeFavoriteArtists(profile?.favoriteArtists);
  const homeCity = normalizeHomeCity(profile?.homeCity);
  const visibility = normalizeVisibility(profile?.visibility);
  if (validation.error || favoriteArtists.length < TASTE_COMPLETE_MIN) {
    return { completed: false, handle, favoriteArtists, homeCity, visibility };
  }
  const result = { completed: true, handle, favoriteArtists, homeCity, visibility };
  if (!storage) return result;

  try {
    storage.setItem(HANDLE_KEY, handle);
    storage.setItem(FAVORITES_KEY, JSON.stringify(favoriteArtists));
    if (homeCity) storage.setItem(HOME_CITY_KEY, homeCity);
    storage.setItem(VISIBILITY_KEY, visibility);
    storage.setItem(COMPLETION_KEY, "complete");
    storage.setItem(SESSION_KEY, "authenticated");
  } catch {
    // Storage is optional; the completed session can continue in memory.
  }
  return result;
}

function writeLoginProfile(storage, value, favoriteArtists = []) {
  const validation = validateOnboardingHandle(value);
  const normalizedFavorites = normalizeFavoriteArtists(favoriteArtists);
  if (validation.error) {
    return {
      completed: false,
      handle: validation.handle,
      favoriteArtists: normalizedFavorites,
      homeCity: "",
      visibility: "public",
    };
  }

  const result = {
    completed: true,
    handle: validation.handle,
    favoriteArtists: normalizedFavorites,
    homeCity: "",
    visibility: "public",
  };
  if (!storage) return result;

  try {
    storage.setItem(HANDLE_KEY, result.handle);
    storage.setItem(SESSION_KEY, "authenticated");
  } catch {
    // Storage is optional; the authenticated session can continue in memory.
  }
  return result;
}

function prioritizeShowsByArtists(shows, favoriteArtists) {
  const selected = new Set(normalizeFavoriteArtists(favoriteArtists));
  return shows
    .map((show, index) => ({
      show,
      index,
      rank: (show.artistNames ?? []).some((artist) => selected.has(artist)) ? 0 : 1,
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ show }) => show);
}

function findFirstPreferredShow(shows, favoriteArtists) {
  const available = Array.isArray(shows) ? shows : [];
  const selected = normalizeFavoriteArtists(favoriteArtists);
  for (const artist of selected) {
    const match = available.find((show) => (show.artistNames ?? []).includes(artist));
    if (match) return match;
  }
  return available[0];
}

function findFirstHistoricalPreferredShow(shows, favoriteArtists, today) {
  const historicalShows = (Array.isArray(shows) ? shows : []).filter(
    (show) => typeof show.date === "string" && show.date < today,
  );
  return findFirstPreferredShow(historicalShows, favoriteArtists);
}

export {
  ONBOARDING_ARTISTS,
  ONBOARDING_STEPS,
  TASTE_SEED_MIN,
  canLeaveOnboardingStep,
  describeTasteSelection,
  findFirstHistoricalPreferredShow,
  findFirstPreferredShow,
  markOnboardingSignedOut,
  nextOnboardingStep,
  normalizeFavoriteArtists,
  normalizeOnboardingHandle,
  onboardingStepIndex,
  previousOnboardingStep,
  prioritizeShowsByArtists,
  readOnboardingProfile,
  validateOnboardingHandle,
  writeLoginProfile,
  writeOnboardingProfile,
};
