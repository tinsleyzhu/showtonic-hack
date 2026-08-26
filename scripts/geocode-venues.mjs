#!/usr/bin/env node
// Fill in missing venue coordinates so the backfill GPS signal works on the real
// catalog. JamBase's sync did not carry geo for the venues already stored, and
// without coordinates convex/backfillMatch.js cannot tell two same-night shows
// apart — the crowded-night win disappears.
//
//   npm run geocode:venues           # geocode everything missing
//   npm run geocode:venues -- 25     # just the first 25 (a quick smoke test)
//
// Uses OpenStreetMap's Nominatim: free, no API key, no maps SDK. Their usage
// policy requires an identifying User-Agent and at most one request per second,
// both of which this respects. ~900 venues therefore takes ~15 minutes; leave it
// running. Re-running only touches venues that are still missing coordinates.

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Showtonic-hackathon/0.1 (venue geocoding; contact: tinsleyzhu@gmail.com)";
const RATE_LIMIT_MS = 1100; // Nominatim policy: max 1 request/second.

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!convexUrl) {
  console.error("Set NEXT_PUBLIC_CONVEX_URL (it is written into .env.local by `npx convex dev`).");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);
const limit = Number(process.argv[2]) || undefined;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Two passes: the specific query first, then a looser one. A venue that only
// resolves to its city centre is worse than useless — it would place photos
// "near" every venue in town — so anything without a street-level hit is skipped.
function queriesFor(venue) {
  const region = venue.region ? `, ${venue.region}` : "";
  return [
    `${venue.name}, ${venue.city}${region}`,
    `${venue.name}, ${venue.city}`,
  ];
}

async function geocode(query) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    if (response.status === 429) throw new Error("rate-limited");
    return null;
  }
  const results = await response.json();
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) return null;

  // Reject city/state-level matches — only a real place or address helps us.
  const tooCoarse = ["city", "administrative", "state", "county", "suburb", "neighbourhood"];
  if (tooCoarse.includes(hit.addresstype) || tooCoarse.includes(hit.type)) return null;

  const latitude = Number(hit.lat);
  const longitude = Number(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, matched: hit.display_name };
}

const before = await client.query(api.venues.coordinateCoverage, {});
console.log(`Venues: ${before.total} total · ${before.located} located · ${before.missing} missing\n`);

const pending = await client.query(api.venues.missingCoordinates, limit ? { limit } : {});
if (!pending.length) {
  console.log("Nothing to do — every venue already has coordinates.");
  process.exit(0);
}

console.log(`Geocoding ${pending.length} venues at ~1/sec (about ${Math.ceil((pending.length * RATE_LIMIT_MS) / 60000)} min)\n`);

let located = 0;
let skipped = 0;
for (const [index, venue] of pending.entries()) {
  let found = null;
  for (const query of queriesFor(venue)) {
    try {
      found = await geocode(query);
    } catch (error) {
      if (error.message === "rate-limited") {
        console.log("  rate-limited by Nominatim — backing off 10s");
        await sleep(10_000);
      }
    }
    await sleep(RATE_LIMIT_MS);
    if (found) break;
  }

  const position = `[${String(index + 1).padStart(3)}/${pending.length}]`;
  if (found) {
    await client.mutation(api.venues.setCoordinates, {
      venueId: venue._id,
      latitude: found.latitude,
      longitude: found.longitude,
    });
    located += 1;
    console.log(`${position} ✓ ${venue.name} → ${found.latitude.toFixed(4)}, ${found.longitude.toFixed(4)}`);
  } else {
    skipped += 1;
    console.log(`${position} · ${venue.name} — no street-level match, left blank`);
  }
}

const after = await client.query(api.venues.coordinateCoverage, {});
console.log(`\nLocated ${located}, skipped ${skipped}.`);
console.log(`Coverage now: ${after.located}/${after.total} venues (${Math.round((after.located / after.total) * 100)}%).`);
console.log("Venues left blank simply score without a GPS signal — they never get penalised.");
