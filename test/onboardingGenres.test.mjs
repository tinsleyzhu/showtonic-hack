import assert from "node:assert/strict";
import test from "node:test";

import { rankOnboardingGenres } from "../convex/onboardingGenres.js";

function show(date, city, genres) {
  return { date, city, genres };
}

test("ranks by what you could actually go to, not by catalog history", () => {
  const shows = [
    ...Array.from({ length: 10 }, () => show("2020-01-01", "San Francisco", ["ska"])),
    show("2026-09-01", "San Francisco", ["house"]),
  ];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27" });

  assert.deepEqual(
    ranked.map((entry) => entry.genre),
    ["house"],
  );
});

test("the user's own city outweighs everywhere else", () => {
  const shows = [
    ...Array.from({ length: 3 }, () => show("2026-09-01", "New York", ["punk"])),
    show("2026-09-01", "San Francisco", ["house"]),
  ];

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    homeCity: "San Francisco",
  });

  assert.equal(ranked[0].genre, "house");
});

test("a thin home city still fills the picker rather than showing nothing", () => {
  const shows = Array.from({ length: 3 }, () => show("2026-09-01", "New York", ["punk"]));

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    homeCity: "Boise",
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].genre, "punk");
});

test("one genre family cannot eat the whole picker", () => {
  // The real SF shape: jazz and its siblings dominate, with a couple of
  // genuinely different genres further down.
  const shows = [
    ...Array.from({ length: 40 }, () => show("2026-09-01", "San Francisco", ["jazz"])),
    ...Array.from({ length: 30 }, () => show("2026-09-01", "San Francisco", ["vocal jazz"])),
    ...Array.from({ length: 20 }, () => show("2026-09-01", "San Francisco", ["jazz fusion"])),
    ...Array.from({ length: 10 }, () => show("2026-09-01", "San Francisco", ["latin jazz"])),
    ...Array.from({ length: 5 }, () => show("2026-09-01", "San Francisco", ["house"])),
    ...Array.from({ length: 4 }, () => show("2026-09-01", "San Francisco", ["punk"])),
  ];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27", limit: 4 });
  const genres = ranked.map((entry) => entry.genre);

  assert.equal(genres.filter((genre) => genre.includes("jazz")).length, 2);
  assert.ok(genres.includes("house"));
  assert.ok(genres.includes("punk"));
});

test("families are derived from the catalog, so a house-heavy city behaves the same", () => {
  const shows = [
    ...Array.from({ length: 40 }, () => show("2026-09-01", "Berlin", ["house"])),
    ...Array.from({ length: 30 }, () => show("2026-09-01", "Berlin", ["deep house"])),
    ...Array.from({ length: 20 }, () => show("2026-09-01", "Berlin", ["tech house"])),
    ...Array.from({ length: 5 }, () => show("2026-09-01", "Berlin", ["jazz"])),
  ];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27", limit: 3 });

  assert.deepEqual(
    ranked.map((entry) => entry.genre),
    ["house", "deep house", "jazz"],
  );
});

test("a genre is not made a family member by a rarer genre it happens to contain", () => {
  // "core" is rare, so "hardcore"/"metalcore" must not collapse into it.
  const shows = [
    ...Array.from({ length: 10 }, () => show("2026-09-01", "SF", ["hardcore"])),
    ...Array.from({ length: 9 }, () => show("2026-09-01", "SF", ["metalcore"])),
    show("2026-09-01", "SF", ["core"]),
  ];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27", limit: 3 });

  assert.deepEqual(
    ranked.map((entry) => entry.genre),
    ["hardcore", "metalcore", "core"],
  );
});

test("genres are case- and whitespace-insensitive and deduped within a show", () => {
  const shows = [show("2026-09-01", "SF", [" Jazz ", "jazz", "JAZZ"])];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27" });

  assert.deepEqual(ranked, [{ genre: "jazz", weight: 1, family: "jazz" }]);
});

test("an empty or genre-less catalog returns nothing rather than inventing options", () => {
  assert.deepEqual(rankOnboardingGenres([], { today: "2026-08-27" }), []);
  assert.deepEqual(
    rankOnboardingGenres([show("2026-09-01", "SF", [])], { today: "2026-08-27" }),
    [],
  );
});

test("respects the requested limit", () => {
  const shows = ["a", "b", "c", "d", "e"].map((genre) =>
    show("2026-09-01", "SF", [genre]),
  );

  assert.equal(rankOnboardingGenres(shows, { today: "2026-08-27", limit: 3 }).length, 3);
});
