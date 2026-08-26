// Human-readable eval report: `npm run eval`.
//
// Two scoreboards, one per layer:
//   1. Matching   — date-only baseline vs the GPS matcher, on nights the
//                   catalog can explain.
//   2. Catalog gap — naive top-result parsing vs evidence-gated proposals, on
//                   nights the catalog CANNOT explain.
//
// Both exist so a change in quality is a number you can see, not a vibe.

import { runEval } from "./matchEval.mjs";
import { runGapEval } from "./gapEval.mjs";

const percent = (value) => (value === null ? "  — " : `${(value * 100).toFixed(0).padStart(3)}%`);
const pad = (value, width) => String(value).padEnd(width);

function printOverall(results) {
  console.log("\nOVERALL");
  console.log(`  ${pad("strategy", 18)} ${"acc".padStart(5)} ${"prec".padStart(5)} correct wrong missed false-match`);
  for (const result of Object.values(results)) {
    const o = result.overall;
    console.log(
      `  ${pad(result.label, 18)} ${percent(o.accuracy)} ${percent(o.precision)}` +
        `   ${String(o.correct).padStart(4)}  ${String(o.wrong).padStart(4)}` +
        `  ${String(o.missed).padStart(5)} ${String(o.falseMatches).padStart(10)}`,
    );
  }
}

function printByScenario(results) {
  const strategies = Object.values(results);
  const scenarios = [...new Set(strategies.flatMap((r) => Object.keys(r.byScenario)))];
  console.log("\nBY SCENARIO (accuracy · false matches)");
  console.log(`  ${pad("scenario", 20)} ${strategies.map((s) => pad(s.strategy, 16)).join(" ")}`);
  for (const scenario of scenarios) {
    const cells = strategies.map((result) => {
      const tally = result.byScenario[scenario];
      if (!tally) return pad("—", 16);
      const acc = tally.expected ? percent(tally.accuracy) : "  n/a";
      return pad(`${acc}  fm:${tally.falseMatches}`, 16);
    });
    console.log(`  ${pad(scenario, 20)} ${cells.join(" ")}`);
  }
}

function printMisses(result) {
  const misses = result.rows.filter(
    (row) => row.outcome === "wrong" || row.outcome === "missed" || row.outcome === "false-match",
  );
  if (!misses.length) {
    console.log(`\n${result.label}: no wrong answers.`);
    return;
  }
  console.log(`\n${result.label} — nights to look at:`);
  for (const row of misses) {
    console.log(
      `  ${row.clusterDate}  ${pad(row.scenario, 20)} ${pad(row.outcome, 12)}` +
        ` expected=${row.expectedShowId ?? "none"} got=${row.actualShowId ?? "none"}`,
    );
  }
}

function printEvidenceSample(result) {
  const sample = result.rows.find((row) => row.evidence.length > 1);
  if (!sample) return;
  console.log(`\nEvidence sample — ${sample.clusterDate} (${percent(sample.confidence)} confident):`);
  for (const row of sample.evidence) {
    const delta = `${row.delta > 0 ? "+" : ""}${Math.round(row.delta * 100)}%`;
    console.log(`  ${pad(row.kind, 8)} ${pad(row.detail, 52)} ${delta.padStart(5)}`);
  }
}

// --- Catalog-gap agent ------------------------------------------------------

function printGapOverall(results) {
  console.log("\nOVERALL");
  console.log(
    `  ${pad("strategy", 20)} ${"acc".padStart(5)} ${"prec".padStart(5)} ${"refused".padStart(8)} proposed correct false-proposal`,
  );
  for (const result of Object.values(results)) {
    const o = result.overall;
    console.log(
      `  ${pad(result.label, 20)} ${percent(o.accuracy)} ${percent(o.precision)} ${percent(o.refusalRate).padStart(8)}` +
        `  ${String(o.proposals).padStart(7)} ${String(o.correct).padStart(7)} ${String(o.falseProposals).padStart(14)}`,
    );
  }
}

function printGapRows(result) {
  console.log(`\n${result.label} — every night, and what it proposed:`);
  for (const row of result.rows) {
    const got = row.actual ? row.actual.join(" + ") : "—";
    console.log(
      `  ${row.clusterDate}  ${pad(row.scenario, 22)} ${pad(row.outcome, 19)}` +
        ` expected=${pad(row.expected ? row.expected.join(" + ") : "nothing", 18)} got=${got}`,
    );
  }
}

const { results } = runEval();
console.log("Showtonic — backfill match quality");
printOverall(results);
printByScenario(results);
printMisses(results.gps);
printEvidenceSample(results.gps);

console.log("\n\nShowtonic — catalog-gap agent (nights the catalog cannot explain)");
const gap = runGapEval().results;
printGapOverall(gap);
printGapRows(gap.evidenced);
// The baseline is worth printing in full: its failures are the specific
// mistakes the evidence gate exists to prevent, and they are not abstract.
const naiveFailures = gap.naive.rows.filter((row) => row.outcome === "false-proposal");
if (naiveFailures.length) {
  console.log(`\n${gap.naive.label} — what it would have put in the catalog:`);
  for (const row of naiveFailures) {
    console.log(`  ${row.clusterDate}  ${pad(row.scenario, 22)} "${row.actual.join(" + ")}"`);
  }
}
console.log("");
