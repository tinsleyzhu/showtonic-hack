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

function weightOf(weights, value) {
  if (!weights) return 1;
  const weight = weights instanceof Map ? weights.get(value) : weights[value];
  return weight === undefined ? 1 : weight;
}

// Jaccard where each member counts for what it is worth. Returns null when the
// whole union weighs nothing — every genre in play is one everybody shares, so
// there is no signal here at all and the caller should fall back rather than
// score a zero.
function weightedJaccard(setA, setB, weights) {
  let intersection = 0;
  let union = 0;
  for (const value of new Set([...setA, ...setB])) {
    const weight = weightOf(weights, value);
    union += weight;
    if (setA.has(value) && setB.has(value)) intersection += weight;
  }
  return union === 0 ? null : intersection / union;
}

// How much a shared genre is actually worth, from how many people have it.
//
// The SF catalog is jazz-heavy — jazz sits on well over half the enriched
// artists — so "you both like jazz" is close to saying "you both like music".
// Standard IDF: a genre everyone shares weighs 0, a genre one person has
// weighs 1. Pass the result to tasteScore as `genreWeights`; omit it and every
// genre counts the same, which is the right default for a small sample.
function genreWeights(profileGenres) {
  const population = profileGenres.length;
  if (population < 2) return {};

  const documentFrequency = new Map();
  for (const genres of profileGenres) {
    for (const genre of new Set(normalizeValues(genres))) {
      documentFrequency.set(genre, (documentFrequency.get(genre) ?? 0) + 1);
    }
  }

  const weights = {};
  for (const [genre, frequency] of documentFrequency) {
    weights[genre] = Math.log(population / frequency) / Math.log(population);
  }
  return weights;
}

// Taste v2: genres are the sharpest signal when they exist, but L1 enrichment
// is still filling them in — most logs have none yet. Lean on genre overlap
// only when BOTH sides actually have some; otherwise fall back to the
// artist/venue affinity that already works with sparse data. A missing signal
// never zeroes out the score — that's the graceful-degradation promise.
function tasteScore(artistsA, artistsB, sharedShows = 0, options = {}) {
  const {
    genresA = [],
    genresB = [],
    venuesA = [],
    venuesB = [],
    genreWeights: weights,
  } = options;

  const artistJaccard = jaccard(toSet(artistsA), toSet(artistsB));

  const genreSetA = toSet(genresA);
  const genreSetB = toSet(genresB);
  // null here means "the genres in play are ones everybody has" — no signal,
  // so fall through to artists and venues rather than scoring it a zero.
  const weighted =
    genreSetA.size > 0 && genreSetB.size > 0
      ? weightedJaccard(genreSetA, genreSetB, weights)
      : null;
  const hasGenres = weighted !== null;
  const genreJaccard = weighted ?? 0;

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

// The minimum diary length before the app will claim to see a pattern. The
// UI hides averages under this, `agents.tasteProfile` returns a null average,
// and peer discovery returns nobody — one number so the three cannot drift.
const LOW_SIGNAL_SHOWS = 5;

// Peer-to-peer discovery, as a pure function so the low-N promise is testable
// without a Convex harness. `me` and each peer are already-built profiles
// ({ artistNames, showIds, genres, venueNames }); `me.logCount` is the raw
// diary length, which is what the low-N gate reads.
function rankCompatiblePeers(me, peers, limit = 5) {
  if (me.logCount < LOW_SIGNAL_SHOWS) {
    return { lowSignal: true, matches: [] };
  }

  // Rarity is measured across the people actually being compared, so a genre
  // that saturates this population stops carrying weight on its own.
  const weights = genreWeights([me.genres ?? [], ...peers.map((peer) => peer.genres ?? [])]);
  const cap = Math.max(1, Math.min(Number(limit) || 5, 10));
  const matches = peers
    .map((peer) => {
      const sharedArtistNames = me.artistNames.filter((artist) =>
        peer.artistNames.includes(artist),
      );
      const sharedShows = me.showIds.filter((showId) => peer.showIds.includes(showId));

      return {
        handle: peer.handle,
        avatarColor: peer.avatarColor,
        homeCity: peer.homeCity ?? null,
        // Clamp like the app UI does — jaccard plus the shared-show bonus can
        // pass 1.0, and a 140% match reads as broken.
        matchPercent: Math.min(
          Math.round(
            tasteScore(me.artistNames, peer.artistNames, sharedShows.length, {
              genresA: me.genres,
              genresB: peer.genres,
              venuesA: me.venueNames,
              venuesB: peer.venueNames,
              genreWeights: weights,
            }) * 100,
          ),
          99,
        ),
        sharedArtistCount: sharedArtistNames.length,
        sharedShowCount: sharedShows.length,
        sharedArtistNames: sharedArtistNames.slice(0, 5),
      };
    })
    .filter((match) => match.matchPercent > 0)
    .sort((left, right) => right.matchPercent - left.matchPercent)
    .slice(0, cap);

  return { lowSignal: false, matches };
}

export {
  genreWeights,
  LOW_SIGNAL_SHOWS,
  rankCompatiblePeers,
  tasteScore,
};
