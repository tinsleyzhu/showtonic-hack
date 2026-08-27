import assert from "node:assert/strict";
import test from "node:test";

import { buildOverlapStory, drawOverlap, overlapFilename } from "../app/overlapCanvas.js";
import { CARD_CTA, RECAP_FORMATS } from "../app/recapCanvas.js";

function fakeContext() {
  const calls = [];
  const state = { fillStyle: "", font: "", textAlign: "left", textBaseline: "" };
  return {
    calls,
    save() {}, restore() {},
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    fillText(text, x, y) { calls.push(["fillText", text, x, y]); },
    measureText(text) { return { width: String(text).length * 18 }; },
    set fillStyle(v) { state.fillStyle = v; }, get fillStyle() { return state.fillStyle; },
    set font(v) { state.font = v; }, get font() { return state.font; },
    set textAlign(v) { state.textAlign = v; }, get textAlign() { return state.textAlign; },
    set textBaseline(v) { state.textBaseline = v; }, get textBaseline() { return state.textBaseline; },
  };
}

const INPUT = {
  mine: "tinsley",
  theirs: "nova",
  matchPercent: 78,
  sharedArtists: [{ name: "Jamie xx", showCount: 2 }, { name: "MUNA", showCount: 1 }, { name: "Fred again..", showCount: 3 }, { name: "Overflow", showCount: 1 }],
  sharedShowCount: 2,
};

test("the card names both people, because it is addressed to one of them", () => {
  const story = buildOverlapStory(INPUT);
  assert.equal(story.pair, "@tinsley + @nova");
  assert.equal(story.shareText, "@tinsley and @nova hear music the same way — 78% taste overlap.");
});

test("a card with nobody on the other side is not a card", () => {
  assert.equal(buildOverlapStory({ mine: "tinsley", matchPercent: 90 }).empty, true);
  assert.equal(buildOverlapStory({}).empty, true);
  assert.equal(buildOverlapStory().empty, true);
});

test("a viewer whose own handle is unknown still gets a sendable sentence", () => {
  const story = buildOverlapStory({ ...INPUT, mine: "" });
  assert.equal(story.shareText, "78% taste overlap with @nova.");
  assert.equal(story.pair, "@nova");
});

test("handles are accepted with or without the at sign, and never doubled", () => {
  const story = buildOverlapStory({ ...INPUT, mine: "@tinsley", theirs: "@nova" });
  assert.equal(story.pair, "@tinsley + @nova");
  assert.doesNotMatch(story.shareText, /@@/);
});

test("the percentage cannot leave its range or arrive as a fraction", () => {
  assert.equal(buildOverlapStory({ ...INPUT, matchPercent: 78.6 }).percent, 79);
  assert.equal(buildOverlapStory({ ...INPUT, matchPercent: 140 }).percent, 100);
  assert.equal(buildOverlapStory({ ...INPUT, matchPercent: -5 }).percent, 0);
  assert.equal(buildOverlapStory({ ...INPUT, matchPercent: undefined }).percent, 0);
});

test("three shared artists, no more — the card is evidence, not a database dump", () => {
  const story = buildOverlapStory(INPUT);
  assert.deepEqual(story.names, ["Jamie xx", "MUNA", "Fred again.."]);
});

test("nothing of the other person's diary is carried onto the card", () => {
  // The peer-surface rule: match strength and shared artist names only. If this
  // object ever grows a rating, a venue or a date, that rule has been broken.
  const story = buildOverlapStory(INPUT);
  assert.deepEqual(
    Object.keys(story).sort(),
    ["empty", "headline", "me", "names", "pair", "percent", "shareText", "shows", "them"],
  );
});

for (const format of ["story", "square"]) {
  test(`${format}: the pair, the number, the receipts and the invitation all land on the canvas`, () => {
    const ctx = fakeContext();
    const story = buildOverlapStory(INPUT);
    const shape = drawOverlap(ctx, { story, format });
    assert.equal(shape.width, RECAP_FORMATS[format].width);

    const painted = ctx.calls.filter((call) => call[0] === "fillText");
    const texts = painted.map((call) => String(call[1]));
    assert.ok(texts.includes("78%"), "the number is the poster");
    assert.ok(texts.includes("@tinsley + @nova"), "both handles are on it");
    assert.ok(texts.includes("Jamie xx"), "the receipts are named");
    assert.ok(texts.some((text) => CARD_CTA.startsWith(text.slice(0, 12))), "every card carries the invitation");

    for (const [, , x, y] of painted) {
      assert.ok(x >= 0 && x <= shape.width, `text at x=${x} left the canvas`);
      assert.ok(y >= 0 && y <= shape.height, `text at y=${y} left the canvas`);
    }
  });
}

test("the filename is safe to write to a disk", () => {
  assert.equal(overlapFilename("@nova", "story"), "showtonic-overlap-nova-story.png");
  assert.doesNotMatch(overlapFilename("../../etc/passwd", "square"), /\//);
});
