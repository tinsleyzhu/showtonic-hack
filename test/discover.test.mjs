import assert from "node:assert/strict";
import test from "node:test";

import {
  collapseFestivalShows,
  dateRangeForPreset,
  festivalDisplayName,
  reasonForShow,
} from "../app/discover.js";

// --- Reason strings --------------------------------------------------------

test("watchlist shelf always explains itself as the user's own save", () => {
  assert.equal(
    reasonForShow({ artistNames: ["Anyone"] }, { shelf: "watchlist", favoriteArtists: ["Anyone"] }),
    "From your watchlist",
  );
});

test("followed artists outrank taste-seed picks", () => {
  const show = { artistNames: ["Jamie xx", "Romy"] };
  assert.equal(
    reasonForShow(show, { followedArtistNames: ["romy"], favoriteArtists: ["Jamie xx"] }),
    "Because you follow Romy",
  );
  assert.equal(
    reasonForShow(show, { favoriteArtists: ["jamie XX"] }),
    "Because you picked Jamie xx",
  );
});

test("popular shelf cites real activity and never invents numbers", () => {
  assert.equal(
    reasonForShow({ goingCount: 2, loggedCount: 1 }, { shelf: "popular" }),
    "3 showgoers active",
  );
  assert.equal(reasonForShow({}, { shelf: "popular" }), "Trending near you");
  assert.equal(reasonForShow({ goingCount: 1 }, { shelf: "trending" }), "1 showgoer active");
});

test("weekend and nearby shelves name the city", () => {
  assert.equal(
    reasonForShow({ city: "San Francisco" }, { shelf: "weekend" }),
    "This weekend in San Francisco",
  );
  assert.equal(reasonForShow({}, { shelf: "weekend" }), "This weekend");
  assert.equal(reasonForShow({ city: "Oakland" }, { shelf: "nearby" }), "Near you in Oakland");
});

test("falls back to verified ratings, then activity, then silence", () => {
  assert.equal(
    reasonForShow({ rating: 4.6, ratingCount: 12 }),
    "Rated 4.6 by verified fans",
  );
  assert.equal(reasonForShow({ rating: 3.0, ratingCount: 5, goingCount: 2 }), "2 showgoers active");
  assert.equal(reasonForShow({}), "");
});

// --- Date presets ----------------------------------------------------------

test("tonight preset is a single-day range", () => {
  assert.deepEqual(dateRangeForPreset("tonight", "2026-08-17"), {
    from: "2026-08-17",
    to: "2026-08-17",
  });
});

test("weekend preset spans the coming Friday through Sunday", () => {
  // 2026-08-17 is a Monday → Fri 21 to Sun 23
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-17"), {
    from: "2026-08-21",
    to: "2026-08-23",
  });
});

test("mid-weekend the range starts today", () => {
  // 2026-08-22 is a Saturday → today through Sunday 23
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-22"), {
    from: "2026-08-22",
    to: "2026-08-23",
  });
  // Sunday → just today
  assert.deepEqual(dateRangeForPreset("weekend", "2026-08-23"), {
    from: "2026-08-23",
    to: "2026-08-23",
  });
});

test("custom preset leaves bounds to the caller", () => {
  assert.deepEqual(dateRangeForPreset("custom", "2026-08-17"), { from: "", to: "" });
});

// --- One card per festival (spec A.4) ---------------------------------------

function show(overrides) {
  return {
    id: "s1",
    title: "A night out",
    date: "2026-06-06",
    artistNames: ["One act"],
    image: "",
    day: "",
    time: "",
    stage: "",
    venueId: "",
    artistIds: [],
    jambaseUrl: "",
    memoryPrompt: "",
    ...overrides,
  };
}

