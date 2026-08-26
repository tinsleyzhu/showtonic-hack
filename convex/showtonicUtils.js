const VIBE_VOCABULARY = [
  // Current tap-only vocabulary (design 18)
  "transcendent",
  "danced nonstop",
  "great sound",
  "too packed",
  "surprise guest",
  // Legacy vibes kept valid so seeded/older logs stay writable
  "sound was insane",
  "sweaty",
  "sunset set",
  "all-nighter",
];

function validateLogInput({ rating, vibes }) {
  if (rating < 0.5 || rating > 5) {
    throw new Error("Rating must be between 0.5 and 5");
  }
  if (!Number.isInteger(rating * 2)) {
    throw new Error("Rating must use half-star steps");
  }
  for (const vibe of vibes) {
    if (!VIBE_VOCABULARY.includes(vibe)) {
      throw new Error(`Unknown vibe: ${vibe}`);
    }
  }
}

function summarizeRatings(logs) {
  // rating 0 marks an unrated (e.g. backfilled, rating skipped) log — it counts
  // as attendance but never drags an average.
  const rated = logs.filter((log) => log.rating > 0);
  if (rated.length === 0) {
    return { rating: 0, ratingCount: 0 };
  }
  const average = rated.reduce((sum, log) => sum + log.rating, 0) / rated.length;
  return {
    rating: Math.round(average * 10) / 10,
    ratingCount: rated.length,
  };
}

function normalizeSearchTerm(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function stableId(show) {
  return String(show.id ?? show._id ?? "");
}

function stableSort(shows, score) {
  return [...shows].sort((left, right) => {
    const byScore = score(right) - score(left);
    if (byScore !== 0) {
      return byScore;
    }
    const byDate = String(left.date).localeCompare(String(right.date));
    return byDate !== 0 ? byDate : stableId(left).localeCompare(stableId(right));
  });
}

function buildDiscoveryShelves(shows, today = new Date().toISOString().slice(0, 10)) {
  const upcoming = shows.filter((show) => String(show.date) >= today);
  const source = upcoming.length ? upcoming : shows;
  const limit = (items) => items.slice(0, 6);
  return {
    popularThisWeek: limit(
      stableSort(
        source,
        (show) => (show.ratingCount ?? 0) * 2 + (show.goingCount ?? 0) + (show.loggedCount ?? 0),
      ),
    ),
    trendingAmongFriends: limit(
      stableSort(source, (show) => (show.goingCount ?? 0) + (show.loggedCount ?? 0)),
    ),
    followedArtists: limit(
      stableSort(source, (show) => (show.rating ?? 0) * 10 + (show.ratingCount ?? 0)),
    ),
    nearby: limit(
        [...source].sort(
        (left, right) =>
          String(left.city).localeCompare(String(right.city)) ||
          String(left.date).localeCompare(String(right.date)) ||
          stableId(left).localeCompare(stableId(right)),
      ),
    ),
    thisWeekend: limit(
        [...source].sort(
        (left, right) =>
          String(left.date).localeCompare(String(right.date)) ||
          stableId(left).localeCompare(stableId(right)),
      ),
    ),
    pastYear: shows
      .filter((show) => String(show.date) < today && show.isJamBase !== false)
      .sort(
        (left, right) =>
          String(right.date).localeCompare(String(left.date)) ||
          stableId(left).localeCompare(stableId(right)),
      ),
  };
}

function matchesSearch(show, query) {
  const term = normalizeSearchTerm(query);
  if (!term) {
    return true;
  }
  return normalizeSearchTerm(
    [show.title, ...(show.artistNames ?? []), show.venueName, show.city]
      .filter(Boolean)
      .join(" "),
  ).includes(term);
}

export {
  VIBE_VOCABULARY,
  buildDiscoveryShelves,
  matchesSearch,
  normalizeSearchTerm,
  summarizeRatings,
  validateLogInput,
};
