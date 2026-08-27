// Measure the catalog-gap agent against real history: how many past nights at a
// real venue can it actually explain?
//
//   node scripts/sweep-history.mjs "The Midway" "San Francisco" 2026-05-01 2026-05-31
//   node scripts/sweep-history.mjs "The Midway" "San Francisco" 2026-05-01 2026-05-31 --dry-run
//
// This talks to Tavily directly and to Convex not at all, so it needs no
// deployment and touches no shared state — it measures the same pure scorer the
// Convex action uses (`convex/catalogGapUtils.js`), which is the whole reason
// that module has no I/O in it.
//
// The number it prints is the answer to "did we solve catalog history without
// Setlist.fm?", and it belongs in TEAM.md whether it is good or bad.
//
// Credits are real: event-coded, finite, and they expire with the event. Every
// run reports what it spent, and --dry-run prices the job without paying.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CREDITS_PER_ADVANCED_SEARCH,
  buildGapQueries,
  eachNightInRange,
  estimateSweepCredits,
  proposeFromResults,
} from "../convex/catalogGapUtils.js";

const run = promisify(execFile);
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const PAUSE_MS = 600; // Tavily free tier is ~2 req/s
const MAX_NIGHTS = 60;

// The key lives in Convex env, never in this repo. Read it into memory and
// never print it — not in logs, not in errors, not on failure.
//
// A lane worktree has no CONVEX_DEPLOYMENT of its own (only the coordinator's
// checkout is linked to a deployment), so fall back to a sibling worktree that
// is. This is a read of one env var; it deploys nothing and writes nothing.
async function tavilyKey() {
  if (process.env.TAVILY_API_KEY) return process.env.TAVILY_API_KEY.trim();
  const here = new URL("..", import.meta.url).pathname;
  const candidates = [here, `${here}/../showtonic-hack`];
  for (const cwd of candidates) {
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
  if (!response.ok) {
    // Deliberately does not echo the request: the Authorization header is in it.
    throw new Error(`Tavily returned ${response.status}`);
  }
  const payload = await response.json();
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    credits: payload.usage?.credits ?? CREDITS_PER_ADVANCED_SEARCH,
  };
}

const [venueName, city, from, to, ...flags] = process.argv.slice(2);
if (!venueName || !city || !from || !to) {
  console.error(
    'Usage: node scripts/sweep-history.mjs "<venue>" "<city>" <from ISO> <to ISO> [--dry-run]',
  );
  process.exit(1);
}
const dryRun = flags.includes("--dry-run");
// A refusal count on its own cannot tell "the web has nothing about this night"
// apart from "the evidence gate is too tight". This prints the difference.
const verbose = flags.includes("--verbose");

const nights = eachNightInRange(from, to).slice(0, MAX_NIGHTS);
if (!nights.length) {
  console.error(`No nights in range ${from}..${to}`);
  process.exit(1);
}

console.log(`\nCatalog-gap history sweep — ${venueName}, ${city}`);
console.log(`  range   ${from} .. ${to}  (${nights.length} nights)`);
console.log(`  budget  ~${estimateSweepCredits(nights.length, 1)} Tavily credits`);
if (dryRun) {
  console.log(`  dry run — nothing searched, nothing spent.\n`);
  const [sample] = buildGapQueries({ clusterDate: nights[0], city, venues: [{ name: venueName }] });
  console.log(`  first query would be: ${sample.query}\n`);
  process.exit(0);
}

const apiKey = await tavilyKey();
if (!apiKey) {
  console.error(
    "\nNo TAVILY_API_KEY. Set it in the environment, or run where `npx convex env get` works.\n",
  );
  process.exit(1);
}

const explained = [];
const declined = [];
let credits = 0;

for (const [index, night] of nights.entries()) {
  if (index) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  const [{ query }] = buildGapQueries({
    clusterDate: night,
    city,
    venues: [{ name: venueName }],
  });
  try {
    const { results, credits: spent } = await search(apiKey, query, night);
    credits += spent;
    const { proposal, declineReason } = proposeFromResults(
      { clusterDate: night, city, anchorVenue: venueName },
      results,
    );
    if (verbose) {
      console.log(`    [${results.length} results] ${query}`);
      for (const row of results.slice(0, 8)) {
        console.log(`      · ${String(row.title ?? "").slice(0, 88)}`);
      }
    }
    if (proposal) {
      explained.push(proposal);
      console.log(
        `  ✓ ${night}  ${proposal.artistNames.join(" + ")}  (${Math.round(proposal.confidence * 100)}%)`,
      );
      console.log(`      ${proposal.sourceUrl}`);
    } else {
      declined.push({ night, reason: declineReason });
      console.log(`  · ${night}  — ${declineReason}`);
      if (verbose) {
        const { rejected } = proposeFromResults(
          { clusterDate: night, city, anchorVenue: venueName },
          results,
        );
        for (const row of rejected.slice(0, 8)) {
          console.log(`      ✗ ${row.reason}  ${row.url.slice(0, 60)}`);
        }
      }
    }
  } catch (error) {
    declined.push({ night, reason: error.message });
    console.log(`  ! ${night}  ${error.message}`);
  }
}

const rate = nights.length ? Math.round((explained.length / nights.length) * 100) : 0;
console.log(`\n  explained  ${explained.length}/${nights.length}  (${rate}%)`);
console.log(`  declined   ${declined.length}`);
console.log(`  spent      ${credits} credits\n`);

// Why nights were refused matters as much as how many: a sweep that declines
// because listings have expired is a different problem from one that declines
// because the venue was genuinely dark.
const reasons = new Map();
for (const row of declined) {
  const key = String(row.reason ?? "unknown").replace(/[\d.]+/g, "N");
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
if (reasons.size) {
  console.log("  why nights were declined:");
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(3)}  ${reason}`);
  }
  console.log("");
}
