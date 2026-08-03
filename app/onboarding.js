const HANDLE_KEY = "showtonic.handle";
const FAVORITES_KEY = "showtonic.favoriteArtists.v1";
const COMPLETION_KEY = "showtonic.onboarding.v1";
const SESSION_KEY = "showtonic.session.v1";
const DEFAULT_HANDLE = "tinsley";

const ONBOARDING_ARTISTS = [
  "Charli XCX",
  "RÜFÜS DU SOL",
  "Doechii",
  "The Strokes",
  "Vampire Weekend",
  "MUNA",
  "Jamie xx",
];

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

function normalizeFavoriteArtists(values) {
  const allowed = new Map(ONBOARDING_ARTISTS.map((artist) => [artist.toLowerCase(), artist]));
  const normalized = [];
  for (const value of Array.isArray(values) ? values : []) {
    const artist = allowed.get(String(value ?? "").trim().toLowerCase());
    if (artist && !normalized.includes(artist)) {
      normalized.push(artist);
    }
  }
  return normalized;
}

function readOnboardingProfile(storage) {
  const profile = {
    completed: false,
    handle: DEFAULT_HANDLE,
    favoriteArtists: [],
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
    const sessionState = storage.getItem(SESSION_KEY);
    const hasReturningSession = sessionState === "authenticated";
    const finishedOnboarding =
      storage.getItem(COMPLETION_KEY) === "complete" && profile.favoriteArtists.length >= 2;
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
  if (validation.error || favoriteArtists.length < 2) {
    return { completed: false, handle, favoriteArtists };
  }
  const result = { completed: true, handle, favoriteArtists };
  if (!storage) return result;

  try {
    storage.setItem(HANDLE_KEY, handle);
    storage.setItem(FAVORITES_KEY, JSON.stringify(favoriteArtists));
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
    return { completed: false, handle: validation.handle, favoriteArtists: normalizedFavorites };
  }

  const result = {
    completed: true,
    handle: validation.handle,
    favoriteArtists: normalizedFavorites,
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
  findFirstHistoricalPreferredShow,
  findFirstPreferredShow,
  markOnboardingSignedOut,
  normalizeFavoriteArtists,
  normalizeOnboardingHandle,
  prioritizeShowsByArtists,
  readOnboardingProfile,
  validateOnboardingHandle,
  writeLoginProfile,
  writeOnboardingProfile,
};
