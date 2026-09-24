// Festival-day collapse — pure planning half.
//
// A legacy festival sits in the catalog as one show row PER SET: sixty rows
// sharing a `festivalId`, each titled by its artist. The matcher's ambiguity
// guard reads that as sixty equally-placed options for one night and declines
// the whole festival — the app's origin-story failure. The fix the SPEC names
// ("a festival is one thing, not sixty") is one festival-day row per date,
// carrying that day's bill, with the per-set rows demoted to lineup.
//
// This module plans that collapse and knows nothing about the database. It
// takes plain show rows and returns the writes to make; `convex/festivalDays.ts`
// performs them. Purity is the point: the idempotency guarantee is testable
// here, with fixtures, because "run the plan twice" is just calling the
// function twice.
//
// Two rules shape every choice below:
//
//   1. Nothing is ever deleted. Diary entries point at per-set show ids and
//      must keep resolving after the collapse — demotion is a flag, not a
//      delete.
//   2. The plan is deterministic. Same catalog in, same plan out, byte for
//      byte — a second run must plan zero inserts and zero new demotions,
//      which is what makes the action safe to re-run after a partial failure.

import { festivalDayTitle } from "./catalogGapUtils.js";

// ---------------------------------------------------------------------------
// Identifying the two kinds of festival row
// ---------------------------------------------------------------------------

// A festival-day row is the one-per-date entity. Two shapes exist:
//
//   · rows carrying the `isFestivalDay` flag — this collapse writes them, and
//     so does the gap agent's festival approval path;
//   · rows the gap agent approved before the flag existed, recognisable by
//     their `gap:fest:<festivalId>:<date>` key.
//
// Both mean "a day row already exists for this festival and date", which is
// the entire idempotency check.
function isFestivalDayRow(show) {
  if (!show) return false;
  if (show.isFestivalDay === true) return true;
  const key = typeof show.jambaseId === "string" ? show.jambaseId : "";
  return key.startsWith("gap:fest:") || key.startsWith("fest:");
}

