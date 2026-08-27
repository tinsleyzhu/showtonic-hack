import assert from "node:assert/strict";
import test from "node:test";

import {
  isEventNotAnArtist,
  mergeArtistDuplicates,
  rankOnboardingArtists,
} from "../convex/onboardingArtists.js";

function artist(name, homeCityShows, otherCityShows = 0) {
  return { name, homeCityShows, otherCityShows };
}

test("an artist with nothing upcoming in your city never appears", () => {
  // The real numbers: New York Philharmonic has 234 upcoming New York shows
  // and zero in San Francisco. Under the old weighting (home x4, elsewhere
  // x1) it beat every SF artist, who would have needed 59 SF shows to catch
  // it. Presence is a gate, not a bonus.
  const ranked = rankOnboardingArtists(
    [artist("New York Philharmonic", 0, 234), artist("Osees", 3)],
    { homeCity: "San Francisco" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["Osees"],
  );
});

test("no multiplier can rescue an unreachable artist, however big its residency", () => {
  const ranked = rankOnboardingArtists(
    [artist("Residency Act", 0, 10_000), artist("Local Act", 1)],
    { homeCity: "San Francisco" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["Local Act"],
  );
});

test("survivors rank by how present they are in your city, not overall", () => {
  // Touring Act plays your city once and 90 times elsewhere; Local Act plays
  // your city five times. Local Act is the better suggestion.
  const ranked = rankOnboardingArtists(
    [artist("Touring Act", 1, 90), artist("Local Act", 5)],
    { homeCity: "San Francisco" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["Local Act", "Touring Act"],
  );
});

test("skipping home base falls back to a global ranking rather than an empty grid", () => {
  const ranked = rankOnboardingArtists(
    [artist("New York Philharmonic", 0, 234), artist("Osees", 0, 3)],
    { homeCity: "" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["New York Philharmonic", "Osees"],
  );
});

test("a home city with no upcoming shows at all yields nothing, and says so by being empty", () => {
  // Better an empty grid the UI can explain than a list of artists 3,000 miles
  // away presented as if they were local.
  const ranked = rankOnboardingArtists([artist("Elsewhere Act", 0, 50)], {
    homeCity: "Boise",
  });

  assert.deepEqual(ranked, []);
});

test("ties break by name so the grid is stable between renders", () => {
  const ranked = rankOnboardingArtists([artist("Zebra", 2), artist("Aardvark", 2)], {
    homeCity: "San Francisco",
  });

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["Aardvark", "Zebra"],
  );
});

test("respects the limit and caps it", () => {
  const entries = Array.from({ length: 60 }, (_, index) =>
    artist(`Act ${String(index).padStart(2, "0")}`, 60 - index),
  );

  assert.equal(rankOnboardingArtists(entries, { homeCity: "SF", limit: 6 }).length, 6);
  assert.equal(rankOnboardingArtists(entries, { homeCity: "SF", limit: 500 }).length, 48);
});

test("home city matching ignores case and stray whitespace", () => {
  const ranked = rankOnboardingArtists([artist("Local Act", 2)], {
    homeCity: "  san francisco  ",
  });

  assert.equal(ranked.length, 1);
});

test("the picker does not offer a member the venue's karaoke night", () => {
  // Live catalog, San Francisco, 2026-08-27: "Karaoke Tuesday" (13 upcoming
  // SF dates) and "Open Mic Night" (12) were the first two cards in the grid,
  // ahead of every touring act. A weekly night really does have more dates
  // than a band; it just cannot answer "artists you'd cross town to see".
  const ranked = rankOnboardingArtists(
    [
      artist("Karaoke Tuesday", 13),
      artist("Open Mic Night", 12),
      artist("Sofar Sounds NYC Secret Concert", 20),
      artist("Live Weekly Bluegrass with  Allison Kelly", 9),
      artist("My Morning Jacket", 8),
    ],
    { homeCity: "San Francisco" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["My Morning Jacket"],
  );
});

test("event vocabulary is the rule, not a blocklist of names, and not weekdays", () => {
  // "Sunday Saari" and "Ruby Tuesday" are in or like the catalog's real rows.
  // A bare weekday can never be the signal.
  assert.equal(isEventNotAnArtist("Karaoke Tuesday"), true);
  assert.equal(isEventNotAnArtist("Bottomless Brunch at Ellen's Stardust Diner!"), true);
  assert.equal(isEventNotAnArtist("Sunday Saari"), false);
  assert.equal(isEventNotAnArtist("Ruby Tuesday"), false);
  assert.equal(isEventNotAnArtist("The Red Party"), false);
  assert.equal(isEventNotAnArtist("Nightlands"), false);
});

test("one card per artist, however many rows the feeds left behind", () => {
  // Two Becks is not only ugly: selection in the picker is by NAME, so tapping
  // one card lights both and still counts as one of the five picks.
  const ranked = rankOnboardingArtists(
    [
      { name: "Beck", homeCityShows: 2, otherCityShows: 0, genres: ["rock"] },
      { name: "beck", homeCityShows: 1, otherCityShows: 0, image: "beck.jpg" },
      artist("Osees", 2),
    ],
    { homeCity: "San Francisco" },
  );

  assert.deepEqual(
    ranked.map((entry) => entry.name),
    ["Beck", "Osees"],
  );
  // Counts add up, because both rows describe the same person's nights.
  assert.equal(ranked[0].homeCityShows, 3);
  // The row with a picture wins the display, so the grid is faces not letters
  // — but its lower-case spelling does not come with it.
  assert.equal(ranked[0].image, "beck.jpg");
});

test("merging tidies the whitespace the feeds ship with", () => {
  const [merged] = mergeArtistDuplicates([
    { name: "  Vince Giordano and the  Nighthawks", homeCityShows: 3, otherCityShows: 0 },
    { name: "Vince Giordano and The Nighthawks", homeCityShows: 2, otherCityShows: 1 },
  ]);

  assert.equal(merged.name, "Vince Giordano and the Nighthawks");
  assert.equal(merged.homeCityShows, 5);
  assert.equal(merged.otherCityShows, 1);
});
