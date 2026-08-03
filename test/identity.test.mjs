import assert from "node:assert/strict";
import test from "node:test";

import { selectIdentityForHandle } from "../app/identity.js";

const resolvedIdentity = {
  handle: "maya",
  user: { _id: "user-maya", handle: "maya" },
  error: "Could not resolve maya",
};

test("selects identity only for the requested handle", () => {
  assert.deepEqual(selectIdentityForHandle("maya", resolvedIdentity), {
    user: resolvedIdentity.user,
    error: resolvedIdentity.error,
  });
});

test("masks stale identity when the requested handle changes", () => {
  assert.deepEqual(selectIdentityForHandle("tinsley", resolvedIdentity), {
    user: null,
    error: "",
  });
});

test("masks stale identity when the requested handle is cleared", () => {
  assert.deepEqual(selectIdentityForHandle(undefined, resolvedIdentity), {
    user: null,
    error: "",
  });
});
