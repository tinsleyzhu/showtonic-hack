#!/usr/bin/env node
// Prove the merge plan against a snapshot export, with zero deployment and
// zero writes. `npx convex export` produces the directory this reads.
//
//   node scripts/dedup-plan.mjs <unzipped-export-dir> [--samples 20]
//
// The point is that the numbers posted to TEAM.md before the live run are
// produced by the SAME pure functions the live run uses.

import fs from "node:fs";
import path from "node:path";

import {
  showKey,
  artistKey,
  venueKey,
  planShowMerge,
  planArtistMerge,
  planVenueMerge,
  planDeduplication,
  planVenueAliasDeduplication,
} from "../convex/dedupUtils.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/dedup-plan.mjs <unzipped-export-dir> [--samples N]");
  process.exit(1);
}
const sampleFlag = process.argv.indexOf("--samples");
const sampleCount = sampleFlag > -1 ? Number(process.argv[sampleFlag + 1]) : 20;

const read = (table) => {
  const file = path.join(dir, table, "documents.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
};

const shows = read("shows");
const artists = read("artists");
const venues = read("venues");

const plans = {
  shows: planDeduplication(shows, { keyFn: showKey, mergeFn: planShowMerge }),
  artists: planDeduplication(artists, { keyFn: artistKey, mergeFn: planArtistMerge }),
  venues: planDeduplication(venues, { keyFn: venueKey, mergeFn: planVenueMerge }),
};

const totals = { shows: shows.length, artists: artists.length, venues: venues.length };

console.log("MERGE PLAN (dry run — nothing written)\n");
for (const [table, plan] of Object.entries(plans)) {
  const pct = totals[table] ? ((plan.excessRows / totals[table]) * 100).toFixed(1) : "0.0";
  console.log(
    `${table.padEnd(8)} ${String(totals[table]).padStart(6)} rows · ` +
      `${String(plan.groupCount).padStart(5)} groups · ` +
      `${String(plan.excessRows).padStart(5)} excess (${pct}%) · ` +
      `${String(totals[table] - plan.excessRows).padStart(6)} after`,
  );
}

// The patch counts matter as much as the deletions: they are the evidence that
// merging ADDS information to the survivor rather than only removing rows.
console.log("\nWhat survivors absorb:");
for (const [table, plan] of Object.entries(plans)) {
  const patched = plan.merges.filter((merge) => Object.keys(merge.patch).length > 0);
  const fields = {};
  for (const merge of patched) {
    for (const field of Object.keys(merge.patch)) fields[field] = (fields[field] ?? 0) + 1;
  }
  const summary = Object.entries(fields)
    .sort((left, right) => right[1] - left[1])
    .map(([field, count]) => `${field} ${count}`)
    .join(", ");
  console.log(`${table.padEnd(8)} ${patched.length} survivors gain fields${summary ? ": " + summary : ""}`);
}

for (const [table, plan] of Object.entries(plans)) {
  const samples = [...plan.merges]
    .sort((left, right) => right.duplicateIds.length - left.duplicateIds.length)
    .slice(0, sampleCount);
  console.log(`\n${table.toUpperCase()} — ${samples.length} widest groups`);
  for (const sample of samples) {
    const gained = Object.keys(sample.patch);
    console.log(
      `  x${sample.duplicateIds.length + 1}  ${sample.key}` +
        (gained.length ? `   +[${gained.join(" ")}]` : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — venue aliases on the show key
// ---------------------------------------------------------------------------

const alias = planVenueAliasDeduplication(shows);
console.log(
  `\nPASS 2 (venue aliases)  ${alias.groupCount} clusters · ${alias.excessRows} excess · ` +
    `${shows.length - alias.excessRows} after · ${alias.untimedAttached} untimed rows attached`,
);

const samples = alias.merges.slice(0, sampleCount);
for (const sample of samples) {
  console.log(`  x${sample.duplicateIds.length + 1}  ${sample.key}`);
}
