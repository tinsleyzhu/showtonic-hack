import assert from "node:assert/strict";
import test from "node:test";

import { tasteScore } from "../convex/tasteMath.js";

test("tasteScore rewards shared artists and same-show overlap", () => {
  const score = tasteScore(
    ["Charli XCX", "RÜFÜS DU SOL", "The Strokes"],
    ["RÜFÜS DU SOL", "The Strokes", "MUNA"],
    2,
  );

  assert.equal(score, 0.8);
});
