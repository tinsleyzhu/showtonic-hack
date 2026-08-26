import assert from "node:assert/strict";
import test from "node:test";

import { describeArtistHistory, describeVenueHistory } from "../app/receipts.js";

test("artist receipt cites first-seen year and personal average (design 23)", () => {
  assert.equal(
    describeArtistHistory({ showCount: 6, firstSeenYear: "2022", averageRating: 4.8 }, "Fred again.."),
    "You first saw Fred again.. in 2022. Your average rating is 4.8.",
  );
});

test("artist receipt without a rating stays factual", () => {
  assert.equal(
    describeArtistHistory({ showCount: 2, firstSeenYear: "2024", averageRating: null }, "Romy"),
    "You first saw Romy in 2024.",
  );
  assert.equal(
    describeArtistHistory({ showCount: 1, firstSeenYear: null, averageRating: null }, "Romy"),
    "You've seen Romy once.",
  );
});

test("empty artist history renders nothing (empty-room rule)", () => {
  assert.equal(describeArtistHistory(null, "Anyone"), "");
  assert.equal(describeArtistHistory({ showCount: 0 }, "Anyone"), "");
});

test("venue receipt ranks the room and cites the last show (design 24)", () => {
  assert.equal(
    describeVenueHistory({
      showCount: 9,
      rank: 2,
      lastSeen: { artistName: "Turnstile", date: "2026-08-24" },
    }),
    "Your second most-visited venue. Last seen: Turnstile · Aug 24.",
  );
});

test("deep-ranked venues fall back to a plain night count", () => {
  assert.equal(
    describeVenueHistory({ showCount: 1, rank: 7, lastSeen: null }),
    "1 night in this room.",
  );
  assert.equal(describeVenueHistory(null), "");
});
