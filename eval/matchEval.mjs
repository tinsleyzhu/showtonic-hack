// Backfill match-quality eval.
//
// Unit tests prove the matcher does what it says; this measures whether it is
// any GOOD. It runs the labeled fixtures through two strategies — `date-only`
// (v1: what shipped at Outside Lands) and `gps` (the evidence-fleet matcher) —
// and reports accuracy, false matches, and coverage per scenario.
//
// Consumed two ways:
//   npm test     → test/matchEval.test.mjs asserts the thresholds
//   npm run eval → eval/report.mjs prints the comparison table
//
// It lives outside test/ on purpose: `node --test` executes everything under
// test/**, and the report prints on import.
//
// A false match is worse than a miss: a wrong show in someone's diary is the
// one outcome that makes the feature untrustworthy. `falseMatches` is the
// number to watch, not accuracy alone.

import { clusterPhotosIntoNights, matchClustersToShows } from "../convex/backfillMatch.js";
import { buildFixtures } from "./fixtures.mjs";

function omit(source, keys) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}

// v1 saw neither photo GPS nor venue coordinates. Simulate it by removing both
// from the inputs — the engine itself is never branched on strategy.
const STRATEGIES = {
  "date-only": {
    label: "date-only (v1)",
    photos: (photos) => photos.map((photo) => omit(photo, ["latitude", "longitude"])),
    shows: (shows) => shows.map((show) => omit(show, ["venueLatitude", "venueLongitude"])),
  },
  gps: {
    label: "gps + evidence",
    photos: (photos) => photos,
    shows: (shows) => shows,
  },
};

function emptyTally() {
  return { nights: 0, expected: 0, correct: 0, wrong: 0, missed: 0, falseMatches: 0, returned: 0 };
}

function tallyRates(tally) {
  return {
    ...tally,
    // Of the nights that HAVE a right answer, how many did we get right?
    accuracy: tally.expected ? tally.correct / tally.expected : null,
    // Of the candidates we surfaced, how many were right? (Wrong ones and
    // false matches both count against this.)
    precision: tally.returned ? tally.correct / tally.returned : null,
    coverage: tally.expected ? (tally.correct + tally.wrong) / tally.expected : null,
  };
}

function runStrategy(strategyKey, fixtures) {
  const strategy = STRATEGIES[strategyKey];
  const shows = strategy.shows(fixtures.shows);
  const overall = emptyTally();
  const byScenario = new Map();
  const rows = [];

  for (const night of fixtures.nights) {
    const clusters = clusterPhotosIntoNights(strategy.photos(night.photos));
    const candidates = matchClustersToShows(clusters, shows, { today: fixtures.today });
    const candidate = candidates.find((entry) => entry.clusterDate === night.clusterDate) ?? null;

    const scenario = byScenario.get(night.scenario) ?? emptyTally();
    scenario.nights += 1;
    overall.nights += 1;

    let outcome;
    if (night.expectedShowId) {
      scenario.expected += 1;
      overall.expected += 1;
      if (!candidate) {
        outcome = "missed";
        scenario.missed += 1;
        overall.missed += 1;
      } else if (candidate.showId === night.expectedShowId) {
        outcome = "correct";
        scenario.correct += 1;
        overall.correct += 1;
      } else {
        outcome = "wrong";
        scenario.wrong += 1;
        overall.wrong += 1;
      }
    } else if (candidate) {
      // No right answer existed, and we offered one anyway.
      outcome = "false-match";
      scenario.falseMatches += 1;
      overall.falseMatches += 1;
    } else {
      outcome = "correctly-declined";
    }

    if (candidate) {
      scenario.returned += 1;
      overall.returned += 1;
    }
    byScenario.set(night.scenario, scenario);

    rows.push({
      scenario: night.scenario,
      clusterDate: night.clusterDate,
      expectedShowId: night.expectedShowId,
      actualShowId: candidate?.showId ?? null,
      confidence: candidate?.confidence ?? null,
      evidence: candidate?.evidence ?? [],
      outcome,
    });
  }

  return {
    strategy: strategyKey,
    label: strategy.label,
    overall: tallyRates(overall),
    byScenario: Object.fromEntries(
      [...byScenario.entries()].map(([name, tally]) => [name, tallyRates(tally)]),
    ),
    rows,
  };
}

function runEval(fixtures = buildFixtures()) {
  return {
    fixtures,
    results: Object.fromEntries(
      Object.keys(STRATEGIES).map((key) => [key, runStrategy(key, fixtures)]),
    ),
  };
}

export { STRATEGIES, runEval, runStrategy };
