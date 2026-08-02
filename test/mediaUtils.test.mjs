import assert from "node:assert/strict";
import test from "node:test";

import { inferMediaKind } from "../convex/mediaUtils.js";

test("inferMediaKind returns photo for image content types", () => {
  assert.equal(inferMediaKind("image/jpeg"), "photo");
});

test("inferMediaKind returns video for video content types", () => {
  assert.equal(inferMediaKind("video/mp4"), "video");
});
