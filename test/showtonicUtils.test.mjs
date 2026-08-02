import assert from "node:assert/strict";
import test from "node:test";

import {
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
