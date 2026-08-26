// Automated quality gate for the catalog-gap agent.
//
// Same contract as test/matchEval.test.mjs one layer down: these thresholds
// fail the build if proposal quality regresses, and they are the numbers
// quoted in the demo. Run `npm run eval` for the readable report.

import assert from "node:assert/strict";
import test from "node:test";

import { runGapEval } from "../eval/gapEval.mjs";

const { results } = runGapEval();
const naive = results.naive;
const evidenced = results.evidenced;

test("the evidence gate never puts an invented show in the catalog", () => {
  // The whole reason the feature has a threshold. A wrong show in one diary is
  // recoverable; a wrong show in the CATALOG is wrong for every user who
  // matches against it afterwards.
  assert.equal(evidenced.overall.falseProposals, 0);
  assert.equal(evidenced.overall.refusalRate, 1);
});

test("gating costs nothing on the nights the web can actually explain", () => {
  // Refusing everything would also score zero false proposals. This is the
  // test that stops that being the answer.
  assert.equal(evidenced.overall.accuracy, 1);
  assert.equal(evidenced.overall.correct >= 3, true);
});

test("every proposal that is made is right", () => {
  assert.equal(evidenced.overall.precision, 1);
});

test("the naive baseline is the thing being fixed, and it is bad", () => {
  // Top-result-wins is what an agent does without an evidence gate. It gets
  // the easy nights right too — the difference is entirely in the refusals.
  assert.equal(naive.overall.accuracy, 1);
  assert.equal(naive.overall.falseProposals >= 6, true);
  assert.equal(
    evidenced.overall.precision > naive.overall.precision,
    true,
    `expected evidence gate (${evidenced.overall.precision}) to beat naive (${naive.overall.precision})`,
  );
});

test("a listing from the same room in the wrong year is refused", () => {
  // The single most likely way to put a plausible lie in the catalog.
  assert.equal(evidenced.byScenario["gap-wrong-year"].falseProposals, 0);
  assert.equal(naive.byScenario["gap-wrong-year"].falseProposals, 1);
});

test("sources that disagree about the headliner cancel out", () => {
  assert.equal(evidenced.byScenario["gap-contested"].falseProposals, 0);
});

test("a city-wide night with no GPS proposes nothing", () => {
  // A show that happened somewhere in San Francisco is not evidence that this
  // person attended it.
  assert.equal(evidenced.byScenario["gap-no-gps"].falseProposals, 0);
});

test("a lookalike ticketing domain earns no credibility boost", () => {
  assert.equal(evidenced.byScenario["gap-lookalike-domain"].falseProposals, 0);
});

test("a multi-artist bill keeps both names", () => {
  const row = evidenced.rows.find((entry) => entry.scenario === "gap-multi-artist");
  assert.deepEqual(row.actual, ["Overmono", "Salute"]);
});

test("every proposal carries the URL it came from", () => {
  const proposals = evidenced.rows.filter((row) => row.actual);
  assert.equal(proposals.length > 0, true);
  for (const row of proposals) {
    assert.match(row.sourceUrl, /^https?:\/\//, `${row.scenario} has no source URL`);
  }
});
