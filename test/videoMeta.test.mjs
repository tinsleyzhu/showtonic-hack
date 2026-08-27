import test from "node:test";
import assert from "node:assert/strict";
import { findQuickTimeSignals } from "../app/photoMeta.js";

test("reads Apple's creationdate as capture-local wall clock", () => {
  const moov = "\x00\x00mvhdjunk com.apple.quicktime.creationdate 2026-08-07T21:14:32-0700 more";
  assert.equal(findQuickTimeSignals(moov).takenAt, "2026-08-07T21:14:32");
});

test("reads ISO-6709 location and drops the altitude", () => {
  const moov = "com.apple.quicktime.location.ISO6709 +37.7797-122.4136+011.028/ tail";
  const found = findQuickTimeSignals(moov);
  assert.equal(found.latitude, 37.7797);
  assert.equal(found.longitude, -122.4136);
});

test("Null Island in a video is stripped like in a photo", () => {
  const found = findQuickTimeSignals("+0.0000-0.0000+000.000/");
  assert.equal(found.latitude, undefined);
});

test("binary noise without the formats yields nothing", () => {
  const found = findQuickTimeSignals("\x01\x02free\x00mdat 2026-13-45 +12-34/");
  assert.equal(found.takenAt, null);
  assert.equal(found.latitude, undefined);
});

test("fractional-second and colon-offset variants still parse", () => {
  assert.equal(
    findQuickTimeSignals("2025-11-02T20:03:11.24+05:30").takenAt,
    "2025-11-02T20:03:11",
  );
});
