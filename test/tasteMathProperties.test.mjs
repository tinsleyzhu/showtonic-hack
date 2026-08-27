import assert from "node:assert/strict";
import test from "node:test";

import { genreWeights, LOW_SIGNAL_SHOWS, rankCompatiblePeers, tasteScore } from "../convex/tasteMath.js";

// Deterministic pseudo-randomness. A property test that cannot be re-run on
// the input that broke it is a coin toss with extra steps, so the seed is
// fixed and the failing case is printed with the assertion.
function generator(seed = 20260827) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const VOCABULARY = ["Osees", "Beck", "Jamie xx", "Charli XCX", "", "  ", "SFJAZZ", "punk", "jazz"];

function sample(random, size) {
  return Array.from({ length: Math.floor(random() * size) }, () =>
    VOCABULARY[Math.floor(random() * VOCABULARY.length)],
  );
}

function profiles(random) {
  return {
    artists: sample(random, 6),
    genres: sample(random, 5),
    venues: sample(random, 4),
  };
}

test("a score is always a finite number, whatever the inputs look like", () => {
  const random = generator();
  for (let iteration = 0; iteration < 500; iteration += 1) {
    const left = profiles(random);
    const right = profiles(random);
    const shared = Math.floor(random() * 3);
    const score = tasteScore(left.artists, right.artists, shared, {
      genresA: left.genres,
      genresB: right.genres,
      venuesA: left.venues,
      venuesB: right.venues,
    });
    assert.ok(Number.isFinite(score), `not finite: ${JSON.stringify({ left, right, shared, score })}`);
    assert.ok(score >= 0, `negative: ${JSON.stringify({ left, right, score })}`);
    assert.ok(score <= 1 + 0.15 * shared + 1e-9, `above bound: ${JSON.stringify({ left, right, score })}`);
  }
});

test("taste is symmetric — who is asking cannot change the answer", () => {
  const random = generator(7);
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const left = profiles(random);
    const right = profiles(random);
    const forward = tasteScore(left.artists, right.artists, 1, {
      genresA: left.genres,
      genresB: right.genres,
      venuesA: left.venues,
      venuesB: right.venues,
    });
    const backward = tasteScore(right.artists, left.artists, 1, {
      genresA: right.genres,
      genresB: left.genres,
      venuesA: right.venues,
      venuesB: left.venues,
    });
    assert.equal(forward, backward, JSON.stringify({ left, right }));
  }
});

test("agreeing about one more thing never scores you lower", () => {
  const random = generator(11);
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const left = profiles(random);
    const right = profiles(random);
    const before = tasteScore(left.artists, right.artists, 0);
    const after = tasteScore([...left.artists, "A Shared Act"], [...right.artists, "A Shared Act"], 0);
    assert.ok(after >= before - 1e-12, JSON.stringify({ left, right, before, after }));
  }
});

test("blank and whitespace-only values are not taste", () => {
  // The catalog ships names with leading spaces, and an empty genre array is
  // the normal state while enrichment is still running.
  assert.equal(tasteScore(["", "  "], ["", "  "], 0), 0);
  assert.equal(tasteScore([], [], 0), 0);
  assert.equal(
    tasteScore(["Osees"], ["Osees"], 0, { genresA: ["  "], genresB: [""] }),
    tasteScore(["Osees"], ["Osees"], 0),
  );
});

test("a genre everyone has weighs nothing; a genre one person has weighs most", () => {
  const random = generator(13);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const population = 2 + Math.floor(random() * 8);
    const corpus = Array.from({ length: population }, (_, index) =>
      index === 0 ? ["jazz", "hyperpop"] : ["jazz"],
    );
    const weights = genreWeights(corpus);
    assert.equal(weights.jazz, 0, "a genre on every profile carries no signal");
    assert.ok(weights.hyperpop > 0 && weights.hyperpop <= 1, JSON.stringify(weights));
    for (const weight of Object.values(weights)) {
      assert.ok(weight >= 0 && weight <= 1, JSON.stringify(weights));
    }
  }
});

test("a population of one cannot say what is rare", () => {
  assert.deepEqual(genreWeights([["jazz"]]), {});
  assert.deepEqual(genreWeights([]), {});
});

test("peer ranking keeps its promises whatever the input", () => {
  const random = generator(17);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const me = {
      artistNames: sample(random, 6),
      showIds: sample(random, 4),
      genres: sample(random, 4),
      venueNames: sample(random, 3),
      logCount: Math.floor(random() * 12),
    };
    const peers = Array.from({ length: Math.floor(random() * 6) }, (_, index) => ({
      handle: `peer-${index}`,
      avatarColor: "#fff",
      ...profiles(random),
    })).map((peer) => ({
      handle: peer.handle,
      avatarColor: peer.avatarColor,
      artistNames: peer.artists,
      showIds: sample(random, 4),
      genres: peer.genres,
      venueNames: peer.venues,
    }));

    const ranked = rankCompatiblePeers(me, peers, Math.floor(random() * 20));

    if (me.logCount < LOW_SIGNAL_SHOWS) {
      // The floor is absolute: no matches, and the caller is told why.
      assert.deepEqual(ranked, { lowSignal: true, matches: [] }, JSON.stringify(me));
      continue;
    }

    assert.equal(ranked.lowSignal, false);
    assert.ok(ranked.matches.length <= 10, "the cap is ten however big the limit");
    const percents = ranked.matches.map((match) => match.matchPercent);
    assert.deepEqual(percents, [...percents].sort((left, right) => right - left), "sorted by strength");
    for (const match of ranked.matches) {
      assert.ok(Number.isInteger(match.matchPercent), JSON.stringify(match));
      assert.ok(match.matchPercent > 0 && match.matchPercent <= 99, JSON.stringify(match));
      assert.ok(match.sharedArtistNames.length <= 5);
      assert.ok(match.sharedArtistCount >= match.sharedArtistNames.length);
    }
  }
});

test("nobody is a 140% match with anybody", () => {
  // Jaccard plus the shared-show bonus can pass 1.0, and a match over 100
  // reads as a bug to the person looking at it.
  const twin = {
    artistNames: ["Osees", "Beck"],
    showIds: ["a", "b", "c", "d", "e"],
    genres: ["punk"],
    venueNames: ["Thee Parkside"],
    logCount: 9,
  };
  const ranked = rankCompatiblePeers(twin, [{ handle: "twin", avatarColor: "#fff", ...twin }], 5);
  assert.equal(ranked.matches[0].matchPercent, 99);
});
