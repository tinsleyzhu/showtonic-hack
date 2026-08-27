import assert from "node:assert/strict";
import test from "node:test";

import { briefingIsEmpty, timeAgo, visibleFinds } from "../app/briefingSurface.js";

function find(showId, evidenceCount = 1) {
  return {
    showId,
    evidence: Array.from({ length: evidenceCount }, (_, index) => ({
      kind: "genre-fit",
      detail: `reason ${index}`,
      weight: 0.5,
    })),
  };
}

test("a find with no evidence is not a find", () => {
  // "No evidence, no card" — the same refusal posture as the matcher. A fit
  // score with nothing behind it is the unfalsifiable number this whole surface
  // exists to reject.
  assert.deepEqual(
    visibleFinds([find("a"), find("b", 0), find("c")]).map((entry) => entry.showId),
    ["a", "c"],
  );
});

test("dismissing a find removes it and leaves the rest alone", () => {
  assert.deepEqual(
    visibleFinds([find("a"), find("b"), find("c")], ["b"]).map((entry) => entry.showId),
    ["a", "c"],
  );
});

test("a fresh account is empty, and is told so once instead of four times", () => {
  assert.equal(
    briefingIsEmpty({ decisionsOwed: 0, finds: [], beliefs: [], activity: [] }),
    true,
  );
});

test("any single section with content means the briefing is not empty", () => {
  const base = { decisionsOwed: 0, finds: [], beliefs: [], activity: [] };
  assert.equal(briefingIsEmpty({ ...base, decisionsOwed: 1 }), false);
  assert.equal(briefingIsEmpty({ ...base, finds: [find("a")] }), false);
  assert.equal(briefingIsEmpty({ ...base, beliefs: [{ statement: "x", basis: "y" }] }), false);
  assert.equal(briefingIsEmpty({ ...base, activity: [{ at: 0, kind: "searched" }] }), false);
});

test("a briefing whose only find has no evidence is an empty briefing", () => {
  // The find will never render, so claiming the room is occupied would put a
  // heading on screen with nothing under it.
  assert.equal(
    briefingIsEmpty({ decisionsOwed: 0, finds: [find("a", 0)], beliefs: [], activity: [] }),
    true,
  );
});

test("dismissing the last find empties the briefing", () => {
  assert.equal(
    briefingIsEmpty({ decisionsOwed: 0, finds: [find("a")], beliefs: [], activity: [] }, ["a"]),
    true,
  );
});

test("a missing briefing is empty rather than a crash", () => {
  assert.equal(briefingIsEmpty(undefined), true);
  assert.deepEqual(visibleFinds(undefined), []);
});

test("relative time reads in the units a person would use", () => {
  const now = 1_756_257_600_000;
  assert.equal(timeAgo(now, now), "just now");
  assert.equal(timeAgo(now - 5 * 60_000, now), "5m ago");
  assert.equal(timeAgo(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(timeAgo(now - 2 * 86_400_000, now), "2d ago");
});
