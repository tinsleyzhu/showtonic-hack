// Measure the catalog-gap agent against festivals: how much of a real
// festival's day-by-day bill can it recover, and does it ever put one day's
// acts on another day?
//
//   node scripts/sweep-festival.mjs "Outside Lands" "San Francisco" 2026-08-07 2026-08-09
//   node scripts/sweep-festival.mjs "Outside Lands" "San Francisco" 2026-08-07 2026-08-09 --dry-run
//   node scripts/sweep-festival.mjs "Portola" "San Francisco" 2026-09-19 2026-09-20 --venue "Pier 80"
//
// Same shape as scripts/sweep-history.mjs, and for the same reason: it talks to
// Tavily directly and to Convex not at all, so it measures the shipped scorer
// (`convex/catalogGapUtils.js`) without a deployment and without touching any
// shared state.
//
// The unit is a DAY, not a set. That is the SPEC decision ("a festival is one
// thing, not sixty") expressed as a job: each day produces one bill.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CREDITS_PER_ADVANCED_SEARCH,
  buildFestivalQueries,
  eachNightInRange,
  estimateSweepCredits,
  proposeFestivalDay,
} from "../convex/catalogGapUtils.js";

const run = promisify(execFile);
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const PAUSE_MS = 600; // Tavily free tier is ~2 req/s
const MAX_DAYS = 14; // no festival runs longer, and a typo should not cost 60 searches

// The key lives in Convex env, never in this repo. Read into memory, never
// printed — not in logs, not in errors, not on failure.
async function tavilyKey() {
  if (process.env.TAVILY_API_KEY) return process.env.TAVILY_API_KEY.trim();
  const here = new URL("..", import.meta.url).pathname;
  for (const cwd of [here, `${here}/../showtonic-hack`]) {
    try {
      const { stdout } = await run("npx", ["convex", "env", "get", "TAVILY_API_KEY"], { cwd });
      const value = stdout.trim();
      if (/^tvly-/.test(value)) return value;
    } catch {
      /* try the next checkout */
    }
  }
  return null;
}

function shiftDate(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

async function search(apiKey, query, date) {
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: 8,
      start_date: shiftDate(date, -400),
      end_date: shiftDate(date, 30),
      include_usage: true,
    }),
  });
  // Deliberately does not echo the request: the Authorization header is in it.
  if (!response.ok) throw new Error(`Tavily returned ${response.status}`);
  const payload = await response.json();
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    credits: payload.usage?.credits ?? CREDITS_PER_ADVANCED_SEARCH,
  };
}

const [festivalName, city, from, to, ...flags] = process.argv.slice(2);
if (!festivalName || !city || !from || !to) {
  console.error(
    'Usage: node scripts/sweep-festival.mjs "<festival>" "<city>" <from ISO> <to ISO> [--venue "<grounds>"] [--dry-run] [--verbose]',
  );
  process.exit(1);
}
const dryRun = flags.includes("--dry-run");
const verbose = flags.includes("--verbose");
const venueFlag = flags.indexOf("--venue");
const venueName = venueFlag >= 0 ? flags[venueFlag + 1] : undefined;
// Two queries per day is the default; one is half the bill and half the price.
const queriesPerDay = flags.includes("--one-query") ? 1 : 2;

const days = eachNightInRange(from, to).slice(0, MAX_DAYS);
if (!days.length) {
  console.error(`No days in range ${from}..${to}`);
  process.exit(1);
}

console.log(`\nFestival lineup sweep — ${festivalName}, ${city}`);
console.log(`  range   ${from} .. ${to}  (${days.length} days)`);
console.log(`  budget  ~${estimateSweepCredits(days.length, queriesPerDay)} Tavily credits`);
if (dryRun) {
  console.log("  dry run — nothing searched, nothing spent.\n");
  for (const { query } of buildFestivalQueries({ festivalName, city, date: days[0] }).slice(0, queriesPerDay)) {
    console.log(`  would ask: ${query}`);
  }
  console.log("");
  process.exit(0);
}

const apiKey = await tavilyKey();
if (!apiKey) {
  console.error(
    "\nNo TAVILY_API_KEY. Set it in the environment, or run where `npx convex env get` works.\n",
  );
  process.exit(1);
}

const bills = [];
const declined = [];
let credits = 0;

for (const [index, day] of days.entries()) {
  if (index) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  const queries = buildFestivalQueries({ festivalName, city, date: day }).slice(0, queriesPerDay);
  // One day's evidence is pooled across its queries before it is scored: two
  // searches that each find one publisher are exactly the corroboration the
  // per-act bar is asking for, and scoring them separately would throw it away.
  const results = [];
  for (const { query } of queries) {
    try {
      const { results: found, credits: spent } = await search(apiKey, query, day);
      credits += spent;
      results.push(...found);
      if (verbose) {
        console.log(`    [${found.length} results] ${query}`);
        for (const row of found) console.log(`      · ${String(row.title ?? "").slice(0, 88)}`);
      }
    } catch (error) {
      console.log(`  ! ${day}  ${error.message}`);
    }
  }

  const { proposal, declineReason, rejected, uncorroborated } = proposeFestivalDay(
    { festivalName, city, date: day, venueName },
    results,
  );
  if (proposal) {
    bills.push(proposal);
    console.log(
      `  ✓ ${day}  ${proposal.title}  —  ${proposal.artistNames.length} acts  (${Math.round(proposal.confidence * 100)}%)`,
    );
    console.log(`      ${proposal.artistNames.join(", ")}`);
    console.log(`      ${proposal.sourceUrl}`);
    if (uncorroborated) {
      console.log(`      (${uncorroborated} more names seen once, held back)`);
    }
  } else {
    declined.push({ day, reason: declineReason });
    console.log(`  · ${day}  — ${declineReason}`);
    if (verbose) {
      for (const row of (rejected ?? []).slice(0, 8)) {
        console.log(`      ✗ ${row.reason}  ${String(row.url).slice(0, 60)}`);
      }
    }
  }
}

const acts = bills.reduce((total, bill) => total + bill.artistNames.length, 0);
console.log(`\n  days with a bill  ${bills.length}/${days.length}`);
console.log(`  acts recovered    ${acts}`);
console.log(`  spent             ${credits} credits\n`);

// The failure that matters is not a thin bill; it is an act on the wrong day.
// Every name that shows up on two different days of the same festival is
// printed, because that is the number a human has to look at before approving.
const byName = new Map();
for (const bill of bills) {
  for (const name of bill.artistNames) {
    const key = name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), bill.clusterDate]);
  }
}
const collisions = [...byName.entries()].filter(([, dates]) => dates.length > 1);
if (collisions.length) {
  console.log("  ⚠ acts claimed on more than one day — check these before approving:");
  for (const [name, dates] of collisions) console.log(`    ${name}  ${dates.join(", ")}`);
  console.log("");
} else if (bills.length > 1) {
  console.log("  no act appears on two days — the day cuts held.\n");
}

if (declined.length) {
  const reasons = new Map();
  for (const row of declined) {
    const key = String(row.reason ?? "unknown").replace(/[\d.]+/g, "N");
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  console.log("  why days were declined:");
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(3)}  ${reason}`);
  }
  console.log("");
}
