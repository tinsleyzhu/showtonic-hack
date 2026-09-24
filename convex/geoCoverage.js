// Geo-coverage accounting — how much of the catalog the GPS signal can actually
// reach. Pure logic in the house style of backfillMatch.js: no I/O, no Convex,
// no DOM, so both readers measure the same numbers and the test harness can
// treat them identically.
//
// Those readers are the `venues.geoCoverage` query (the scan UI's warning) and
// `scripts/geocode-venues.mjs --report` (the operator's screen). Both must
// agree with the matcher on what "has coordinates" means, so the predicate is
// imported from there rather than re-declared — a report that counted Null
// Island as covered while the matcher throws it away would be coverage
// theatre.
//
// See docs/agent-hack/SPEC.md, workstream C.

import { venueLocationOf } from "./backfillMatch.js";

// Below this share of geo-located venues, the scan says out loud that nights
// are being matched date-only. The exact number is a product call, made
// visible here so it can be argued with rather than discovered: the GPS signal
// is what disambiguates a crowded Saturday, and a quarter of the catalog's
// rooms without coordinates is where date-only matching stops being the
// exception case.
const DATE_ONLY_WARNING_THRESHOLD = 0.75;

// An empty catalog is never thin — nothing is missing, so warning on an empty
// deployment would name a problem that does not exist.
function fractionOf(count, total) {
  return total === 0 ? 1 : count / total;
}

// A show reaches coordinates through its venue. The client scan path already
// carries them denormalized (venueLatitude/venueLongitude, app/liveData.js);
// show table rows carry only venueId, so callers holding table rows pass the
// venues as a Map. venueLocationOf reads both shapes.
function showLocationOf(show, venuesById) {
  return (
    venueLocationOf(show) ??
    venueLocationOf(show?.venueId ? venuesById.get(show.venueId) : null)
  );
}

// venues: [{ latitude?, longitude? }] → the share the matcher would trust.
// Counts as missing anything the matcher itself would refuse: absent
// coordinates, NaN, out of range, or 0,0 (Null Island — a stripped coordinate,
// never a venue).
function venueGeoCoverage(venues) {
  const rows = Array.isArray(venues) ? venues : [];
  const geocoded = rows.filter((venue) => venueLocationOf(venue) !== null).length;
  return {
    total: rows.length,
    geocoded,
    missing: rows.length - geocoded,
    fraction: fractionOf(geocoded, rows.length),
  };
}

// shows: the scan shape (venueLatitude/venueLongitude) or table rows (venueId
// + venuesById). Matchable = the GPS signal can reach the show at all;
// date-only = it cannot. Coverage is a data-health metric, so shows are
// counted regardless of date — a future show without coordinates is a real
// gap the geocoder could still close.
function showGeoCoverage(shows, venuesById = new Map()) {
  const rows = Array.isArray(shows) ? shows : [];
  const matchable = rows.filter((show) => showLocationOf(show, venuesById) !== null).length;
  return {
    total: rows.length,
    matchable,
    dateOnly: rows.length - matchable,
    fraction: fractionOf(matchable, rows.length),
  };
}

// venues + shows → the combined summary `venues.geoCoverage` returns.
function geoCoverageSummary(venues, shows) {
  const rows = Array.isArray(venues) ? venues : [];
  const venuesById = new Map(rows.map((venue) => [venue._id, venue]));
  return {
    venues: venueGeoCoverage(venues),
    shows: showGeoCoverage(shows, venuesById),
  };
}

// The sentence the scan prints when coverage is thin — null when it is not, so
// callers render the warning by rendering what they got, and "no warning"
// cannot drift from "no problem".
function describeGeoSignalWarning(venueCoverage) {
  if (!venueCoverage || venueCoverage.total === 0) return null;
  if (venueCoverage.fraction >= DATE_ONLY_WARNING_THRESHOLD) return null;
  return `GPS signal: ${Math.round(venueCoverage.fraction * 100)}% of venues geo-located — matching date-only`;
}

// `--report` prints this: one screen, both numbers, and — when thin — the same
// sentence the scan shows, so the operator and the user read the same words.
function formatGeoReport(summary) {
  if (!summary?.venues || !summary?.shows) return "No coverage data.";
  const percent = (fraction) => `${Math.round(fraction * 100)}%`;
  const lines = [
    `Venues: ${summary.venues.geocoded}/${summary.venues.total} geo-located (${percent(summary.venues.fraction)})`,
    `Shows: ${summary.shows.matchable}/${summary.shows.total} GPS-matchable (${percent(summary.shows.fraction)}) — ${summary.shows.dateOnly} date-only`,
  ];
  const warning = describeGeoSignalWarning(summary.venues);
  if (warning) lines.push(warning);
  return lines.join("\n");
}

export {
  DATE_ONLY_WARNING_THRESHOLD,
  describeGeoSignalWarning,
  formatGeoReport,
  geoCoverageSummary,
  showGeoCoverage,
  venueGeoCoverage,
};
