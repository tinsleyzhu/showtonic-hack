import assert from "node:assert/strict";
import test from "node:test";

import { buildReclaimStory, drawReclaim, monthYear, reclaimFilename } from "../app/reclaimCanvas.js";
import { CARD_CTA, RECAP_FORMATS } from "../app/recapCanvas.js";

function fakeContext() {
  const calls = [];
  const state = { fillStyle: "", font: "", textAlign: "left", textBaseline: "" };
  return {
    calls,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    fillText(text, x, y) { calls.push(["fillText", text, x, y]); },
    measureText(text) { return { width: String(text).length * 18 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    set fillStyle(value) { state.fillStyle = value; },
    get fillStyle() { return state.fillStyle; },
    set font(value) { state.font = value; },
    get font() { return state.font; },
    set textAlign(value) { state.textAlign = value; },
    get textAlign() { return state.textAlign; },
    set textBaseline(value) { state.textBaseline = value; },
    get textBaseline() { return state.textBaseline; },
  };
}

const NIGHTS = [
  { clusterDate: "2022-03-04", artistNames: ["Fred again.."], showTitle: "Fred again.. at The Midway" },
  { clusterDate: "2019-11-02", artistNames: ["MUNA"], showTitle: "MUNA at The Fillmore" },
  { clusterDate: "2024-06-21", artistNames: ["Fred again.."], showTitle: "Fred again.. at 1015 Folsom" },
];

test("the card says what the agent did, not what the person did", () => {
  const story = buildReclaimStory(NIGHTS, { handle: "tinsley" });
  assert.equal(story.nights, 3);
  assert.match(story.shareText, /^My agent rebuilt 3 nights I never logged\./);
  assert.match(story.shareText, /Oldest: November 2019\./);
});

test("one night is not three nights", () => {
  const story = buildReclaimStory([NIGHTS[1]], { handle: "tinsley" });
  assert.match(story.shareText, /rebuilt 1 night I never logged/);
  assert.doesNotMatch(story.shareText, /nights/);
});

test("the oldest night is the oldest, not the first one confirmed", () => {
  // The session confirms in whatever order the queue served them.
  const story = buildReclaimStory(NIGHTS, {});
  assert.equal(story.oldest, "2019-11-02");
  assert.equal(story.oldestLabel, "November 2019");
});

test("a month is not shifted by a timezone", () => {
  // new Date("2019-03-01") is UTC midnight, which is February 28th in
  // California. The label is parsed from the string for exactly this reason.
  assert.equal(monthYear("2019-03-01"), "March 2019");
  assert.equal(monthYear("2019-01-01"), "January 2019");
  assert.equal(monthYear("2019-12-31"), "December 2019");
  assert.equal(monthYear("nonsense"), "");
});

test("nothing confirmed is not a story", () => {
  assert.equal(buildReclaimStory([], { handle: "tinsley" }).empty, true);
  assert.equal(buildReclaimStory(undefined).empty, true);
  // A row with no date cannot be dated, so it cannot be counted.
  assert.equal(buildReclaimStory([{ artistNames: ["Ghost"] }]).empty, true);
});

test("the acts are ranked by how often they turned up", () => {
  const story = buildReclaimStory(NIGHTS, {});
  assert.equal(story.names[0], "Fred again..");
  assert.equal(story.names.length, 2);
});

test("a night with no artist name still counts as a night", () => {
  const story = buildReclaimStory([{ clusterDate: "2021-01-05" }, ...NIGHTS], {});
  assert.equal(story.nights, 4);
  assert.match(story.shareText, /rebuilt 4 nights/);
});

for (const format of ["story", "square"]) {
  test(`${format}: the invitation is painted and nothing lands off-canvas`, () => {
    const ctx = fakeContext();
    const story = buildReclaimStory(NIGHTS, { handle: "tinsley" });
    const shape = drawReclaim(ctx, { story, format });
    assert.equal(shape.width, RECAP_FORMATS[format].width);

    const painted = ctx.calls.filter((call) => call[0] === "fillText");
    // The CTA is the line that must survive every card length above it.
    assert.ok(
      painted.some((call) => CARD_CTA.startsWith(String(call[1]).slice(0, 12))),
      "every card carries the invitation",
    );
    assert.ok(painted.some((call) => String(call[1]) === "3"), "the count is the poster");
    assert.ok(painted.some((call) => String(call[1]) === "@tinsley"), "the handle is in the footer");

    for (const [, , x, y] of painted) {
      assert.ok(x >= 0 && x <= shape.width, `text at x=${x} left the canvas`);
      assert.ok(y >= 0 && y <= shape.height, `text at y=${y} left the canvas`);
    }
  });
}

test("a long list of acts stops before it reaches the invitation", () => {
  const many = Array.from({ length: 40 }, (_, index) => ({
    clusterDate: `2020-01-${String((index % 28) + 1).padStart(2, "0")}`,
    artistNames: [`Act number ${index}`],
  }));
  const ctx = fakeContext();
  const story = buildReclaimStory(many, { handle: "tinsley" });
  const shape = drawReclaim(ctx, { story, format: "story" });
  for (const [, , , y] of ctx.calls.filter((call) => call[0] === "fillText")) {
    assert.ok(y <= shape.height, "the act list ran off the bottom of the card");
  }
});

test("the filename is safe to write to a disk", () => {
  assert.equal(reclaimFilename("Tinsley Zhu", "story"), "showtonic-reclaimed-tinsley-zhu-story.png");
  assert.equal(reclaimFilename("", "square"), "showtonic-reclaimed-reclaim-square.png");
  assert.doesNotMatch(reclaimFilename("../../etc/passwd", "story"), /\//);
});
