// Automated quality gate for festival lineups.
//
// Same contract as test/gapEval.test.mjs, one shape over: these thresholds fail
// the build if the day model regresses, and they are the numbers quoted in the
// demo. `npm run eval` prints the readable version.
//
// The fixtures are real captured search results, not hand-written ones — the
// venue-night eval reported 100% precision right up until production showed it
// a Facebook caption, and the lesson stuck.

import assert from "node:assert/strict";
import test from "node:test";

import { runFestivalEval } from "../eval/festivalEval.mjs";

const { results } = runFestivalEval();
const wholePage = results.wholePage;
const dayGated = results.dayGated;

test("no act is placed on a day the festival says it did not play", () => {
  // The claim a festival proposal makes is about a DAY. Getting the act right
  // and the day wrong is still a wrong show in the shared catalog, and it is
  // the one error a human reading the proposal cannot catch.
  assert.equal(dayGated.overall.misplaced, 0);
});

test("no act is claimed on two days of the same festival", () => {
  // Visible without an answer key at all: one act, one day, one bill.
  assert.equal(dayGated.overall.collisions, 0);
});

test("the day model still recovers the bill it is cutting up", () => {
  // Refusing everything would also score zero misplaced acts. This is the test
  // that stops that being the answer.
  assert.equal(dayGated.overall.daysWithBill, 3);
  assert.equal(dayGated.overall.recall >= 0.9, true);
  assert.equal(dayGated.overall.acts >= 60, true);
});

test("reading the page whole is the thing being fixed, and it is bad", () => {
  // No day model: every name on every page lands on whichever day was searched
  // for. It finds every headliner — and puts most of them on the wrong day too.
  assert.equal(wholePage.overall.recall, 1);
  assert.equal(wholePage.overall.misplaced >= 20, true);
  assert.equal(wholePage.overall.collisions >= 100, true);
});

test("the gate cuts the bill down, not the festival out", () => {
  // Six times fewer acts, and the ones removed are the ones no source placed
  // on this day rather than the ones that were hard to parse.
  assert.equal(dayGated.overall.acts < wholePage.overall.acts / 3, true);
  assert.equal(dayGated.overall.headlinersFound >= 14, true);
});
