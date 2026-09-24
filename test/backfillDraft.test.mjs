import assert from "node:assert/strict";
import test from "node:test";

import { MAX_SUGGESTED_VIBES, VIBE_CHIP_GENRES, completeDraft, writeDraft } from "../convex/backfillDraft.js";
import { VIBE_VOCABULARY } from "../convex/showtonicUtils.js";

// A confirm-ready candidate with every evidence field present.
function fullCandidate(overrides = {}) {
  return {
    clusterDate: "2026-06-27",
    photoCount: 13,
    captureWindow: "10:22 PM–12:14 AM",
    show: { venueName: "The Independent", genres: ["house", "indie dance"] },
    ...overrides,
  };
}

// --- B.1 — every candidate drafts; empty genres never invent chips ----------

test("a confirm-ready candidate arrives with a caption and suggested vibes", () => {
  const draft = writeDraft(fullCandidate());
  assert.equal(typeof draft.caption, "string");
  assert.notEqual(draft.caption, "");
  assert.deepEqual(draft.vibes, ["danced nonstop"]);
});

test("an empty genre list yields empty vibes, never invented chips", () => {
  assert.deepEqual(writeDraft(fullCandidate({ show: { venueName: "The Independent", genres: [] } })).vibes, []);
  assert.deepEqual(writeDraft(fullCandidate({ show: { venueName: "The Independent" } })).vibes, []);
  assert.deepEqual(writeDraft(fullCandidate({ show: null })).vibes, []);
});

test("genres with no honest chip mapping yield empty vibes", () => {
  // A guitar-band night is a real genre list that maps to nothing — the
  // suggestion must be empty rather than stretched onto a dance-floor chip.
  const draft = writeDraft(fullCandidate({ show: { venueName: "Bottom of the Hill", genres: ["indie rock", "garage rock", "post-punk"] } }));
  assert.deepEqual(draft.vibes, []);
});

test("vibes are capped at three and never repeat", () => {
  // Every mapped chip at once — the cap is structural even though only two
  // chips have a genre basis today.
  const draft = writeDraft(fullCandidate({ show: { venueName: "The Chapel", genres: ["house", "psychedelic", "techno", "ambient", "shoegaze"] } }));
  assert.equal(draft.vibes.length <= MAX_SUGGESTED_VIBES, true);
  assert.equal(new Set(draft.vibes).size, draft.vibes.length);
  assert.deepEqual(draft.vibes, ["danced nonstop", "transcendent"]);
});

test("every mappable chip is one the log sheet's validator accepts", () => {
  // Drift guard: a chip outside VIBE_VOCABULARY would be a suggestion the
  // human could never have tapped (the sheet renders app/data.ts's five, a
  // subset of this list — both entries here are on the sheet).
  for (const chip of VIBE_CHIP_GENRES) {
    assert.equal(VIBE_VOCABULARY.includes(chip.vibe), true, `unknown vibe: ${chip.vibe}`);
  }
});

// --- B.2 — captions cite only the evidence on the candidate -----------------

test("the caption restates exactly the venue, window, count, and date present", () => {
  assert.equal(
    writeDraft(fullCandidate()).caption,
    "13 photos from 10:22 PM–12:14 AM at The Independent on Jun 27, 2026.",
  );
});

test("an absent fact is omitted, not bridged", () => {
  assert.equal(
    writeDraft(fullCandidate({ show: { genres: ["house"] } })).caption,
    "13 photos from 10:22 PM–12:14 AM on Jun 27, 2026.",
  );
  assert.equal(
    writeDraft(fullCandidate({ show: null })).caption,
    "13 photos from 10:22 PM–12:14 AM on Jun 27, 2026.",
  );
  assert.equal(
    writeDraft(fullCandidate({ captureWindow: undefined })).caption,
    "13 photos at The Independent on Jun 27, 2026.",
  );
});

test("a single photo reads as one photo", () => {
  assert.equal(
    writeDraft(fullCandidate({ photoCount: 1, show: null })).caption,
    "1 photo from 10:22 PM–12:14 AM on Jun 27, 2026.",
  );
});

test("an unusable date or an empty candidate composes nothing it does not have", () => {
  assert.equal(
    writeDraft(fullCandidate({ clusterDate: "not-a-date" })).caption,
    "13 photos from 10:22 PM–12:14 AM at The Independent.",
  );
  assert.deepEqual(writeDraft({}), { caption: "", vibes: [] });
});

// --- B.3 — determinism: same candidate + evidence, byte-identical draft -----

test("the same candidate drafts byte-for-byte identically", () => {
  const first = JSON.stringify(writeDraft(fullCandidate()));
  const second = JSON.stringify(writeDraft(fullCandidate()));
  assert.equal(first, second);
});

test("genre order never changes the draft", () => {
  // Genres arrive from set-union over the show's artists; their order must not
  // leak into the suggestion, which follows the sheet's chip order instead.
  const forward = JSON.stringify(writeDraft(fullCandidate({ show: { venueName: "The Chapel", genres: ["psychedelic", "house"] } })));
  const reversed = JSON.stringify(writeDraft(fullCandidate({ show: { venueName: "The Chapel", genres: ["house", "psychedelic"] } })));
  assert.equal(forward, reversed);
});

test("matching is case-insensitive and whitespace-tolerant", () => {
  const draft = writeDraft(fullCandidate({ show: { venueName: "The Midway", genres: ["  House ", "TECHNO"] } }));
  assert.deepEqual(draft.vibes, ["danced nonstop"]);
});

// --- The saveCandidates seam — server fills gaps, keeps the client's words ---

test("completeDraft fills an absent draft wholesale", () => {
  const computed = { caption: "13 photos.", vibes: ["danced nonstop"] };
  assert.deepEqual(completeDraft(undefined, computed), computed);
  assert.deepEqual(completeDraft(null, computed), computed);
});

test("completeDraft fills per field and keeps what the caller wrote", () => {
  const computed = { caption: "13 photos.", vibes: ["danced nonstop"] };
  assert.deepEqual(completeDraft({ caption: "My own words", vibes: null }, computed), {
    caption: "My own words",
    vibes: ["danced nonstop"],
  });
  assert.deepEqual(completeDraft({ caption: undefined, vibes: ["transcendent"] }, computed), {
    caption: "13 photos.",
    vibes: ["transcendent"],
  });
  assert.deepEqual(completeDraft({ caption: "Mine", vibes: [] }, computed), { caption: "Mine", vibes: [] });
});

test("completeDraft never returns a null draft", () => {
  assert.deepEqual(completeDraft(undefined, undefined), { caption: "", vibes: [] });
});