test("day rows collapse to one festival card: name, union bill, date range", () => {
  const cards = collapseFestivalShows([
    show({ id: "set1", title: "Jamie xx — Outside Lands", date: "2026-08-07", festivalId: "ol-2026", artistNames: ["Jamie xx"], nonMatchable: true }),
    show({ id: "day1", title: "Outside Lands — Friday", date: "2026-08-07", festivalId: "ol-2026", isFestivalDay: true, artistNames: ["Jamie xx", "The Strokes"] }),
    show({ id: "set2", title: "RÜFÜS DU SOL — Outside Lands", date: "2026-08-09", festivalId: "ol-2026", artistNames: ["RÜFÜS DU SOL"], nonMatchable: true }),
    show({ id: "day3", title: "Outside Lands — Sunday", date: "2026-08-09", festivalId: "ol-2026", isFestivalDay: true, artistNames: ["The Strokes", "RÜFÜS DU SOL"] }),
  ]);
  assert.equal(cards.length, 1);
  const card = cards[0];
  assert.equal(card.id, "day1"); // earliest festival-day row is the card target
  assert.equal(card.title, "Outside Lands"); // weekday suffix stripped
  assert.deepEqual(card.artistNames, ["Jamie xx", "The Strokes", "RÜFÜS DU SOL"]);
  assert.deepEqual(card.dateRange, { start: "2026-08-07", end: "2026-08-09" });
});

test("a legacy festival with no day rows keeps a real row as the card", () => {
  const cards = collapseFestivalShows([
    show({ id: "legacy2", title: "Portola", date: "2026-09-13", festivalId: "portola", artistNames: ["Romy"] }),
    show({ id: "legacy1", title: "Portola", date: "2026-09-12", festivalId: "portola", artistNames: ["Fred again..", "Romy"] }),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, "legacy1"); // earliest member carries the card
  assert.deepEqual(cards[0].artistNames, ["Fred again..", "Romy"]); // union of both rows
  assert.deepEqual(cards[0].dateRange, { start: "2026-09-12", end: "2026-09-13" });
});

test("a single-day festival carries no date range", () => {
  const cards = collapseFestivalShows([
    show({ id: "day1", title: "Kilby Block Party — Saturday", date: "2026-05-16", festivalId: "kilby", isFestivalDay: true, artistNames: ["Pastel Ghost"] }),
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].dateRange, undefined);
});

test("shows without a festival id pass through untouched", () => {
  const plain = show({ id: "gig", title: "Samia at The Fillmore", date: "2026-07-02", artistNames: ["Samia"] });
  const cards = collapseFestivalShows([plain, show({ id: "other-gig", date: "2026-07-03" })]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0], plain);
  assert.equal(cards[1].id, "other-gig");
});

test("the union bill deduplicates acts across rows case-insensitively", () => {
  const cards = collapseFestivalShows([
    show({ id: "day1", title: "Fest — Saturday", date: "2026-08-01", festivalId: "fest", isFestivalDay: true, artistNames: ["jamie xx", "Romy"] }),
    show({ id: "set1", title: "Jamie XX — Fest", date: "2026-08-01", festivalId: "fest", artistNames: ["Jamie xx  "] }),
  ]);
  assert.deepEqual(cards[0].artistNames, ["jamie xx", "Romy"]);
});

test("the same input collapses to the byte-for-byte same output", () => {
  const shows = [
    show({ id: "day1", title: "Fest — Friday", date: "2026-08-07", festivalId: "fest", isFestivalDay: true, artistNames: ["A"] }),
    show({ id: "set1", title: "B — Fest", date: "2026-08-08", festivalId: "fest", artistNames: ["B"] }),
  ];
  assert.deepEqual(collapseFestivalShows(shows), collapseFestivalShows(shows));
});

test("festival display names strip the weekday suffix only", () => {
  assert.equal(festivalDisplayName("Outside Lands — Saturday"), "Outside Lands");
  assert.equal(festivalDisplayName("Tyler, The Creator — Saturday"), "Tyler, The Creator");
  assert.equal(festivalDisplayName("Portola"), "Portola");
  assert.equal(festivalDisplayName(undefined), "");
});
