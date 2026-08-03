import assert from "node:assert/strict";
import test from "node:test";

import {
  describeSaveResult,
  filterMemories,
  groupMemories,
  getStoredHandle,
  parseUploadResponse,
  toMemory,
  toShow,
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

test("toShow never treats a venue name as a Convex document id", () => {
  const show = toShow({
    _id: "show1",
    title: "Violent Femmes at Stern Grove",
    venueName: "Stern Grove",
    artistNames: ["Violent Femmes"],
  });

  assert.equal(show.venueId, "");
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

test("filterMemories sorts ratings and keeps only persisted records", () => {
  const memories = [
    {
      id: "low",
      rating: 3,
      artistNames: ["A"],
      artistGenres: ["rock"],
      city: "SF",
      venueName: "Park",
      date: "2026-08-08",
      photo: "/low.jpg",
    },
    {
      id: "high",
      rating: 5,
      artistNames: ["B"],
      artistGenres: ["pop"],
      city: "SF",
      venueName: "Room",
      date: "2026-08-07",
      photo: "/high.jpg",
    },
  ];

  assert.deepEqual(
    filterMemories(memories, "Rating").map((item) => item.id),
    ["high", "low"],
  );
  assert.deepEqual(
    filterMemories(memories, "City").map((item) => item.id),
    ["high", "low"],
  );
});

test("groupMemories creates counted groups with newest entries first", () => {
  const memories = [
    { id: "old", date: "2026-01-01", rating: 4, artistNames: ["A"], venueName: "Park" },
    { id: "new", date: "2026-02-01", rating: 5, artistNames: ["A", "B"], venueName: "Park" },
  ];

  const artists = groupMemories(memories, "Artist");
  assert.equal(artists[0].label, "A");
  assert.equal(artists[0].count, 2);
  assert.deepEqual(artists[0].memories.map((item) => item.id), ["new", "old"]);
  assert.equal(groupMemories(memories, "Venue")[0].count, 2);
});

test("describeSaveResult preserves a saved log when media fails", () => {
  assert.deepEqual(describeSaveResult({ logId: "log1", mediaError: "Upload failed" }), {
    saved: true,
    phase: "saved-with-media-error",
    message: "Upload failed",
  });
});
