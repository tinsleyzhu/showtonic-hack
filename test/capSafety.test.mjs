import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// A fence for a bug class our tests cannot catch.
//
// Twice in one day a `.take()` ran BEFORE the filter that decided what we were
// actually looking for. The artist page truncated a date window to its oldest
// rows and then filtered by artist, so every artist with recent shows rendered
// nothing. `briefing.forUser` truncated `squadPlans` in insertion order and
// then filtered by membership, so past two hundred plans a member's own squad
// night could vanish from their feed. Neither failed loudly; both were only
// visible against real data.
//
// There is no Convex test harness here — every other test in this repo runs
// against a pure module — so this class cannot be proved by unit test. What
// CAN be enforced is that the reasoning exists at all: a cap is only safe when
// the index order IS the thing being selected on, and whoever writes one has
// to say which case they are in.
//
// This does not verify the justification. It makes the next person write one,
// at the moment the bug is cheap.
const CONVEX_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "convex");
const TAG = /\/\/\s*cap-(safe|review):\s*(\S.*)$/;
const LOOKBACK = 6;

function callSites() {
  const sites = [];
  for (const file of readdirSync(CONVEX_DIR).filter((name) => name.endsWith(".ts"))) {
    const lines = readFileSync(join(CONVEX_DIR, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      // The comment blocks that discuss `.take()` are not call sites.
      if (!/\.take\(/.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
      sites.push({ file, line: index + 1, source: line, window: lines.slice(Math.max(0, index - LOOKBACK), index + 1) });
    });
  }
  return sites;
}

test("every .take() in convex/ says why its cap is safe", () => {
  const untagged = callSites().filter((site) => !site.window.some((line) => TAG.test(line)));

  assert.deepEqual(
    untagged.map((site) => `${site.file}:${site.line} — ${site.source.trim()}`),
    [],
    "Tag the line above with `// cap-safe: <why the index order IS the selection>`, " +
      "or `// cap-review: <the consequence, and why it is not fixed yet>` if it is not safe.",
  );
});

test("a justification has to say something", () => {
  for (const site of callSites()) {
    const tagged = site.window.map((line) => TAG.exec(line)).find(Boolean);
    if (!tagged) continue;
    assert.ok(
      tagged[2].trim().length >= 20,
      `${site.file}:${site.line} — "${tagged[2].trim()}" is not a reason, it is a shrug`,
    );
  }
});

test("the fence covers the call sites we know about", () => {
  // A guard on the guard: if a refactor moves every `.take()` behind a helper,
  // this test would pass by finding nothing at all and quietly stop fencing.
  assert.ok(callSites().length >= 8, `only ${callSites().length} call sites found — has the fence stopped seeing them?`);
});

// The debt register. Not a permission slip: a new unsafe cap cannot be waved
// through by writing a comment, because this list has to be edited too, and
// editing it is a decision someone signs their name to in a diff.
//
//   activity.ts ×2 — a live defect in another lane's file, flagged in TEAM.md
//   briefing.ts ×2 — bounded approximations: they can omit an evidence row,
//                    never produce a wrong one
const DECLARED_UNSAFE = ["activity.ts", "activity.ts", "briefing.ts", "briefing.ts"];

test("known-unsafe caps are declared here, not silently tolerated", () => {
  const review = callSites()
    .filter((site) => site.window.some((line) => /\/\/\s*cap-review:/.test(line)))
    .map((site) => site.file)
    .sort();

  assert.deepEqual(review, [...DECLARED_UNSAFE].sort());
});
