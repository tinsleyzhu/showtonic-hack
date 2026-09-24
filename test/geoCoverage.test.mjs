import assert from "node:assert/strict";
import test from "node:test";

import {
  DATE_ONLY_WARNING_THRESHOLD,
  describeGeoSignalWarning,
  formatGeoReport,
  geoCoverageSummary,
  showGeoCoverage,
  venueGeoCoverage,
} from "../convex/geoCoverage.js";

const GEOCODED = { latitude: 37.7761, longitude: -122.438 };
const GEOCODED_TOO = { latitude: 37.748, longitude: -122.388 };

// --- Venue coverage ---------------------------------------------------------

test("venue coverage counts only coordinates the matcher would trust", () => {
  const coverage = venueGeoCoverage([
    GEOCODED,
    {}, // no coordinates recorded
    { latitude: 0, longitude: 0 }, // Null Island — stripped/garbage, never a venue
    { latitude: 91, longitude: 0 }, // out of range
    { latitude: Number.NaN, longitude: 12 },
    GEOCODED_TOO,
  ]);
  assert.equal(coverage.total, 6);
  assert.equal(coverage.geocoded, 2);
  assert.equal(coverage.missing, 4);
  assert.ok(Math.abs(coverage.fraction - 2 / 6) < Number.EPSILON);
});

test("non-array and empty venue inputs are counted, not crashed on", () => {
  const empty = venueGeoCoverage([]);
  assert.deepEqual(
    empty,
    { total: 0, geocoded: 0, missing: 0, fraction: 1 },
    "an empty catalog is never thin — there is nothing missing",
  );
  assert.equal(venueGeoCoverage(undefined).total, 0);
});

// --- Show coverage ----------------------------------------------------------

test("show coverage reads denormalized coordinates and venue rows alike", () => {
  const venuesById = new Map([
    ["v_geocoded", GEOCODED],
    ["v_blank", {}],
  ]);
  const coverage = showGeoCoverage(
    [
      { venueId: "v_geocoded", venueLatitude: 37.77, venueLongitude: -122.43 }, // scan shape
      { venueId: "v_geocoded" }, // table shape, resolved through the venue
      { venueId: "v_blank" }, // venue exists, coordinates do not
      {}, // no venue at all
      { venueLatitude: 37.7, venueLongitude: -122.4 },
    ],
    venuesById,
  );
  assert.equal(coverage.total, 5);
  assert.equal(coverage.matchable, 3);
  assert.equal(coverage.dateOnly, 2);
  assert.equal(coverage.fraction, 3 / 5);
});

test("a show is never matchable through a venue it does not name", () => {
  // venueId present but the lookup empty — date-only, not a crash.
  const coverage = showGeoCoverage([{ venueId: "v_missing" }], new Map());
  assert.deepEqual(
    { matchable: coverage.matchable, dateOnly: coverage.dateOnly },
    { matchable: 0, dateOnly: 1 },
  );
});

// --- Summary ----------------------------------------------------------------

test("the summary composes both coverages and keys shows through venue rows", () => {
  const summary = geoCoverageSummary(
    [
      { _id: "v1", ...GEOCODED },
      { _id: "v2" },
      { _id: "v3", ...GEOCODED_TOO },
    ],
    [
      { venueId: "v1" },
      { venueId: "v2" },
      { venueId: "v3" },
      { venueId: "v3" },
    ],
  );
  assert.deepEqual(summary.venues, { total: 3, geocoded: 2, missing: 1, fraction: 2 / 3 });
  assert.deepEqual(summary.shows, { total: 4, matchable: 3, dateOnly: 1, fraction: 3 / 4 });
});

test("the summary is deterministic — same rows, byte-for-byte same report", () => {
  const venues = [
    { _id: "v1", ...GEOCODED },
    { _id: "v2" },
  ];
  const shows = [{ venueId: "v1" }, { venueId: "v2" }];
  assert.equal(
    formatGeoReport(geoCoverageSummary(venues, shows)),
    formatGeoReport(geoCoverageSummary(venues, shows)),
  );
});

// --- The warning ------------------------------------------------------------

test("the warning fires below the threshold and names the share", () => {
  const thin = venueGeoCoverage([GEOCODED, {}, {}, {}]); // 25%
  assert.ok(thin.fraction < DATE_ONLY_WARNING_THRESHOLD);
  assert.equal(
    describeGeoSignalWarning(thin),
    "GPS signal: 25% of venues geo-located — matching date-only",
  );
});

test("the warning holds at the threshold and above it", () => {
  // Three of four venues geocoded is exactly the threshold — not below it.
  const atThreshold = venueGeoCoverage([GEOCODED, GEOCODED_TOO, { ...GEOCODED }, {}]);
  assert.equal(atThreshold.fraction, DATE_ONLY_WARNING_THRESHOLD);
  assert.equal(describeGeoSignalWarning(atThreshold), null);
  assert.equal(describeGeoSignalWarning(venueGeoCoverage([GEOCODED])), null);
});

test("an empty or absent catalog never produces a warning", () => {
  assert.equal(describeGeoSignalWarning(venueGeoCoverage([])), null);
  assert.equal(describeGeoSignalWarning(undefined), null);
  assert.equal(describeGeoSignalWarning(null), null);
});

// --- The --report text ------------------------------------------------------

test("the report prints venue and show coverage", () => {
  const summary = geoCoverageSummary(
    [
      { _id: "v1", ...GEOCODED },
      { _id: "v2" },
      { _id: "v3", ...GEOCODED_TOO },
      { _id: "v4" },
    ],
    [{ venueId: "v1" }, { venueId: "v2" }, { venueId: "v3" }],
  );
  const report = formatGeoReport(summary);
  assert.match(report, /^Venues: 2\/4 geo-located \(50%\)$/m);
  assert.match(report, /^Shows: 2\/3 GPS-matchable \(67%\) — 1 date-only$/m);
});

test("the report carries the same warning sentence the scan shows", () => {
  const report = formatGeoReport(
    geoCoverageSummary([{ _id: "v1", ...GEOCODED }, { _id: "v2" }, { _id: "v3" }], [
      { venueId: "v1" },
    ]),
  );
  assert.match(report, /^GPS signal: 33% of venues geo-located — matching date-only$/m);

  const healthy = formatGeoReport(
    geoCoverageSummary([{ _id: "v1", ...GEOCODED }], [{ venueId: "v1" }]),
  );
  assert.equal(healthy.includes("matching date-only"), false);
});
