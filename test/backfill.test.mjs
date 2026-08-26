import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoCameraRoll,
  clusterPhotosIntoNights,
  describeConfidence,
  describeReclaimSpan,
  extractExifDate,
  formatCaptureWindow,
  matchClustersToShows,
  nightDateOf,
} from "../app/backfill.js";

// --- EXIF ------------------------------------------------------------------

// Build a minimal JPEG buffer: SOI + APP1(Exif/TIFF little-endian) with
// IFD0 → ExifIFD → DateTimeOriginal.
function syntheticJpegWithDate(dateString) {
  const ascii = dateString; // "YYYY:MM:DD HH:MM:SS"
  const tiff = [];
  const push16 = (v) => tiff.push(v & 0xff, (v >> 8) & 0xff); // little-endian
  const push32 = (v) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);

  // TIFF header
  tiff.push(0x49, 0x49); // "II"
  push16(42);
  push32(8); // IFD0 at offset 8
  // IFD0: 1 entry (ExifIFD pointer), next IFD 0
  push16(1);
  push16(0x8769); push16(4); push32(1); push32(26); // ExifIFD at offset 26
  push32(0);
  // ExifIFD at 26: 1 entry (DateTimeOriginal), next IFD 0
  push16(1);
  push16(0x9003); push16(2); push32(20); push32(44); // ASCII, 20 bytes, value at 44
  push32(0);
  // value at offset 44
  for (const char of ascii) tiff.push(char.charCodeAt(0));
  tiff.push(0);

  const app1Payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]; // "Exif\0\0" + TIFF
  const size = app1Payload.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...app1Payload, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

test("extracts DateTimeOriginal from a JPEG EXIF block", () => {
  const buffer = syntheticJpegWithDate("2025:11:15 22:22:14");
  assert.equal(extractExifDate(buffer), "2025-11-15T22:22:14");
});

test("returns null for non-JPEG or EXIF-free buffers", () => {
  assert.equal(extractExifDate(new Uint8Array([1, 2, 3, 4]).buffer), null);
  assert.equal(extractExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), null);
});

// --- Night attribution -----------------------------------------------------

test("photos after midnight belong to the previous night", () => {
  assert.equal(nightDateOf("2025-11-15T22:30:00"), "2025-11-15");
  assert.equal(nightDateOf("2025-11-16T00:45:00"), "2025-11-15");
  assert.equal(nightDateOf("2025-11-16T03:59:00"), "2025-11-15");
  assert.equal(nightDateOf("2025-11-16T12:00:00"), "2025-11-16");
  assert.equal(nightDateOf("garbage"), null);
});

test("formats capture windows in 12-hour clock", () => {
  assert.equal(
    formatCaptureWindow("2025-11-15T22:22:00", "2025-11-16T00:14:00"),
    "10:22 PM–12:14 AM",
  );
  assert.equal(formatCaptureWindow("bad", "worse"), "");
});

// --- Clustering ------------------------------------------------------------

const nightPhotos = [
  { takenAt: "2025-11-15T21:10:00" },
  { takenAt: "2025-11-15T22:40:00" },
  { takenAt: "2025-11-16T00:20:00" }, // same night, after midnight
  { takenAt: "2025-11-15T09:00:00" }, // daytime — ignored
  { takenAt: "2025-08-04T20:00:00" },
  { takenAt: "2025-08-04T21:00:00" }, // only 2 evening photos — below threshold
];

test("clusters evening photos into nights with a 3-photo minimum", () => {
  const clusters = clusterPhotosIntoNights(nightPhotos);
  assert.equal(clusters.length, 1);
  assert.deepEqual(
    { date: clusters[0].clusterDate, count: clusters[0].photoCount, window: clusters[0].captureWindow },
    { date: "2025-11-15", count: 3, window: "9:10 PM–12:20 AM" },
  );
});

test("clusters sort newest night first", () => {
  const clusters = clusterPhotosIntoNights([
    { takenAt: "2024-05-01T21:00:00" },
    { takenAt: "2024-05-01T22:00:00" },
    { takenAt: "2024-05-01T23:00:00" },
    { takenAt: "2025-06-02T21:00:00" },
    { takenAt: "2025-06-02T22:00:00" },
    { takenAt: "2025-06-02T23:00:00" },
  ]);
  assert.deepEqual(clusters.map((cluster) => cluster.clusterDate), ["2025-06-02", "2024-05-01"]);
});

