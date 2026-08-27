import assert from "node:assert/strict";
import test from "node:test";

import { coverRect, drawRecap, RECAP_FORMATS, recapFilename, wrapLines } from "../app/recapCanvas.js";
import { buildRecap } from "../convex/recapSummary.js";

// A 2D context that records instead of painting. Every character is ~18px wide,
// which is close enough to a real 34px sans face for wrapping assertions and
// deterministic, which measureText is not.
function fakeContext() {
  const calls = [];
  const state = { fillStyle: "", font: "", textAlign: "left", textBaseline: "" };
  return {
    calls,
    state,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    drawImage(...args) { calls.push(["drawImage", ...args]); },
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

function sampleRecap() {
  const logs = [
    { showId: "a", showTitle: "Fred again.. at The Midway", showDate: "2022-03-04", artistNames: ["Fred again.."], venueName: "The Midway", city: "San Francisco", rating: 5, source: "reclaim" },
    { showId: "b", showTitle: "Fred again.. at 1015 Folsom", showDate: "2023-08-19", artistNames: ["Fred again.."], venueName: "1015 Folsom", city: "San Francisco", rating: 4.5, source: "live" },
    { showId: "c", showTitle: "MUNA at The Fillmore", showDate: "2024-02-02", artistNames: ["MUNA"], venueName: "The Fillmore", city: "San Francisco", rating: 4, source: "live" },
    { showId: "d", showTitle: "Caroline Polachek at The Warfield", showDate: "2025-05-05", artistNames: ["Caroline Polachek"], venueName: "The Warfield", city: "San Francisco", rating: 4.5, source: "live" },
    { showId: "e", showTitle: "Jamie xx at Public Works", showDate: "2025-11-11", artistNames: ["Jamie xx"], venueName: "Public Works", city: "San Francisco", rating: 5, source: "live" },
  ];
  return { handle: "tinsley", photos: [], ...buildRecap(logs) };
}

test("cover crops the long side instead of squashing the photo", () => {
  const wide = coverRect(4000, 2000, 1080, 1080);
  assert.equal(wide.sHeight, 2000);
  assert.equal(wide.sWidth, 2000);
  assert.equal(wide.sx, 1000); // centred

  const tall = coverRect(2000, 4000, 1080, 1080);
  assert.equal(tall.sWidth, 2000);
  assert.equal(tall.sHeight, 2000);
  assert.equal(tall.sy, 1000);
});

test("cover survives an image with no dimensions rather than dividing by zero", () => {
  const rect = coverRect(0, 0, 1080, 1920);
  assert.ok(Number.isFinite(rect.sx) && Number.isFinite(rect.sy));
});

test("wrapping keeps every word, including one too long for the line", () => {
  const measure = (text) => text.length * 10;
  const lines = wrapLines("four years of nights back in one place", 100, measure);
  assert.equal(lines.join(" "), "four years of nights back in one place");

  const long = wrapLines("Supercalifragilisticexpialidocious", 100, measure);
  assert.deepEqual(long, ["Supercalifragilisticexpialidocious"]);
});

test("wrapping past the line budget ellipses rather than silently truncating", () => {
  const measure = (text) => text.length * 10;
  const lines = wrapLines("one two three four five six seven eight", 100, measure, 2);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /…$/);
});

test("both export shapes are the sizes people actually post", () => {
  assert.deepEqual(
    [RECAP_FORMATS.story.width, RECAP_FORMATS.story.height],
    [1080, 1920],
  );
  assert.deepEqual(
    [RECAP_FORMATS.square.width, RECAP_FORMATS.square.height],
    [1080, 1080],
  );
});

test("the story render paints a background, the numbers, the artists and the handle", () => {
  const ctx = fakeContext();
  const shape = drawRecap(ctx, { recap: sampleRecap(), format: "story" });
  assert.deepEqual([shape.width, shape.height], [1080, 1920]);

  const painted = ctx.calls.filter((call) => call[0] === "fillRect");
  assert.deepEqual(painted[0], ["fillRect", 0, 0, 1080, 1920]); // opaque ground first

  const text = ctx.calls.filter((call) => call[0] === "fillText").map((call) => call[1]);
  assert.ok(text.includes("5 shows and counting"));
  assert.ok(text.includes("Four years of nights, back in one place."));
  assert.ok(text.includes("Fred again.."));
  assert.ok(text.includes("SHOWS") && text.includes("ARTISTS") && text.includes("VENUES"));
  assert.ok(text.includes("@tinsley"));
  assert.ok(text.includes("showtonic"));
});

test("nothing is painted outside the canvas in either shape", () => {
  for (const format of ["story", "square"]) {
    const ctx = fakeContext();
    const shape = drawRecap(ctx, { recap: sampleRecap(), format });
    for (const call of ctx.calls) {
      if (call[0] !== "fillText") continue;
      const [, , x, y] = call;
      assert.ok(x >= 0 && x <= shape.width, `${format}: x ${x} off-canvas`);
      assert.ok(y >= 0 && y <= shape.height, `${format}: y ${y} off-canvas for "${call[1]}"`);
    }
  }
});

test("a photo that could not be loaded degrades to a painted hero, not a crash", () => {
  const ctx = fakeContext();
  const recap = { ...sampleRecap(), photos: [{ url: "https://example.test/a.jpg" }] };
  drawRecap(ctx, { recap, format: "square", images: new Map() });
  assert.equal(ctx.calls.filter((call) => call[0] === "drawImage").length, 0);
  assert.ok(ctx.calls.some((call) => call[0] === "fillText" && call[1] === "@tinsley"));
});

test("a loaded photo is drawn as the hero", () => {
  const ctx = fakeContext();
  const recap = { ...sampleRecap(), photos: [{ url: "https://example.test/a.jpg" }] };
  const images = new Map([["https://example.test/a.jpg", { width: 3000, height: 4000 }]]);
  drawRecap(ctx, { recap, format: "story", images });
  const drawn = ctx.calls.find((call) => call[0] === "drawImage");
  assert.ok(drawn);
  assert.deepEqual(drawn.slice(6), [0, 0, 1080, 1080]); // fills the hero box exactly
});

test("the filename is safe to write to a disk", () => {
  assert.equal(recapFilename("tinsley", "story"), "showtonic-recap-tinsley-story.png");
  assert.equal(recapFilename("../../etc/passwd", "square"), "showtonic-recap-etcpasswd-square.png");
  assert.equal(recapFilename("", "story"), "showtonic-recap-recap-story.png");
});
