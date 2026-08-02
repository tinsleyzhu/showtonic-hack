function normalizeValues(values) {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function toSet(values) {
  return new Set(normalizeValues(values));
}

function tasteScore(artistsA, artistsB, sharedShows = 0) {
  const setA = toSet(artistsA);
  const setB = toSet(artistsB);

  let sharedArtists = 0;
  for (const artist of setA) {
    if (setB.has(artist)) {
      sharedArtists += 1;
    }
  }

  const unionSize = new Set([...setA, ...setB]).size;
  const jaccard = unionSize === 0 ? 0 : sharedArtists / unionSize;
  return Number((jaccard + 0.15 * sharedShows).toFixed(12));
}

module.exports = {
  tasteScore,
};
