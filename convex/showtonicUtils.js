const VIBE_VOCABULARY = [
  "transcendent",
  "sound was insane",
  "sweaty",
  "too packed",
  "sunset set",
  "surprise guest",
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
  if (logs.length === 0) {
    return { rating: 0, ratingCount: 0 };
  }
  const average = logs.reduce((sum, log) => sum + log.rating, 0) / logs.length;
  return {
    rating: Math.round(average * 10) / 10,
    ratingCount: logs.length,
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

function buildDiscoveryShelves(shows) {
  const limit = (items) => items.slice(0, 6);
  return {
    popularThisWeek: limit(
      stableSort(
        shows,
        (show) => (show.ratingCount ?? 0) * 2 + (show.goingCount ?? 0) + (show.loggedCount ?? 0),
      ),
    ),
    trendingAmongFriends: limit(
      stableSort(shows, (show) => (show.goingCount ?? 0) + (show.loggedCount ?? 0)),
    ),
    followedArtists: limit(
      stableSort(shows, (show) => (show.rating ?? 0) * 10 + (show.ratingCount ?? 0)),
    ),
    nearby: limit(
      [...shows].sort(
        (left, right) =>
          String(left.city).localeCompare(String(right.city)) ||
          String(left.date).localeCompare(String(right.date)) ||
          stableId(left).localeCompare(stableId(right)),
      ),
    ),
    thisWeekend: limit(
      [...shows].sort(
        (left, right) =>
          String(left.date).localeCompare(String(right.date)) ||
          stableId(left).localeCompare(stableId(right)),
      ),
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

module.exports = {
  VIBE_VOCABULARY,
  buildDiscoveryShelves,
  matchesSearch,
  normalizeSearchTerm,
  summarizeRatings,
  validateLogInput,
};
