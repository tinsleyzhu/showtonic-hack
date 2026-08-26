import assert from "node:assert/strict";
import test from "node:test";

import { rankCompatiblePeers, tasteScore } from "../convex/tasteMath.js";

function profile(overrides = {}) {
  return {
    handle: "someone",
    avatarColor: "#000",
    homeCity: "San Francisco",
    artistNames: [],
    showIds: [],
    genres: [],
    venueNames: [],
    ...overrides,
  };
}

test("tasteScore rewards shared artists and same-show overlap", () => {
  const score = tasteScore(
    ["Charli XCX", "RÜFÜS DU SOL", "The Strokes"],
    ["RÜFÜS DU SOL", "The Strokes", "MUNA"],
    2,
  );

  assert.equal(score, 0.8);
});

test("tasteScore falls back to artist affinity when genres are sparse on either side", () => {
  const withOneSideMissingGenres = tasteScore(["A", "B"], ["A", "C"], 0, {
    genresA: [],
    genresB: ["house", "techno"],
  });
  const withNoOptions = tasteScore(["A", "B"], ["A", "C"], 0);

  assert.equal(withOneSideMissingGenres, withNoOptions);
});

test("tasteScore blends in genre affinity once both sides have genres", () => {
  const noArtistOverlapButSharedGenre = tasteScore(["A", "B"], ["C", "D"], 0, {
    genresA: ["house"],
    genresB: ["house"],
  });
  const pureArtist = tasteScore(["A", "B"], ["C", "D"], 0);

  assert.ok(noArtistOverlapButSharedGenre > pureArtist);
});

test("tasteScore uses venue affinity as a lighter-weight fallback signal", () => {
  const withSharedVenue = tasteScore(["A"], ["B"], 0, {
    venuesA: ["The Fillmore"],
    venuesB: ["The Fillmore"],
  });
  const withoutVenues = tasteScore(["A"], ["B"], 0);

  assert.ok(withSharedVenue > withoutVenues);
});

test("tasteScore never lets a one-sided missing signal zero out another signal", () => {
  const score = tasteScore(["A", "B"], ["A", "C"], 0, {
    genresA: ["house"],
    genresB: [],
    venuesA: [],
    venuesB: ["The Fillmore"],
  });

  assert.ok(score > 0);
});

test("rankCompatiblePeers refuses to rank strangers off a thin diary", () => {
  const me = profile({ artistNames: ["A", "B"], showIds: ["s1"], logCount: 4 });
  const peers = [profile({ handle: "twin", artistNames: ["A", "B"], showIds: ["s1"] })];

  const result = rankCompatiblePeers(me, peers);

  assert.equal(result.lowSignal, true);
  assert.deepEqual(result.matches, []);
});

test("rankCompatiblePeers ranks by match strength once the diary is deep enough", () => {
  const me = profile({ artistNames: ["A", "B", "C"], showIds: ["s1", "s2"], logCount: 6 });
  const peers = [
    profile({ handle: "stranger", artistNames: ["X", "Y"] }),
    profile({ handle: "twin", artistNames: ["A", "B", "C"], showIds: ["s1", "s2"] }),
    profile({ handle: "acquaintance", artistNames: ["A", "Z"] }),
  ];

  const result = rankCompatiblePeers(me, peers);

  assert.equal(result.lowSignal, false);
  assert.deepEqual(
    result.matches.map((match) => match.handle),
    ["twin", "acquaintance"],
  );
  assert.equal(result.matches[0].sharedShowCount, 2);
  assert.deepEqual(result.matches[0].sharedArtistNames, ["A", "B", "C"]);
});

test("rankCompatiblePeers clamps the displayed match and honours the limit", () => {
  const me = profile({ artistNames: ["A"], showIds: ["s1", "s2", "s3"], logCount: 8 });
  const peers = [
    profile({ handle: "twin", artistNames: ["A"], showIds: ["s1", "s2", "s3"] }),
    profile({ handle: "other", artistNames: ["A"] }),
  ];

  const result = rankCompatiblePeers(me, peers, 1);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].matchPercent, 99);
});
