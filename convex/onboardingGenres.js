// Genre-first onboarding, for a catalog with a lopsided shape.
//
// The SF catalog is jazz-heavy — after L1's enrichment, 154 of the first 220
// enriched artists carry a jazz genre. A picker built on raw catalog counts
// therefore offers twelve slots of jazz, which is not a taste question, it is
// a description of San Francisco.
//
// Two corrections, both of which keep the picker honest rather than pretending
// the catalog is more varied than it is:
//
//   1. Rank by what the person could ACTUALLY GO TO — upcoming shows in their
//      city — not by everything the catalog has ever held.
//   2. Cap how many slots one genre family can take. "jazz", "vocal jazz" and
//      "jazz fusion" filling three slots tells you nothing "jazz" alone did
//      not; the cap buys those slots back for genres further down.
//
// Families are derived from the data, not from a hardcoded taxonomy: a genre
// belongs to a family when a more common genre appears inside it as a whole
// word. That way the same code works when the catalog is house-heavy instead.

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function tokens(genre) {
  return genre.split(/[\s/&_-]+/).filter(Boolean);
}

// The family of a genre is the most common genre in the corpus that appears
// inside it as a whole word — so "vocal jazz" and "jazz fusion" both answer
// "jazz" when jazz is common, and answer themselves when it is not.
function familyOf(genre, weightByGenre) {
  let family = genre;
  let best = weightByGenre.get(genre) ?? 0;
  for (const token of tokens(genre)) {
    if (token === genre) continue;
    const weight = weightByGenre.get(token);
    if (weight !== undefined && weight > best) {
      family = token;
      best = weight;
    }
  }
  return family;
}

/**
 * Rank genres for the onboarding picker.
 *
 * `shows` is `[{ date, city, genres }]` — one entry per show, already joined to
 * its artists' genres. `homeCity` shows count for `cityWeight` each and shows
 * elsewhere count for one, so a city with a thin catalog still gets a full
 * picker instead of an empty one.
 */
export function rankOnboardingGenres(shows, options = {}) {
  const {
    homeCity = "",
    today = "",
    limit = 12,
    cityWeight = 4,
    perFamily = 2,
  } = options;

  const city = normalize(homeCity);
  const weightByGenre = new Map();

  for (const show of shows) {
    // Upcoming only: onboarding is asking what you want to go and see, and a
    // genre you cannot buy a ticket for is a dead slot in the picker.
    if (today && String(show.date ?? "") < today) continue;
    const weight = city && normalize(show.city) === city ? cityWeight : 1;
    for (const value of new Set((show.genres ?? []).map(normalize).filter(Boolean))) {
      weightByGenre.set(value, (weightByGenre.get(value) ?? 0) + weight);
    }
  }

  const ranked = [...weightByGenre.entries()]
    .map(([genre, weight]) => ({ genre, weight }))
    .sort((left, right) => right.weight - left.weight || left.genre.localeCompare(right.genre));

  const takenPerFamily = new Map();
  const picked = [];
  for (const entry of ranked) {
    if (picked.length >= limit) break;
    const family = familyOf(entry.genre, weightByGenre);
    const taken = takenPerFamily.get(family) ?? 0;
    if (taken >= perFamily) continue;
    takenPerFamily.set(family, taken + 1);
    picked.push({ ...entry, family });
  }

  return picked;
}
