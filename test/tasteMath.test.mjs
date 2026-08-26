import assert from "node:assert/strict";
import test from "node:test";

import { tasteScore } from "../convex/tasteMath.js";

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
