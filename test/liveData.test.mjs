import assert from "node:assert/strict";
import test from "node:test";

import {
  getStoredHandle,
  parseUploadResponse,
  toMemory,
} from "../app/liveData.js";

test("getStoredHandle defaults once and normalizes the at-sign", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getStoredHandle(storage), "tinsley");
  values.set("showtonic.handle", "@Maya");
  assert.equal(getStoredHandle(storage), "maya");
});

test("parseUploadResponse requires a Convex storage id", () => {
  assert.equal(parseUploadResponse({ storageId: "kg2abc" }), "kg2abc");
  assert.throws(() => parseUploadResponse({}), /storageId/);
});

test("toMemory uses uploaded media before the show fallback", () => {
  const memory = toMemory({
    _id: "log1",
    showId: "show1",
    rating: 5,
    vibes: ["transcendent"],
    note: "Great",
    caption: "Fog",
    song: "360",
    showTitle: "Charli XCX",
    showDate: "2026-08-07",
    showImage: "/fallback.jpg",
    artistNames: ["Charli XCX"],
    media: [{ url: "/upload.jpg", kind: "photo" }],
  });

  assert.equal(memory.photo, "/upload.jpg");
  assert.equal(memory.caption, "Fog");
});
