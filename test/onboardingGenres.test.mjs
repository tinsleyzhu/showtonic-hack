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

test("co-occurrence folds a subgenre that shares no word with its parent", () => {
  // The rendered bug: post-bop and hard bop ARE jazz, but no substring test
  // can see it. Nearly every artist carrying them also carries jazz.
  const artists = [
    ...Array.from({ length: 20 }, () => ["jazz", "post-bop"]),
    ...Array.from({ length: 12 }, () => ["jazz", "hard bop"]),
    ...Array.from({ length: 30 }, () => ["jazz"]),
    ...Array.from({ length: 8 }, () => ["hip hop"]),
  ];
  const shows = artists.map((genres) => show("2026-09-01", "San Francisco", genres));

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    limit: 4,
    genreSets: artists,
  });

  const families = new Map(ranked.map((entry) => [entry.genre, entry.family]));
  assert.equal(families.get("post-bop"), "jazz");
  // hard bop folded into jazz too, which is exactly why it is absent: the
  // family had already spent its two slots on jazz and post-bop.
  assert.ok(!families.has("hard bop"));
  assert.ok(ranked.some((entry) => entry.genre === "hip hop"));
});

test("the jazz family cannot take more than its cap, on the real rendered shape", () => {
  // The coordinator's live weights: jazz 561, rock 223, post-bop 195, pop 163,
  // jazz fusion 156, classical 141 — plus the soul/neo soul pair that failed
  // the same way. Before this fix six of eleven chips were jazz.
  const artists = [
    ...Array.from({ length: 195 }, () => ["jazz", "post-bop"]),
    ...Array.from({ length: 156 }, () => ["jazz", "jazz fusion"]),
    ...Array.from({ length: 90 }, () => ["jazz", "hard bop"]),
    ...Array.from({ length: 120 }, () => ["jazz"]),
    ...Array.from({ length: 223 }, () => ["rock"]),
    ...Array.from({ length: 163 }, () => ["pop"]),
    ...Array.from({ length: 141 }, () => ["classical"]),
    ...Array.from({ length: 80 }, () => ["soul", "neo soul"]),
    ...Array.from({ length: 40 }, () => ["soul"]),
    ...Array.from({ length: 30 }, () => ["hip hop"]),
  ];
  const shows = artists.map((genres) => show("2026-09-01", "San Francisco", genres));

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    limit: 10,
    genreSets: artists,
  });
  const genres = ranked.map((entry) => entry.genre);

  const jazzish = genres.filter((genre) =>
    ["jazz", "post-bop", "hard bop", "jazz fusion"].includes(genre),
  );
  assert.equal(jazzish.length, 2, `jazz family over cap: ${genres.join(", ")}`);
  assert.equal(genres.filter((genre) => ["soul", "neo soul"].includes(genre)).length, 2);
  for (const genre of ["rock", "pop", "classical", "hip hop"]) {
    assert.ok(genres.includes(genre), `${genre} should have made the picker`);
  }
});

test("a genre that merely shares bills with another is not made its child", () => {
  // Every artist here is single-genre, so there is no co-occurrence evidence
  // at all — even though punk and techno keep appearing on the same night.
  const artists = [
    ...Array.from({ length: 20 }, () => ["punk"]),
    ...Array.from({ length: 18 }, () => ["techno"]),
  ];
  const shows = Array.from({ length: 20 }, () =>
    show("2026-09-01", "SF", ["punk", "techno"]),
  );

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    limit: 4,
    genreSets: artists,
  });

  assert.deepEqual(
    ranked.map((entry) => entry.family).sort(),
    ["punk", "techno"],
  );
});

test("a common genre never becomes the child of a rare one it co-occurs with", () => {
  // Every post-bop artist is also jazz, but jazz is on plenty of artists that
  // are not post-bop. The relationship has to point one way only.
  const artists = [
    ...Array.from({ length: 10 }, () => ["jazz", "post-bop"]),
    ...Array.from({ length: 50 }, () => ["jazz"]),
  ];
  const shows = artists.map((genres) => show("2026-09-01", "SF", genres));

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    genreSets: artists,
  });
  const families = new Map(ranked.map((entry) => [entry.genre, entry.family]));

  assert.equal(families.get("jazz"), "jazz");
  assert.equal(families.get("post-bop"), "jazz");
});

test("a subgenre chain resolves to the root of its family", () => {
  const artists = [
    ...Array.from({ length: 8 }, () => ["jazz", "bop", "hard bop"]),
    ...Array.from({ length: 20 }, () => ["jazz", "bop"]),
    ...Array.from({ length: 60 }, () => ["jazz"]),
  ];
  const shows = artists.map((genres) => show("2026-09-01", "SF", genres));

  const ranked = rankOnboardingGenres(shows, {
    today: "2026-08-27",
    genreSets: artists,
  });

  assert.ok(ranked.every((entry) => entry.family === "jazz"));
});

test("without genreSets the name test still works on its own", () => {
  const shows = [
    ...Array.from({ length: 40 }, () => show("2026-09-01", "SF", ["jazz"])),
    ...Array.from({ length: 30 }, () => show("2026-09-01", "SF", ["jazz fusion"])),
    ...Array.from({ length: 20 }, () => show("2026-09-01", "SF", ["vocal jazz"])),
    ...Array.from({ length: 5 }, () => show("2026-09-01", "SF", ["punk"])),
  ];

  const ranked = rankOnboardingGenres(shows, { today: "2026-08-27", limit: 4 });

  assert.equal(ranked.filter((entry) => entry.family === "jazz").length, 2);
  assert.ok(ranked.some((entry) => entry.genre === "punk"));
});

test("respects the requested limit", () => {
  const shows = ["a", "b", "c", "d", "e"].map((genre) =>
    show("2026-09-01", "SF", [genre]),
  );

  assert.equal(rankOnboardingGenres(shows, { today: "2026-08-27", limit: 3 }).length, 3);
});
