import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_ARTISTS,
  ONBOARDING_STEPS,
  TASTE_SEED_MIN,
  canLeaveOnboardingStep,
  describeTasteSelection,
  findFirstHistoricalPreferredShow,
  findFirstPreferredShow,
  markOnboardingSignedOut,
  nextOnboardingStep,
  normalizeFavoriteArtists,
  previousOnboardingStep,
  prioritizeShowsByArtists,
  readOnboardingProfile,
  validateOnboardingHandle,
  writeLoginProfile,
  writeOnboardingProfile,
} from "../app/onboarding.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values,
    writes,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

test("validates and normalizes onboarding handles", () => {
  assert.deepEqual(validateOnboardingHandle(" @Maya_7 "), {
    handle: "maya_7",
    error: "",
  });
  assert.match(validateOnboardingHandle(" ").error, /required/);
  assert.match(validateOnboardingHandle("x").error, /3 characters/);
  assert.match(validateOnboardingHandle("bad handle").error, /letters, numbers, and underscores/);
  assert.match(validateOnboardingHandle("a".repeat(21)).error, /20 characters/);
});

test("reads an incomplete default profile from empty storage", () => {
  assert.deepEqual(readOnboardingProfile(createStorage()), {
    completed: false,
    handle: "tinsley",
    favoriteArtists: [],
    homeCity: "",
    visibility: "public",
  });
});

test("defensively ignores malformed favorites and migrates an existing handle", () => {
  const storage = createStorage({
    "showtonic.handle": " @Maya_7 ",
    "showtonic.favoriteArtists.v1": "not-json",
  });

  assert.deepEqual(readOnboardingProfile(storage), {
    completed: false,
    handle: "maya_7",
    favoriteArtists: [],
    homeCity: "",
    visibility: "public",
  });
});

test("reads completion, home city, and visibility from versioned markers", () => {
  const storage = createStorage({
    "showtonic.onboarding.v1": "complete",
    "showtonic.handle": "maya_7",
    "showtonic.favoriteArtists.v1": JSON.stringify(["Doechii", "MUNA"]),
    "showtonic.homeCity": "New York",
    "showtonic.visibility.v1": "private",
  });

  assert.deepEqual(readOnboardingProfile(storage), {
    completed: true,
    handle: "maya_7",
    favoriteArtists: ["Doechii", "MUNA"],
    homeCity: "New York",
    visibility: "private",
  });
});

test("reads a returning session without requiring taste onboarding again", () => {
  const storage = createStorage({
    "showtonic.session.v1": "authenticated",
    "showtonic.handle": "tinsley",
  });

  assert.equal(readOnboardingProfile(storage).completed, true);
});

test("a signed-out marker overrides a previously completed onboarding", () => {
  const storage = createStorage({
    "showtonic.session.v1": "authenticated",
    "showtonic.onboarding.v1": "complete",
    "showtonic.handle": "tinsley",
    "showtonic.favoriteArtists.v1": JSON.stringify(["Doechii", "MUNA"]),
  });

  assert.deepEqual(markOnboardingSignedOut(storage, readOnboardingProfile(storage)), {
    completed: false,
    handle: "tinsley",
    favoriteArtists: ["Doechii", "MUNA"],
    homeCity: "",
    visibility: "public",
  });
  assert.equal(readOnboardingProfile(storage).completed, false);
});

test("does not trust completion when the persisted handle is invalid but preserves valid picks", () => {
  const storage = createStorage({
    "showtonic.onboarding.v1": "complete",
    "showtonic.handle": "bad handle",
    "showtonic.favoriteArtists.v1": JSON.stringify(["Doechii"]),
  });

  const profile = readOnboardingProfile(storage);
  assert.equal(profile.completed, false);
  assert.equal(profile.handle, "tinsley");
  assert.deepEqual(profile.favoriteArtists, ["Doechii"]);
});

test("accepts catalog artists, dedupes case-insensitively, and drops empties", () => {
  assert.deepEqual(
    normalizeFavoriteArtists(["Doechii", "  ", "doechii", "Overmono", 42, "Fred again.."]),
    ["Doechii", "Overmono", "Fred again.."],
  );
  // The static list survives only as a fallback for pre-catalog renders.
  assert.equal(ONBOARDING_ARTISTS.length >= 5, true);
});

test("writes normalized profile fields plus home base and visibility", () => {
  const storage = createStorage();

  assert.deepEqual(
    writeOnboardingProfile(storage, {
      handle: " @Maya_7 ",
      favoriteArtists: ["Doechii", "Unknown Artist", "Doechii", "MUNA"],
      homeCity: " New York ",
      visibility: "private",
    }),
    {
      completed: true,
      handle: "maya_7",
      favoriteArtists: ["Doechii", "Unknown Artist", "MUNA"],
      homeCity: "New York",
      visibility: "private",
    },
  );
  assert.deepEqual(storage.writes, [
    ["showtonic.handle", "maya_7"],
    ["showtonic.favoriteArtists.v1", JSON.stringify(["Doechii", "Unknown Artist", "MUNA"])],
    ["showtonic.homeCity", "New York"],
    ["showtonic.visibility.v1", "private"],
    ["showtonic.onboarding.v1", "complete"],
    ["showtonic.session.v1", "authenticated"],
  ]);
});

