import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoveryShelves,
  matchesSearch,
  normalizeSearchTerm,
  summarizeRatings,
  validateLogInput,
} from "../convex/showtonicUtils.js";

test("validateLogInput rejects ratings outside half-star steps", () => {
  assert.throws(() => validateLogInput({ rating: 4.2, vibes: ["sweaty"] }), /half-star/);
  assert.throws(() => validateLogInput({ rating: 5.5, vibes: ["sweaty"] }), /between/);
});

test("validateLogInput rejects vibes outside the fixed vocabulary", () => {
  assert.throws(
    () => validateLogInput({ rating: 4.5, vibes: ["pretty good"] }),
    /Unknown vibe/,
  );
});

test("summarizeRatings returns a stable zero state and rounded average", () => {
  assert.deepEqual(summarizeRatings([]), { rating: 0, ratingCount: 0 });
  assert.deepEqual(summarizeRatings([{ rating: 4 }, { rating: 5 }]), {
    rating: 4.5,
    ratingCount: 2,
  });
});

test("normalizeSearchTerm is case and diacritic insensitive", () => {
  assert.equal(normalizeSearchTerm("  RÜFÜS  "), "rufus");
});

test("buildDiscoveryShelves ranks popular shows without inventing records", () => {
  const shows = [
    {
      id: "quiet",
      rating: 5,
      ratingCount: 1,
      goingCount: 0,
      date: "2026-08-09",
      artistNames: ["Quiet Artist"],
    },
    {
      id: "busy",
      rating: 4.5,
      ratingCount: 4,
      goingCount: 3,
      date: "2026-08-08",
      artistNames: ["Busy Artist"],
    },
  ];

  const shelves = buildDiscoveryShelves(shows);
  assert.deepEqual(
    shelves.popularThisWeek.map((show) => show.id),
    ["busy", "quiet"],
  );
  assert.equal(new Set(shelves.thisWeekend.map((show) => show.id)).size, 2);
});

test("matchesSearch finds artist, venue, city, and title without accents", () => {
  const show = {
    title: "Night Set",
    artistNames: ["RÜFÜS DU SOL"],
    venueName: "Golden Gate Park",
    city: "San Francisco",
  };

  assert.equal(matchesSearch(show, "rufus"), true);
  assert.equal(matchesSearch(show, "golden gate"), true);
  assert.equal(matchesSearch(show, "oakland"), false);
});
