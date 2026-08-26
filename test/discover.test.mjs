import assert from "node:assert/strict";
import test from "node:test";

import { dateRangeForPreset, reasonForShow } from "../app/discover.js";

// --- Reason strings --------------------------------------------------------

test("watchlist shelf always explains itself as the user's own save", () => {
  assert.equal(
    reasonForShow({ artistNames: ["Anyone"] }, { shelf: "watchlist", favoriteArtists: ["Anyone"] }),
    "From your watchlist",
  );
});

test("followed artists outrank taste-seed picks", () => {
  const show = { artistNames: ["Jamie xx", "Romy"] };
  assert.equal(
    reasonForShow(show, { followedArtistNames: ["romy"], favoriteArtists: ["Jamie xx"] }),
    "Because you follow Romy",
  );
  assert.equal(
    reasonForShow(show, { favoriteArtists: ["jamie XX"] }),
    "Because you picked Jamie xx",
  );
});

test("popular shelf cites real activity and never invents numbers", () => {
  assert.equal(
    reasonForShow({ goingCount: 2, loggedCount: 1 }, { shelf: "popular" }),
    "3 showgoers active",
  );
  assert.equal(reasonForShow({}, { shelf: "popular" }), "Trending near you");
  assert.equal(reasonForShow({ goingCount: 1 }, { shelf: "trending" }), "1 showgoer active");
});

test("weekend and nearby shelves name the city", () => {
  assert.equal(
    reasonForShow({ city: "San Francisco" }, { shelf: "weekend" }),
    "This weekend in San Francisco",
  );
  assert.equal(reasonForShow({}, { shelf: "weekend" }), "This weekend");
  assert.equal(reasonForShow({ city: "Oakland" }, { shelf: "nearby" }), "Near you in Oakland");
});

test("falls back to verified ratings, then activity, then silence", () => {
  assert.equal(
    reasonForShow({ rating: 4.6, ratingCount: 12 }),
    "Rated 4.6 by verified fans",
  );
  assert.equal(reasonForShow({ rating: 3.0, ratingCount: 5, goingCount: 2 }), "2 showgoers active");
  assert.equal(reasonForShow({}), "");
});

// --- Date presets ----------------------------------------------------------

test("tonight preset is a single-day range", () => {
  assert.deepEqual(dateRangeForPreset("tonight", "2026-08-17"), {
    from: "2026-08-17",
    to: "2026-08-17",
  });
});

test("weekend preset spans the coming Friday through Sunday", () => {
  // 2026-08-17 is a Monday → Fri 21 to Sun 23
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-17"), {
    from: "2026-08-21",
    to: "2026-08-23",
  });
});

test("mid-weekend the range starts today", () => {
  // 2026-08-22 is a Saturday → today through Sunday 23
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-22"), {
    from: "2026-08-22",
    to: "2026-08-23",
  });
  // Sunday → just today
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-23"), {
    from: "2026-08-23",
    to: "2026-08-23",
  });
});

test("custom preset leaves bounds to the caller", () => {
  assert.deepEqual(dateRangeForPreset("custom", "2026-08-17"), { from: "", to: "" });
});
