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

// The nearest parent by NAME: the most common genre in the corpus that appears
// inside this one as a whole word — "vocal jazz" and "jazz fusion" both answer
// "jazz" when jazz is common, and answer themselves when it is not.
function parentByName(genre, weightByGenre) {
  let parent = null;
  let best = weightByGenre.get(genre) ?? 0;
  for (const token of tokens(genre)) {
    if (token === genre) continue;
    const weight = weightByGenre.get(token);
    if (weight !== undefined && weight > best) {
      parent = token;
      best = weight;
    }
  }
  return parent;
}

// The nearest parent by CO-OCCURRENCE: a more common genre that nearly every
// artist carrying this one ALSO carries.
//
// The name test cannot see that "post-bop" and "hard bop" are jazz, or that
// "neo soul" is soul — they share no word with their parent. But almost every
// post-bop artist in the corpus is tagged jazz too, and that conditional
// (`P(parent | child)`) is the signal. It stays corpus-derived, so a
// house-heavy city gets its own families rather than a taxonomy we guessed.
//
// Direction matters: we ask what share of the CHILD's artists carry the
// parent, never the reverse. Jazz is on plenty of artists that have nothing to
// do with post-bop, so jazz never becomes post-bop's child.
function parentByCooccurrence(genre, weightByGenre, counts, cooccurrence, threshold) {
  const total = counts.get(genre) ?? 0;
  if (total === 0) return null;

  let parent = null;
  let best = weightByGenre.get(genre) ?? 0;
  for (const [other, together] of cooccurrence.get(genre) ?? []) {
    const weight = weightByGenre.get(other) ?? 0;
    if (weight <= best) continue;
    if (together / total < threshold) continue;
    parent = other;
    best = weight;
  }
  return parent;
}

// Walk up to the root of the family tree. Cycles cannot happen while every
// step strictly increases weight, but a corpus is not a proof, so guard anyway.
function resolveFamilies(genres, parentOf) {
  const families = new Map();
  for (const genre of genres) {
    const seen = new Set([genre]);
    let current = genre;
    for (;;) {
      const parent = parentOf(current);
      if (!parent || seen.has(parent)) break;
      seen.add(parent);
      current = parent;
    }
    families.set(genre, current);
  }
  return families;
}

/**
 * Rank genres for the onboarding picker.
 *
 * `shows` is `[{ date, city, genres }]` — one entry per show, already joined to
 * its artists' genres. `homeCity` shows count for `cityWeight` each and shows
 * elsewhere count for one, so a city with a thin catalog still gets a full
 * picker instead of an empty one.
 *
 * `options.genreSets` is one genre array PER ARTIST, used to learn which
 * genres are subgenres of which. Pass artists, not shows: a show's genres are
 * the union across everyone on the bill, so two unrelated acts sharing a night
 * would look like evidence that their genres belong together.
 */
export function rankOnboardingGenres(shows, options = {}) {
  const {
    homeCity = "",
    today = "",
    limit = 12,
    cityWeight = 4,
    perFamily = 2,
    genreSets = [],
    cooccurrenceThreshold = 0.5,
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

  // How often each genre appears, and how often each pair appears together, on
  // a single artist.
  const counts = new Map();
  const cooccurrence = new Map();
  for (const set of genreSets) {
    const values = [...new Set(set.map(normalize).filter(Boolean))];
    for (const genre of values) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
      const row = cooccurrence.get(genre) ?? new Map();
      for (const other of values) {
        if (other !== genre) row.set(other, (row.get(other) ?? 0) + 1);
      }
      cooccurrence.set(genre, row);
    }
  }

  // Hybrid on purpose: the name test catches "jazz fusion" even where the
  // co-occurrence data is thin, and co-occurrence catches "post-bop" and
  // "neo soul", which share no word with their parent. Whichever finds the
  // more common parent wins.
  const parentOf = (genre) => {
    const byName = parentByName(genre, weightByGenre);
    const byData = parentByCooccurrence(
      genre,
      weightByGenre,
      counts,
      cooccurrence,
      cooccurrenceThreshold,
    );
    if (!byName) return byData;
    if (!byData) return byName;
    return (weightByGenre.get(byData) ?? 0) > (weightByGenre.get(byName) ?? 0) ? byData : byName;
  };

  const ranked = [...weightByGenre.entries()]
    .map(([genre, weight]) => ({ genre, weight }))
    .sort((left, right) => right.weight - left.weight || left.genre.localeCompare(right.genre));

  const families = resolveFamilies(
    ranked.map((entry) => entry.genre),
    parentOf,
  );

  const takenPerFamily = new Map();
  const picked = [];
  for (const entry of ranked) {
    if (picked.length >= limit) break;
    const family = families.get(entry.genre) ?? entry.genre;
    const taken = takenPerFamily.get(family) ?? 0;
    if (taken >= perFamily) continue;
    takenPerFamily.set(family, taken + 1);
    picked.push({ ...entry, family });
  }

  return picked;
}
