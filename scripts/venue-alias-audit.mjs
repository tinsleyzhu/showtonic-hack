#!/usr/bin/env node
// Venue-alias audit — the signoff list a dedup pass needs before it applies.
//
// Splits the venue strings in the catalog into two piles:
//
//   A. SAFE SHAPES — the same room under case, curly quotes, a leading
//      article, a sponsor suffix ("Powered By …") or a city tag. Mergeable
//      without a human, because none of those can name a different room.
//
//   B. TOKEN-SUBSET PAIRS — one name's words are a subset of another's. This
//      is the pile that needs eyes, and it is NOT a pile of aliases: a third
//      of them in the live catalog are a small room inside a bigger building.
//      Merging those deletes a real venue.
//
// Written because the two piles have OPPOSITE costs. For a dedup pass, a
// missed alias leaves a duplicate someone can ignore; a false merge destroys
// a show nobody can get back. Print them separately, sign off on B by hand.
//
// Usage (from the worktree with CONVEX_DEPLOYMENT — lanes do not have one):
//   node scripts/venue-alias-audit.mjs "New York" "San Francisco"

import { execFileSync } from "node:child_process";

const CITIES = process.argv.slice(2).length ? process.argv.slice(2) : ["New York", "San Francisco"];
const WINDOWS = [
  ["2025-08-01", "2025-11-30"],
  ["2025-12-01", "2026-03-31"],
  ["2026-04-01", "2026-06-30"],
  ["2026-07-01", "2026-08-26"],
  ["2026-08-27", "2026-09-30"],
  ["2026-10-01", "2026-12-31"],
  ["2027-01-01", "2027-12-31"],
];

// `shows:listCatalog` caps at 250 rows, so the year is walked in windows
// rather than asked for at once — the cap is on the read, not on the truth.
function venueNames(city) {
  const names = new Set();
  for (const [from, to] of WINDOWS) {
    const raw = execFileSync(
      "npx",
      ["convex", "run", "shows:listCatalog", JSON.stringify({ city, from, to, limit: 250 })],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const show of JSON.parse(raw)) names.add(show.venueName);
  }
  return [...names];
}

const STOP = /\s+powered by .*$|\s+-\s+[a-z]{2}$/;
const normalize = (name) =>
  name.toLowerCase().replace(/[’']/g, "'").replace(STOP, "").replace(/\s+/g, " ").trim();
const bare = (name) => normalize(name).replace(/^the /, "");
const tokens = (name) => new Set(normalize(name).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));

// The direction of the containment is the whole signal, and it is why this
// cannot be automated: "David Geffen Hall" inside "David Geffen Hall at
// Lincoln Center" is one room gaining its campus, while "The Loft at City
// Winery" against "City Winery" is a room INSIDE a building. Same subset
// relation, opposite answers.
function hint(shorter, longer) {
  const short = normalize(shorter);
  const long = normalize(longer);
  if (new RegExp(`\\bat\\b.*\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(long)) {
    return "LIKELY NESTED ROOM — do not merge";
  }
  if (/\b(stage|loft|balcony|annex|room|lounge)\b/.test(long.slice(short.length))) {
    return "LIKELY NESTED ROOM — do not merge";
  }
  if (/\d\s*$/.test(long)) return "trailing number — screen or room?";
  return "likely the same room, confirm";
}

for (const city of CITIES) {
  const names = venueNames(city);
  console.log(`\n=== ${city} — ${names.length} distinct venue strings`);

  const groups = new Map();
  for (const name of names) groups.set(bare(name), [...(groups.get(bare(name)) ?? []), name]);
  const safe = [...groups.values()].filter((group) => group.length > 1);
  console.log(`\n A. SAFE SHAPES (${safe.length}) — mergeable without a human`);
  for (const group of safe) console.log("   ", group.join("  ·  "));
  if (!safe.length) console.log("    none");

  const pairs = [];
  for (const a of names) {
    for (const b of names) {
      if (a >= b || bare(a) === bare(b)) continue;
      const [ta, tb] = [tokens(a), tokens(b)];
      if (!ta.size || !tb.size || ta.size === tb.size) continue;
      const subset = [...ta].every((token) => tb.has(token)) || [...tb].every((token) => ta.has(token));
      if (!subset) continue;
      const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
      pairs.push({ shorter, longer, hint: hint(shorter, longer) });
    }
  }
  console.log(`\n B. TOKEN-SUBSET PAIRS (${pairs.length}) — EACH NEEDS A HUMAN EYE`);
  for (const pair of pairs) console.log(`    ${pair.shorter}  <->  ${pair.longer}\n        ${pair.hint}`);
  if (!pairs.length) console.log("    none");
}
