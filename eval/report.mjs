// Human-readable eval report: `npm run eval`.
//
// Two scoreboards, one per layer:
//   1. Matching   — date-only baseline vs the GPS matcher, on nights the
//                   catalog can explain.
//   2. Catalog gap — naive top-result parsing vs evidence-gated proposals, on
//                   nights the catalog CANNOT explain.
//   3. Festivals   — reading a lineup page whole vs cutting it into days, where
//                   the error to measure is a real act on the wrong day.
//
// They exist so a change in quality is a number you can see, not a vibe.

import { runEval } from "./matchEval.mjs";
import { runGapEval } from "./gapEval.mjs";
import { runFestivalEval } from "./festivalEval.mjs";

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
    // Quoted per name: "Bolly + House Day Party" as one name and as two look
    // identical when joined, which hid a real failure once.
    const show = (names) => (names ? names.map((name) => `"${name}"`).join(" + ") : "—");
    const got = show(row.actual);
    console.log(
      `  ${row.clusterDate}  ${pad(row.scenario, 22)} ${pad(row.outcome, 19)}` +
        ` expected=${pad(show(row.expected), 26)} got=${got}`,
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

// --- Festivals --------------------------------------------------------------

console.log("\n\nShowtonic — festival lineups (one bill per day, not sixty shows)");
const festival = runFestivalEval().results;
console.log("\nOVERALL");
console.log(
  `  ${pad("strategy", 26)} ${"days".padStart(5)} ${"acts".padStart(6)} ${"recall".padStart(7)}` +
    ` ${"wrong day".padStart(10)} ${"two days".padStart(9)}`,
);
for (const result of Object.values(festival)) {
  const o = result.overall;
  console.log(
    `  ${pad(result.label, 26)} ${String(`${o.daysWithBill}/${o.days}`).padStart(5)}` +
      ` ${String(o.acts).padStart(6)} ${percent(o.recall).padStart(7)}` +
      ` ${String(o.misplaced).padStart(10)} ${String(o.collisions).padStart(9)}`,
  );
}
console.log(`\n${festival.dayGated.label} — every day, and what it billed:`);
for (const row of festival.dayGated.rows) {
  console.log(
    `  ${row.date}  ${String(row.acts).padStart(3)} acts` +
      `  headliners ${row.found}/${row.expected}  wrong-day ${row.misplaced.length}` +
      `  ${percent(row.confidence)}  ${row.sourceUrl ?? "—"}`,
  );
}
const strayed = festival.wholePage.rows.flatMap((row) =>
  row.misplaced.map((act) => `${row.date}  "${act}"`),
);
if (strayed.length) {
  console.log(`\n${festival.wholePage.label} — acts it would have put on the wrong day:`);
  for (const line of strayed.slice(0, 12)) console.log(`  ${line}`);
  if (strayed.length > 12) console.log(`  … and ${strayed.length - 12} more`);
}
console.log("");
