// Catalog-gap agent quality eval.
//
// The matcher's eval (./matchEval.mjs) asks "did we put the right show in the
// diary?". This one asks the harder question one layer down: when the catalog
// has no answer at all, does searching the web produce a claim worth showing a
// human — or a plausible invention?
//
// Two strategies run over the same labeled nights:
//
//   naive     what an agent does with no evidence gate: take the top result,
//             read the artist off its title, propose it. This is the honest
//             baseline, because it is what "just ask the model" looks like.
//   evidenced the shipped path — a result counts only if it names this night
//             AND this room, and two sources naming different headliners
//             cancel each other out.
//
// The number that matters is `falseProposals`. A wrong show in one person's
// diary is bad; a wrong show in the CATALOG is wrong for everyone who matches
// against it afterwards, so the bar here is higher than the matcher's.

import { extractArtistNames, proposeFromResults } from "../convex/catalogGapUtils.js";
import { NIGHTS } from "./gapFixtures.mjs";

// The baseline agent: first result wins, no verification of any kind.
function naivePropose(night) {
  const top = night.results?.[0];
  if (!top) return null;
  const artistNames = extractArtistNames(top.title, night.anchorVenue);
  if (!artistNames.length) {
    // Even the naive agent cannot invent a name from nothing — it falls back
    // to the raw title, which is exactly the failure mode being measured.
    const fallback = String(top.title ?? "").trim();
    if (!fallback) return null;
    return { artistNames: [fallback], sourceUrl: top.url ?? "" };
  }
  return { artistNames, sourceUrl: top.url ?? "" };
}

function evidencedPropose(night) {
  const { proposal } = proposeFromResults(
    { clusterDate: night.clusterDate, city: night.city, anchorVenue: night.anchorVenue },
    night.results,
  );
  return proposal;
}

const STRATEGIES = {
  naive: { label: "naive (top result)", propose: naivePropose },
  evidenced: { label: "evidence-gated", propose: evidencedPropose },
};

function sameLineup(left, right) {
  const key = (names) =>
    (names ?? [])
      .map((name) => String(name).toLowerCase().trim())
      .sort()
      .join("|");
  return key(left) === key(right);
}

function emptyTally() {
  return {
    nights: 0,
    // Nights where a proposal was the right answer.
    answerable: 0,
    correct: 0,
    wrong: 0, // proposed, but the wrong lineup for an answerable night
    missed: 0, // answerable, proposed nothing
    // Nights where proposing anything at all is the failure.
    unanswerable: 0,
    falseProposals: 0,
    declined: 0,
    proposals: 0,
  };
}

function withRates(tally) {
  return {
    ...tally,
    accuracy: tally.answerable ? tally.correct / tally.answerable : null,
    // Of everything we proposed, how much was true? Wrong lineups and false
    // proposals both count against it.
    precision: tally.proposals ? tally.correct / tally.proposals : null,
    // Did we correctly keep quiet when the web could not explain the night?
    refusalRate: tally.unanswerable
      ? (tally.unanswerable - tally.falseProposals) / tally.unanswerable
      : null,
  };
}

function runStrategy(strategyKey, nights = NIGHTS) {
  const strategy = STRATEGIES[strategyKey];
  const overall = emptyTally();
  const byScenario = new Map();
  const rows = [];

  for (const night of nights) {
    const proposal = strategy.propose(night);
    const scenario = byScenario.get(night.scenario) ?? emptyTally();
    scenario.nights += 1;
    overall.nights += 1;
    if (proposal) {
      scenario.proposals += 1;
      overall.proposals += 1;
    } else {
      scenario.declined += 1;
      overall.declined += 1;
    }

    let outcome;
    if (night.expectedArtists) {
      scenario.answerable += 1;
      overall.answerable += 1;
      if (!proposal) {
        outcome = "missed";
        scenario.missed += 1;
        overall.missed += 1;
      } else if (sameLineup(proposal.artistNames, night.expectedArtists)) {
        outcome = "correct";
        scenario.correct += 1;
        overall.correct += 1;
      } else {
        outcome = "wrong";
        scenario.wrong += 1;
        overall.wrong += 1;
      }
    } else {
      scenario.unanswerable += 1;
      overall.unanswerable += 1;
      if (proposal) {
        outcome = "false-proposal";
        scenario.falseProposals += 1;
        overall.falseProposals += 1;
      } else {
        outcome = "correctly-declined";
      }
    }

    byScenario.set(night.scenario, scenario);
    rows.push({
      scenario: night.scenario,
      clusterDate: night.clusterDate,
      expected: night.expectedArtists,
      actual: proposal?.artistNames ?? null,
      sourceUrl: proposal?.sourceUrl ?? null,
      confidence: proposal?.confidence ?? null,
      outcome,
    });
  }

  return {
    strategy: strategyKey,
    label: strategy.label,
    overall: withRates(overall),
    byScenario: Object.fromEntries(
      [...byScenario.entries()].map(([name, tally]) => [name, withRates(tally)]),
    ),
    rows,
  };
}

function runGapEval(nights = NIGHTS) {
  return {
    nights,
    results: Object.fromEntries(
      Object.keys(STRATEGIES).map((key) => [key, runStrategy(key, nights)]),
    ),
  };
}

export { STRATEGIES, runGapEval, runStrategy };