// The stable order rows are read in. Headliners first so the day bill leads
// with the acts a poster would; start time, title and id break every tie so
// the same catalog always plans the same bill.
function canonicalRowOrder(left, right) {
  const leftHeadline = left.isHeadliner === true ? 0 : 1;
  const rightHeadline = right.isHeadliner === true ? 0 : 1;
  if (leftHeadline !== rightHeadline) return leftHeadline - rightHeadline;
  const leftTime = typeof left.startTime === "string" ? left.startTime : "";
  const rightTime = typeof right.startTime === "string" ? right.startTime : "";
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
  const byTitle = String(left.title ?? "").localeCompare(String(right.title ?? ""));
  if (byTitle !== 0) return byTitle;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

// ---------------------------------------------------------------------------
// The day row's fields
// ---------------------------------------------------------------------------

// The catalog stores a festival as a slug ("outside-lands-2026") — the only
// name a discovered festival owns. Spoken aloud it is "Outside Lands 2026",
// which is what the day row's title should say. Words are capitalised as-is;
// a slug that is not a slug is returned unchanged rather than mangled.
function festivalDisplayName(festivalId) {
  const value = String(festivalId ?? "").trim();
  if (!value) return "";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

// One act, once, however many stages it played. Case-insensitive because the
// catalog spells acts differently row to row ("Tyler, The Creator" and
// "Tyler, the Creator" are one artist twice).
function billKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

// The day's bill, in canonical row order, deduplicated. A row's own
// `artistNames` can carry several acts (co-billed sets), so the bill is a
// flattening, not a per-row pick.
function dayBill(perSetRows) {
  const seen = new Set();
  const bill = [];
  for (const row of perSetRows) {
    for (const name of Array.isArray(row.artistNames) ? row.artistNames : []) {
      const key = billKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      bill.push(String(name).trim());
    }
  }
  return bill;
}

// The day row's venue. A festival has no venue of its own — its per-set rows
// live on stage-level venues that all share the grounds — so the day row
// borrows the room most of its sets name. Among ties, a venue the geocoder
// has located wins, because the day row's coordinates are what the matcher's
// GPS band will anchor on; then alphabetical, so the pick never depends on
// row order.
function dayVenue(perSetRows) {
  const counts = new Map();
  const coords = new Map();
  for (const row of perSetRows) {
    const name = String(row.venueName ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { name, count: 0, hasCoords: false };
    entry.count += 1;
    if (
      !entry.hasCoords &&
      Number.isFinite(row.venueLatitude) &&
      Number.isFinite(row.venueLongitude)
    ) {
      entry.hasCoords = true;
      coords.set(key, { latitude: row.venueLatitude, longitude: row.venueLongitude });
    }
    counts.set(key, entry);
  }
  const ranked = [...counts.values()].sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count;
    if (left.hasCoords !== right.hasCoords) return left.hasCoords ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  const winner = ranked[0];
  if (!winner) return null;
  return { venueName: winner.name, city: null, ...(coords.get(winner.name.toLowerCase()) ?? {}) };
}

// The day row's city, from the rows that named the winning venue, then from
// any row at all. Never invented: if no row states a city, the empty string
// rides through rather than a guess.
function dayCity(perSetRows, venueName) {
  const wanted = String(venueName ?? "").trim().toLowerCase();
  let any = "";
  for (const row of perSetRows) {
    const city = String(row.city ?? "").trim();
    if (!city) continue;
    if (String(row.venueName ?? "").trim().toLowerCase() === wanted) return city;
    if (!any) any = city;
  }
  return any;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

// Group the catalog's festival rows by festival and date and plan the writes
// that collapse them. Rows without a `festivalId` are not festival rows and
// are ignored entirely — a regular show on the same night is never demoted,
// never absorbed, never touched.
//
// options.festivalId — collapse one festival, for a targeted re-run.
//
// Returns { dayRows, demotions, days, festivalCount }:
//
//   dayRows   events for `shows.importUpcoming`, which keys them
//             `fest:<festivalId>:<date>` so a re-run patches instead of
//             duplicating;
//   demotions show ids to mark `nonMatchable` — the per-set rows of every
//             date that has (or just gained) a day row;
//   days      one report row per (festival, date), saying what would happen —
//             the dry run reads this, and so does the action's return value;
//   festivalCount  distinct festivals the plan touches.
function planFestivalDayCollapse(shows, options = {}) {
  const rows = (Array.isArray(shows) ? shows : []).filter(
    (show) => show && typeof show.festivalId === "string" && show.festivalId !== "",
  );
  const wanted = options.festivalId;
  const byFestival = new Map();
  for (const row of rows) {
    if (wanted && row.festivalId !== wanted) continue;
    const festival = byFestival.get(row.festivalId) ?? new Map();
    const date = String(row.date ?? "");
    const bucket = festival.get(date) ?? { dayRows: [], perSet: [] };
    if (isFestivalDayRow(row)) bucket.dayRows.push(row);
    else bucket.perSet.push(row);
    festival.set(date, bucket);
    // The inner map is mutable — without writing it back, every row lands in
    // a throwaway Map and the plan collapses to silence.
    byFestival.set(row.festivalId, festival);
  }

  const dayRows = [];
  const demotions = [];
  const days = [];

  for (const festivalId of [...byFestival.keys()].sort()) {
    const festival = byFestival.get(festivalId);
    for (const date of [...festival.keys()].sort()) {
      const { dayRows: existing, perSet } = festival.get(date);
      // The caller's order is an accident of the query; the plan's order is
      // the canon. Every field below reads the sorted rows.
      perSet.sort(canonicalRowOrder);
      if (!perSet.length) continue; // already collapsed; nothing to plan

      const festivalName = festivalDisplayName(festivalId);
      const bill = dayBill(perSet);
      const venue = dayVenue(perSet);
      const city = dayCity(perSet, venue?.venueName);
      const key = `fest:${festivalId}:${date}`;
      const pending = demotions.length;
      for (const row of perSet) {
        if (row.nonMatchable === true) continue; // already demoted — a re-run
        demotions.push(row.id);
      }
      const alreadyDemoted = perSet.length - (demotions.length - pending);

      if (!existing.length) {
        dayRows.push({
          jambaseId: key,
          title: festivalDayTitle(festivalName, date) || festivalName,
          date,
          festivalId,
          isFestivalDay: true,
          venueName: venue?.venueName ?? "",
          city,
          latitude: venue?.latitude,
          longitude: venue?.longitude,
          isHeadliner: true,
          artistNames: bill,
        });
      }

      days.push({
        festivalId,
        festivalName,
        date,
        title: festivalDayTitle(festivalName, date) || festivalName,
        jambaseId: key,
        dayRowExisted: existing.length > 0,
        acts: bill.length,
        demoted: demotions.length - pending,
        alreadyDemoted,
      });
    }
  }

  return { dayRows, demotions, days, festivalCount: byFestival.size };
}

export {
  billKey,
  canonicalRowOrder,
  dayBill,
  dayCity,
  dayVenue,
  festivalDisplayName,
  isFestivalDayRow,
  planFestivalDayCollapse,
};
