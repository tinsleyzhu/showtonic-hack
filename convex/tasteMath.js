function normalizeValues(values) {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function toSet(values) {
  return new Set(normalizeValues(values));
}

function jaccard(setA, setB) {
  let shared = 0;
  for (const value of setA) {
    if (setB.has(value)) shared += 1;
  }
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? 0 : shared / unionSize;
}

// Taste v2: genres are the sharpest signal when they exist, but L1 enrichment
// is still filling them in — most logs have none yet. Lean on genre overlap
// only when BOTH sides actually have some; otherwise fall back to the
// artist/venue affinity that already works with sparse data. A missing signal
// never zeroes out the score — that's the graceful-degradation promise.
function tasteScore(artistsA, artistsB, sharedShows = 0, options = {}) {
  const { genresA = [], genresB = [], venuesA = [], venuesB = [] } = options;

  const artistJaccard = jaccard(toSet(artistsA), toSet(artistsB));

  const genreSetA = toSet(genresA);
  const genreSetB = toSet(genresB);
  const hasGenres = genreSetA.size > 0 && genreSetB.size > 0;
  const genreJaccard = hasGenres ? jaccard(genreSetA, genreSetB) : 0;

  const venueSetA = toSet(venuesA);
  const venueSetB = toSet(venuesB);
  const hasVenues = venueSetA.size > 0 && venueSetB.size > 0;
  const venueJaccard = hasVenues ? jaccard(venueSetA, venueSetB) : 0;

  let affinity;
  if (hasGenres && hasVenues) {
    affinity = artistJaccard * 0.65 + genreJaccard * 0.25 + venueJaccard * 0.1;
  } else if (hasGenres) {
    affinity = artistJaccard * 0.7 + genreJaccard * 0.3;
  } else if (hasVenues) {
    affinity = artistJaccard * 0.85 + venueJaccard * 0.15;
  } else {
    // No genres, no venues — the original artist-only formula, unchanged.
    affinity = artistJaccard;
  }

  return Number((affinity + 0.15 * sharedShows).toFixed(12));
}

export {
  tasteScore,
};