test("skipped home base is not persisted and visibility defaults to public", () => {
  const storage = createStorage();
  const result = writeOnboardingProfile(storage, {
    handle: "maya_7",
    favoriteArtists: ["Doechii", "MUNA"],
  });
  assert.equal(result.homeCity, "");
  assert.equal(result.visibility, "public");
  assert.equal(storage.writes.some(([key]) => key === "showtonic.homeCity"), false);
});

test("writes a returning login session without rewriting onboarding choices", () => {
  const storage = createStorage();

  const result = writeLoginProfile(storage, " @Tinsley ", ["Doechii"]);
  assert.equal(result.completed, true);
  assert.equal(result.handle, "tinsley");
  assert.deepEqual(storage.writes, [
    ["showtonic.handle", "tinsley"],
    ["showtonic.session.v1", "authenticated"],
  ]);
});

test("does not persist a returning session for an invalid handle", () => {
  const storage = createStorage();
  assert.equal(writeLoginProfile(storage, "bad handle").completed, false);
  assert.deepEqual(storage.writes, []);
});

test("does not persist or complete onboarding with fewer than two valid favorites", () => {
  for (const favoriteArtists of [undefined, "not-an-array", ["Doechii"], ["Doechii", "doechii"]]) {
    const storage = createStorage();
    const result = writeOnboardingProfile(storage, { handle: "maya_7", favoriteArtists });
    assert.equal(result.completed, false);
    assert.deepEqual(storage.writes, []);
  }
});

test("keeps onboarding complete when storage writes fail", () => {
  const failingStorage = {
    setItem() {
      throw new Error("Storage unavailable");
    },
  };

  const result = writeOnboardingProfile(failingStorage, {
    handle: "@Maya",
    favoriteArtists: ["Doechii", "Charli XCX"],
  });
  assert.equal(result.completed, true);
});

test("does not persist or complete onboarding for an invalid handle", () => {
  const storage = createStorage();
  const result = writeOnboardingProfile(storage, {
    handle: "bad handle",
    favoriteArtists: ["Doechii"],
  });
  assert.equal(result.completed, false);
  assert.deepEqual(storage.writes, []);
});

test("wizard steps advance and retreat with clamping", () => {
  assert.deepEqual(ONBOARDING_STEPS, ["welcome", "identity", "taste", "homebase", "handoff"]);
  assert.equal(nextOnboardingStep("welcome"), "identity");
  assert.equal(nextOnboardingStep("homebase"), "handoff");
  assert.equal(nextOnboardingStep("handoff"), "handoff");
  assert.equal(previousOnboardingStep("identity"), "welcome");
  assert.equal(previousOnboardingStep("welcome"), "welcome");
  assert.equal(nextOnboardingStep("bogus"), "identity");
});

test("identity step requires a valid handle to advance", () => {
  assert.equal(canLeaveOnboardingStep("identity", { handle: "maya_7" }).ok, true);
  const blocked = canLeaveOnboardingStep("identity", { handle: "x" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /3 characters/);
});

test("taste step gates on five picks per design 04", () => {
  assert.equal(TASTE_SEED_MIN, 5);
  const four = canLeaveOnboardingStep("taste", {
    favoriteArtists: ["A", "B", "C", "D"],
  });
  assert.equal(four.ok, false);
  assert.match(four.reason, /1 more artist/);
  assert.equal(
    canLeaveOnboardingStep("taste", { favoriteArtists: ["A", "B", "C", "D", "E"] }).ok,
    true,
  );
});

test("home base and handoff are always skippable", () => {
  assert.equal(canLeaveOnboardingStep("homebase", {}).ok, true);
  assert.equal(canLeaveOnboardingStep("handoff", {}).ok, true);
});

test("taste meter copy tracks the design language", () => {
  assert.match(describeTasteSelection(0), /Pick at least 5/);
  assert.equal(describeTasteSelection(3), "3 selected · 2 more to personalize");
  assert.equal(describeTasteSelection(5), "5 selected · enough to personalize");
  assert.equal(describeTasteSelection(9), "9 selected · enough to personalize");
});

const shows = [
  { id: "charli", artistNames: ["Charli XCX"] },
  { id: "doechii", artistNames: ["Doechii"] },
  { id: "jamie", artistNames: ["Jamie xx"] },
];

test("prioritizes matching shows stably without mutating the source", () => {
  assert.deepEqual(
    prioritizeShowsByArtists(shows, ["Doechii"]).map((show) => show.id),
    ["doechii", "charli", "jamie"],
  );
  assert.deepEqual(shows.map((show) => show.id), ["charli", "doechii", "jamie"]);
});

test("finds the first show by favorite selection order and falls back to the first show", () => {
  assert.equal(findFirstPreferredShow(shows, ["Jamie xx", "Doechii"]).id, "jamie");
  assert.equal(findFirstPreferredShow(shows, ["Some Unknown"]).id, "charli");
});

test("selects a favorite historical show and never falls back to an upcoming show", () => {
  const catalog = [
    { id: "upcoming-favorite", date: "2026-08-03", artistNames: ["Doechii"] },
    { id: "past-other", date: "2026-08-01", artistNames: ["MUNA"] },
    { id: "past-favorite", date: "2026-07-31", artistNames: ["Doechii"] },
  ];

  assert.equal(
    findFirstHistoricalPreferredShow(catalog, ["Doechii", "MUNA"], "2026-08-02").id,
    "past-favorite",
  );
  assert.equal(
    findFirstHistoricalPreferredShow([catalog[0]], ["Doechii"], "2026-08-02"),
    undefined,
  );
});
