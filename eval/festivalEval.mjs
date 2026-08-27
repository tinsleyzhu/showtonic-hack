// Festival lineup quality eval.
//
// gapEval.mjs asks "when the catalog cannot explain one night, is the web's
// answer worth showing a human?". This asks the same question about a festival,
// where the shape of the mistake is different and worse.
//
// A venue night has one bill. A festival page has sixty acts spread over three
// days, and every one of them is a plausible-looking claim about every one of
// those days. The failure to measure is therefore not "did we invent an act" —
// the names are real — it is **did we put a real act on the wrong day**. That
// claim carries a real URL, reads as sourced, and no human looking at the
// proposal can tell it is wrong.
//
// Two strategies over the same real search results:
//
//   whole-page  what an agent does with no day model: every result that names
//               the festival, every name on the page, all attributed to the day
//               it was searching for. This is what "just ask the model to read
//               the lineup" produces.
//   day-gated   the shipped path — the page must name this day, the bill is cut
//               out of that day's section only, and an act needs an
//               authoritative source or a second publisher to make it.

import { harvestBillNames, mentionsFestival, proposeFestivalDay } from "../convex/catalogGapUtils.js";
import { FESTIVAL_DAYS } from "./festivalFixtures.mjs";

// The baseline: no day segmentation, no corroboration, no social rule.
function wholePagePropose(day) {
  const names = [];
  for (const result of day.results) {
    const text = `${result.title} ${result.content}`;
    if (!mentionsFestival(text, day.festivalName)) continue;
    for (const name of harvestBillNames(text, { festivalName: day.festivalName })) {
      if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  return names.length ? { artistNames: names, sourceUrl: day.results[0]?.url ?? "" } : null;
}

function dayGatedPropose(day) {
  const { proposal } = proposeFestivalDay(day, day.results);
  return proposal;
}

const STRATEGIES = {
  wholePage: { label: "whole-page (no day model)", propose: wholePagePropose },
  dayGated: { label: "day-gated (shipped)", propose: dayGatedPropose },
};

// Names are compared loosely because publishers case and punctuate them freely:
// "Charli XCX", "Charli xcx" and "charli xcx" are one act.
function normalize(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesAct(names, act) {
  return (names ?? []).some((name) => normalize(name) === normalize(act));
}

function runStrategy(strategyKey, days = FESTIVAL_DAYS) {
  const strategy = STRATEGIES[strategyKey];
  const rows = [];
  const overall = {
    days: days.length,
    daysWithBill: 0,
    acts: 0,
    // Of the acts the festival itself names for this day, how many did we get?
    headlinersExpected: 0,
    headlinersFound: 0,
    // The number that decides whether this ships: acts placed on a day the
    // festival says they did not play.
    misplaced: 0,
    // The same act claimed on two different days of one festival — visible
    // without any answer key, and always wrong for a single-stage lineup.
    collisions: 0,
  };

  const seen = new Map();
  for (const day of days) {
    const proposal = strategy.propose(day);
    const names = proposal?.artistNames ?? [];
    if (proposal) overall.daysWithBill += 1;
    overall.acts += names.length;
    overall.headlinersExpected += day.expectedActs.length;

    const found = day.expectedActs.filter((act) => includesAct(names, act));
    const misplaced = day.forbiddenActs.filter((act) => includesAct(names, act));
    overall.headlinersFound += found.length;
    overall.misplaced += misplaced.length;

    for (const name of names) {
      const key = normalize(name);
      seen.set(key, [...(seen.get(key) ?? []), day.date]);
    }

    rows.push({
      date: day.date,
      acts: names.length,
      found: found.length,
      expected: day.expectedActs.length,
      misplaced,
      confidence: proposal?.confidence ?? null,
      sourceUrl: proposal?.sourceUrl ?? null,
    });
  }

  overall.collisions = [...seen.values()].filter((dates) => dates.length > 1).length;
  return {
    strategy: strategyKey,
    label: strategy.label,
    overall: {
      ...overall,
      recall: overall.headlinersExpected ? overall.headlinersFound / overall.headlinersExpected : null,
      // Of every act placed, how many are known to be on the wrong day? This is
      // a floor on the error rate, not the error rate: the answer key only
      // covers the acts the festival named itself.
      knownWrongRate: overall.acts ? overall.misplaced / overall.acts : null,
    },
    rows,
  };
}

function runFestivalEval(days = FESTIVAL_DAYS) {
  return {
    days,
    results: Object.fromEntries(
      Object.keys(STRATEGIES).map((key) => [key, runStrategy(key, days)]),
    ),
  };
}

export { STRATEGIES, runFestivalEval, runStrategy };
