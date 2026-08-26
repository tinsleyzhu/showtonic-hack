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
  LOW_SIGNAL_SHOWS,
  rankCompatiblePeers,
  tasteScore,
};
