import assert from "node:assert/strict";
import test from "node:test";

import {
  absoluteTime,
  describeActivityKind,
  describeElapsed,
  orderActivity,
  refusalReason,
} from "../app/activityFeed.js";
import { BRIEFING_FIXTURE } from "../app/briefing.ts";

const NOW = 1756260000000; // fixed, because a test that reads the clock is a test that fails at midnight

test("the feed is newest first even when the caller hands it over shuffled", () => {
  const shuffled = [
    { at: 100, kind: "searched", summary: "oldest" },
    { at: 300, kind: "reclaimed", summary: "newest" },
    { at: 200, kind: "refused", summary: "middle" },
  ];
  assert.deepEqual(
    orderActivity(shuffled).map((item) => item.summary),
    ["newest", "middle", "oldest"],
  );
});

test("items written in one pass keep the order they happened in", () => {
  const tied = [
    { at: 500, kind: "squad", summary: "first" },
    { at: 500, kind: "squad", summary: "second" },
    { at: 500, kind: "squad", summary: "third" },
  ];
  assert.deepEqual(
    orderActivity(tied).map((item) => item.summary),
    ["first", "second", "third"],
  );
});

test("a malformed row is dropped rather than crashing the whole briefing", () => {
  const messy = [
    { at: 200, kind: "reclaimed", summary: "real" },
    null,
    undefined,
    { kind: "refused", summary: "no timestamp" },
    { at: Number.NaN, kind: "refused", summary: "not a time" },
  ];
  assert.deepEqual(orderActivity(messy).map((item) => item.summary), ["real"]);
  assert.deepEqual(orderActivity(undefined), []);
});

test("a refusal is restraint, and nothing else is", () => {
  assert.equal(describeActivityKind("refused").restraint, true);
  assert.equal(describeActivityKind("refused").label, "Held back");
  for (const kind of ["reclaimed", "searched", "squad", "recap"]) {
    assert.equal(describeActivityKind(kind).restraint, false, `${kind} should read as work`);
  }
});

test("a kind this build has never seen renders as ordinary work", () => {
  // The feed is derived server-side; a new kind will reach the component before
  // it reaches this file, and it must not vanish or throw.
  const unknown = describeActivityKind("negotiated");
  assert.equal(unknown.restraint, false);
  assert.ok(unknown.label.length > 0);
});

test("elapsed time reads like a person describing their morning", () => {
  assert.equal(describeElapsed(NOW - 5_000, NOW), "just now");
  assert.equal(describeElapsed(NOW - 12 * 60_000, NOW), "12m ago");
  assert.equal(describeElapsed(NOW - 5 * 3_600_000, NOW), "5h ago");
  assert.equal(describeElapsed(NOW - 3 * 86_400_000, NOW), "3d ago");
});

test("past a week it gives a date instead of arithmetic homework", () => {
  const old = describeElapsed(NOW - 23 * 86_400_000, NOW);
  assert.doesNotMatch(old, /ago/);
  assert.match(old, /[A-Z][a-z]{2} \d+/);
});

test("a clock skewed ahead of the server never says something happened in the future", () => {
  assert.equal(describeElapsed(NOW + 3_000, NOW), "just now");
});

test("every item carries a checkable absolute time as well as a relative one", () => {
  assert.match(absoluteTime(NOW), /[A-Z][a-z]{2} \d+/);
  assert.match(absoluteTime(NOW), /\d:\d{2}/);
});

test("a refusal that arrives with no reason says so instead of rendering an empty box", () => {
  assert.match(refusalReason({ detail: "" }), /No reason was recorded/);
  assert.match(refusalReason({}), /No reason was recorded/);
  assert.equal(refusalReason({ detail: "  40 acts share one field.  " }), "40 acts share one field.");
});

test("the coordinator's fixture satisfies the contract this feed relies on", () => {
  // If the fixture ever violates its own promises, the UI built on it is
  // building on sand — better to hear it here than on stage.
  const ordered = orderActivity(BRIEFING_FIXTURE.activity);
  assert.equal(ordered.length, BRIEFING_FIXTURE.activity.length);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(ordered[index - 1].at >= ordered[index].at, "fixture activity should already be newest first");
  }
  for (const item of ordered) {
    assert.ok(item.summary.trim().length > 0, "every item needs a one-line summary");
    if (item.kind === "refused") {
      assert.ok((item.detail ?? "").trim().length > 0, "a refusal must explain itself — the contract says WHY is mandatory");
    }
  }
});
