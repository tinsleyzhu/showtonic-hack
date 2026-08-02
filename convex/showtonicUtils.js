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

module.exports = {
  VIBE_VOCABULARY,
  normalizeSearchTerm,
  summarizeRatings,
  validateLogInput,
};
