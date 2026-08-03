import assert from "node:assert/strict";
import test from "node:test";

import {
  ONBOARDING_ARTISTS,
  findFirstHistoricalPreferredShow,
  findFirstPreferredShow,
  normalizeFavoriteArtists,
  prioritizeShowsByArtists,
  readOnboardingProfile,
  validateOnboardingHandle,
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
  });
});

test("reads completion only from the versioned marker", () => {
  const storage = createStorage({
    "showtonic.onboarding.v1": "complete",
    "showtonic.handle": "maya_7",
    "showtonic.favoriteArtists.v1": JSON.stringify(["Doechii", "MUNA"]),
  });

  assert.deepEqual(readOnboardingProfile(storage), {
    completed: true,
    handle: "maya_7",
    favoriteArtists: ["Doechii", "MUNA"],
  });
});

test("requires two allowed deduplicated favorites before reading completion", () => {
  const profileFor = (favoriteArtists) =>
    readOnboardingProfile(
      createStorage({
        "showtonic.onboarding.v1": "complete",
        "showtonic.handle": "maya_7",
        ...(favoriteArtists === undefined
          ? {}
          : { "showtonic.favoriteArtists.v1": favoriteArtists }),
      }),
    );

  assert.equal(profileFor(undefined).completed, false);
  assert.equal(profileFor("not-json").completed, false);
  assert.deepEqual(profileFor(JSON.stringify(["Doechii"])), {
    completed: false,
    handle: "maya_7",
    favoriteArtists: ["Doechii"],
  });
  assert.equal(profileFor(JSON.stringify(["Doechii", "doechii"])).completed, false);
  assert.equal(profileFor(JSON.stringify(["Doechii", "MUNA"])).completed, true);
});

test("does not trust completion when the persisted handle is invalid but preserves valid picks", () => {
  const storage = createStorage({
    "showtonic.onboarding.v1": "complete",
    "showtonic.handle": "bad handle",
    "showtonic.favoriteArtists.v1": JSON.stringify(["Doechii"]),
  });

  assert.deepEqual(readOnboardingProfile(storage), {
    completed: false,
    handle: "tinsley",
    favoriteArtists: ["Doechii"],
  });
});

test("normalizes favorites against the allowed lineup in input order", () => {
  assert.deepEqual(
    normalizeFavoriteArtists(["Doechii", "Unknown", "Doechii", "MUNA", "Charli XCX"]),
    ["Doechii", "MUNA", "Charli XCX"],
  );
  assert.deepEqual(ONBOARDING_ARTISTS, [
    "Charli XCX",
    "RÜFÜS DU SOL",
    "Doechii",
    "The Strokes",
    "Vampire Weekend",
    "MUNA",
    "Jamie xx",
  ]);
});

test("writes normalized profile fields before the completion marker", () => {
  const storage = createStorage();

  assert.deepEqual(
    writeOnboardingProfile(storage, {
      handle: " @Maya_7 ",
      favoriteArtists: ["Doechii", "Unknown", "Doechii", "MUNA"],
    }),
    {
      completed: true,
      handle: "maya_7",
      favoriteArtists: ["Doechii", "MUNA"],
    },
  );
  assert.deepEqual(storage.writes, [
    ["showtonic.handle", "maya_7"],
    ["showtonic.favoriteArtists.v1", JSON.stringify(["Doechii", "MUNA"])],
    ["showtonic.onboarding.v1", "complete"],
  ]);
});

test("does not persist or complete onboarding with fewer than two valid favorites", () => {
  for (const favoriteArtists of [undefined, "not-an-array", ["Doechii"], ["Doechii", "doechii"]]) {
    const storage = createStorage();

    assert.deepEqual(
      writeOnboardingProfile(storage, { handle: "maya_7", favoriteArtists }),
      {
        completed: false,
        handle: "maya_7",
        favoriteArtists: Array.isArray(favoriteArtists) ? ["Doechii"] : [],
      },
    );
    assert.deepEqual(storage.writes, []);
  }
});

test("keeps onboarding complete when storage writes fail", () => {
  const failingStorage = {
    setItem() {
      throw new Error("Storage unavailable");
    },
  };

  assert.deepEqual(
    writeOnboardingProfile(failingStorage, {
      handle: "@Maya",
      favoriteArtists: ["Doechii", "Charli XCX"],
    }),
    {
      completed: true,
      handle: "maya",
      favoriteArtists: ["Doechii", "Charli XCX"],
    },
  );
});

test("does not persist or complete onboarding for an invalid handle", () => {
  const storage = createStorage();

  assert.deepEqual(
    writeOnboardingProfile(storage, {
      handle: "bad handle",
      favoriteArtists: ["Doechii"],
    }),
    {
      completed: false,
      handle: "bad handle",
      favoriteArtists: ["Doechii"],
    },
  );
  assert.deepEqual(storage.writes, []);
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
  assert.equal(findFirstPreferredShow(shows, ["Unknown"]).id, "charli");
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
