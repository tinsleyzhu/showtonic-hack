import assert from "node:assert/strict";
import test from "node:test";

import { genresForLineup, resolveChosenLineup } from "../convex/lineupUtils.js";

const DAY_BILL = ["Jamie xx", "The Strokes", "Romy"];

// --- resolveChosenLineup ------------------------------------------------------

test("the seeded full bill round-trips unchanged", () => {
  assert.deepEqual(resolveChosenLineup(DAY_BILL, ["Jamie xx", "The Strokes", "Romy"]), [
    "Jamie xx",
    "The Strokes",
    "Romy",
  ]);
});

test("a subset keeps the bill's order regardless of tap order", () => {
  assert.deepEqual(resolveChosenLineup(DAY_BILL, ["Romy", "Jamie xx"]), ["Jamie xx", "Romy"]);
});

test("act names match case-insensitively; the log keeps the bill's spellings", () => {
  assert.deepEqual(resolveChosenLineup(DAY_BILL, ["  jamie XX ", "ROMY"]), ["Jamie xx", "Romy"]);
});

test("an act that is not on the day's bill is a thrown data error", () => {
  assert.throws(() => resolveChosenLineup(DAY_BILL, ["Fred again.."]), /not on this festival day's bill/);
});

test("a lineup-less festival accept is refused", () => {
  assert.throws(() => resolveChosenLineup(DAY_BILL, []), /Choose at least one act/);
  assert.throws(() => resolveChosenLineup(DAY_BILL, undefined), /Choose at least one act/);
});

test("a festival night with no bill has nothing to choose", () => {
  assert.throws(() => resolveChosenLineup([], ["Jamie xx"]), /no lineup to choose from/);
});

test("duplicates collapse to one entry", () => {
  assert.deepEqual(resolveChosenLineup(DAY_BILL, ["Jamie xx", "Jamie xx"]), ["Jamie xx"]);
});

// --- genresForLineup ----------------------------------------------------------

const ARTISTS = [
  { name: "Jamie xx", genres: ["electronic", "house"] },
  { name: "The Strokes", genres: ["indie rock"] },
  { name: "Romy", genres: ["house", "pop"] },
  null,
];

test("genres narrow to exactly the chosen acts, deduplicated in order", () => {
  assert.deepEqual(genresForLineup(ARTISTS, ["Jamie xx", "Romy"]), [
    "electronic",
    "house",
    "pop",
  ]);
});

test("no lineup choice means no narrowing (null chosen)", () => {
  assert.deepEqual(genresForLineup(ARTISTS, null), []);
});

test("unknown act names contribute no genres", () => {
  assert.deepEqual(genresForLineup(ARTISTS, ["Fred again.."]), []);
});