// --- Matching --------------------------------------------------------------

const catalog = [
  { id: "fred", date: "2025-11-15", title: "Fred again..", artistNames: ["Fred again.."], venueName: "Knockdown Center", venueId: "v-knockdown", city: "New York" },
  { id: "other", date: "2025-11-15", title: "Someone Else", artistNames: ["Someone Else"], venueName: "Elsewhere", venueId: "v-elsewhere", city: "New York" },
  { id: "future", date: "2030-01-01", title: "Future Show", artistNames: ["Fred again.."] },
];

function clusterOn(date, photoCount = 5) {
  return { clusterDate: date, photoCount, captureWindow: "10:00 PM–1:00 AM", firstTakenAt: "", lastTakenAt: "" };
}

test("matches clusters to same-date past shows with a base confidence", () => {
  // One show on the night — nothing to be ambiguous about.
  const soleShow = catalog.filter((show) => show.id === "fred");
  const candidates = matchClustersToShows([clusterOn("2025-11-15")], soleShow, { today: "2026-08-15" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].confidence, 0.5);
  assert.equal(candidates[0].showId, "fred");
});

test("taste and venue history raise confidence but never break a tie", () => {
  // Two shows on this night and no photo GPS to separate them. Taste used to
  // decide it, which meant the matcher told people they saw the acts they
  // already liked. It now declines instead.
  const tied = matchClustersToShows([clusterOn("2025-11-15")], catalog, {
    today: "2026-08-15",
    tasteArtists: ["fred AGAIN.."],
  });
  assert.deepEqual(tied, []);

  // With one show on the night, the same signals still add their confidence —
  // they were never wrong, only never decisive.
  const soleShow = catalog.filter((show) => show.id === "fred");
  const withVenue = matchClustersToShows([clusterOn("2025-11-15", 9)], soleShow, {
    today: "2026-08-15",
    tasteArtists: ["Fred again.."],
    visitedVenueIds: ["v-knockdown"],
  });
  // 0.5 base + 0.1 heavy documentation + 0.2 taste + 0.2 venue, capped at 0.99
  assert.equal(withVenue[0].confidence, 0.99);
});

test("never matches future shows and drops unmatched clusters", () => {
  const candidates = matchClustersToShows(
    [clusterOn("2030-01-01"), clusterOn("2019-01-01")],
    catalog,
    { today: "2026-08-15" },
  );
  assert.deepEqual(candidates, []);
});

test("confidence label matches the design language", () => {
  assert.equal(describeConfidence(0.96), "96% likely");
});

test("reclaim span headline counts calendar years", () => {
  assert.equal(
    describeReclaimSpan([{ clusterDate: "2022-06-01" }, { clusterDate: "2025-11-15" }]),
    "Four years of nights, back in one place.",
  );
  assert.equal(
    describeReclaimSpan([{ clusterDate: "2025-01-01" }, { clusterDate: "2025-12-01" }]),
    "A year of nights, back in one place.",
  );
  assert.equal(describeReclaimSpan([]), "");
});

// --- Demo camera roll ------------------------------------------------------

test("demo camera roll fabricates matchable evening photos from past shows", () => {
  const shows = [
    { id: "a", date: "2025-01-10", title: "A" },
    { id: "b", date: "2025-03-10", title: "B" },
    { id: "c", date: "2025-05-10", title: "C" },
    { id: "future", date: "2030-01-01", title: "F" },
  ];
  const photos = buildDemoCameraRoll(shows, { today: "2026-08-15", limit: 3 });
  assert.equal(photos.length >= 9, true); // ≥3 photos per night
  const clusters = clusterPhotosIntoNights(photos);
  assert.equal(clusters.length, 3);
  const candidates = matchClustersToShows(clusters, shows, { today: "2026-08-15" });
  assert.equal(candidates.length, 3);
  // Deterministic: same input, same output.
  assert.deepEqual(buildDemoCameraRoll(shows, { today: "2026-08-15", limit: 3 }), photos);
});
