// Automated quality gate for the backfill matcher.
//
// These thresholds are the contract for "did phase 1 actually improve
// anything?" — they fail the build if match quality regresses, and they are the
// numbers quoted in the demo. Run `npm run eval` for the readable report.

import assert from "node:assert/strict";
import test from "node:test";

import { runEval } from "../eval/matchEval.mjs";
import { MIN_CONFIDENCE } from "../convex/backfillMatch.js";

const { results } = runEval();
const baseline = results["date-only"];
const gps = results.gps;

test("GPS matching beats the date-only baseline", () => {
  assert.equal(
    gps.overall.accuracy > baseline.overall.accuracy,
    true,
    `expected gps (${gps.overall.accuracy}) to beat date-only (${baseline.overall.accuracy})`,
  );
  assert.equal(gps.overall.accuracy >= 0.7, true, `accuracy ${gps.overall.accuracy} below 0.7`);
});

test("a crowded night is resolved, where date-only can only guess", () => {
  const crowded = gps.byScenario["crowded-night"];
  assert.equal(crowded.accuracy, 1, `crowded-night accuracy ${crowded.accuracy}`);
  // Five same-date shows, truth rotated through all five positions: guessing
  // the first one scores exactly 1/5.
  assert.equal(baseline.byScenario["crowded-night"].accuracy, 0.2);
});

test("never invents a match when the photos are across town", () => {
  // The precision guarantee: a wrong show in the diary is the one unacceptable
  // outcome, so this must stay at zero for the GPS matcher.
  assert.equal(gps.overall.falseMatches, 0);
  assert.equal(gps.byScenario["wrong-venue-guard"].falseMatches, 0);
  // The baseline had no way to know — this is the regression being fixed.
  assert.equal(baseline.byScenario["wrong-venue-guard"].falseMatches, 1);
});

test("nights with no catalog entry are declined by both strategies", () => {
  for (const result of [baseline, gps]) {
    assert.equal(result.byScenario["off-catalog"].falseMatches, 0);
    assert.equal(result.byScenario["off-catalog"].returned, 0);
  }
});

test("a crowded night stripped of GPS is declined rather than guessed", () => {
  const stripped = gps.byScenario["gps-stripped"];
  assert.equal(stripped.nights, 1);
  // Five same-date shows and no location to separate them. v1 guessed and got
  // it wrong; the honest answer is to return nothing and let the catalog-gap
  // agent look at the night.
  assert.equal(stripped.returned, 0);
  assert.equal(stripped.wrong, 0);
  assert.equal(stripped.missed, 1);
  assert.equal(baseline.byScenario["gps-stripped"].wrong, 1);
});

test("everything the matcher surfaces is right", () => {
  // Precision, not accuracy, is the promise this feature makes: it may not
  // explain every night, but it does not put wrong shows in diaries.
  assert.equal(gps.overall.precision, 1);
  assert.equal(gps.overall.wrong, 0);
  assert.equal(gps.overall.falseMatches, 0);
});

test("quiet nights are matched by both strategies", () => {
  assert.equal(baseline.byScenario["quiet-night"].accuracy, 1);
  assert.equal(gps.byScenario["quiet-night"].accuracy, 1);
});

test("every surfaced candidate is explainable and in range", () => {
  const surfaced = gps.rows.filter((row) => row.actualShowId);
  assert.equal(surfaced.length > 0, true);
  for (const row of surfaced) {
    assert.equal(row.confidence >= MIN_CONFIDENCE, true, `${row.clusterDate} below threshold`);
    assert.equal(row.confidence <= 0.99, true, `${row.clusterDate} above cap`);
    assert.equal(row.evidence.length >= 1, true, `${row.clusterDate} has no evidence`);
    for (const evidence of row.evidence) {
      assert.equal(typeof evidence.detail === "string" && evidence.detail.length > 0, true);
      assert.equal(Number.isFinite(evidence.delta), true);
    }
  }
});
