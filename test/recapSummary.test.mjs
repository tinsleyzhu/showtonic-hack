import assert from "node:assert/strict";
import test from "node:test";

import { buildRecap, composeShareText, spanPhrase } from "../convex/recapSummary.js";
import { describeReclaimSpan } from "../convex/backfillMatch.js";

function log(overrides = {}) {
  return {
    showId: "show1",
    showTitle: "RÜFÜS DU SOL at The Midway",
    showDate: "2024-06-14",
    artistNames: ["RÜFÜS DU SOL"],
    venueName: "The Midway",
    city: "San Francisco",
    artistGenres: ["house"],
    rating: 4,
    source: "live",
    ...overrides,
  };
}

test("an empty diary produces no recap at all", () => {
  const recap = buildRecap([]);
  assert.equal(recap.empty, true);
  assert.equal(recap.shows, 0);
  assert.equal(recap.highestRated, null);
  assert.equal(recap.shareText, "");
});

test("undated rows are ignored rather than counted as nights", () => {
  const recap = buildRecap([log(), { showTitle: "no date here" }, log({ showDate: "" })]);
  assert.equal(recap.shows, 1);
});

test("counts are distinct, not row counts", () => {
  const recap = buildRecap([
    log({ showId: "a", showDate: "2023-01-02", artistNames: ["Fred again..", "Skrillex"] }),
    log({ showId: "b", showDate: "2023-03-04", artistNames: ["Fred again.."] }),
    log({ showId: "c", showDate: "2023-05-06", venueName: "1015 Folsom", city: "San Francisco" }),
  ]);
  assert.equal(recap.shows, 3);
  assert.equal(recap.artists, 3); // Fred again.., Skrillex, RÜFÜS DU SOL
  assert.equal(recap.venues, 2);
  assert.equal(recap.cities, 1);
  assert.deepEqual(recap.topArtists[0], { name: "Fred again..", count: 2 });
});

test("the span copy is the reclaim voice, not a second one", () => {
  const dates = ["2021-05-01", "2024-09-09"];
  const recap = buildRecap(dates.map((showDate) => log({ showDate })));
  assert.equal(
    recap.spanLine,
    describeReclaimSpan(dates.map((clusterDate) => ({ clusterDate }))),
  );
  assert.equal(recap.spanLine, "Four years of nights, back in one place.");
  assert.equal(recap.spanPhrase, "four years of nights");
  assert.equal(recap.years, 4);
});

test("a single year still reads as a span", () => {
  assert.equal(spanPhrase(["2026-01-01", "2026-11-02"]), "a year of nights");
});

test("the highest-rated night breaks ties deterministically", () => {
  const rows = [
    log({ showId: "a", showTitle: "Older", showDate: "2022-01-01", rating: 5 }),
    log({ showId: "b", showTitle: "Newer", showDate: "2024-01-01", rating: 5 }),
    log({ showId: "c", showTitle: "Best but lower", showDate: "2025-01-01", rating: 4.5 }),
  ];
  const forwards = buildRecap(rows);
  const backwards = buildRecap([...rows].reverse());
  assert.equal(forwards.highestRated.title, "Newer");
  assert.deepEqual(forwards.highestRated, backwards.highestRated);
});

test("unrated diaries have no highest-rated night rather than a zero-star one", () => {
  const recap = buildRecap([log({ rating: 0 }), log({ showDate: "2024-07-01", rating: 0 })]);
  assert.equal(recap.highestRated, null);
});

test("averages stay hidden under five rated shows, same as the rest of the app", () => {
  const four = buildRecap(
    ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"].map((showDate) => log({ showDate })),
  );
  assert.equal(four.averageRating, null);
  assert.equal(four.lowSignal, true);

  const five = buildRecap(
    ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01", "2024-05-01"].map((showDate) =>
      log({ showDate, rating: 4 }),
    ),
  );
  assert.equal(five.averageRating, 4);
  assert.equal(five.lowSignal, false);
});

test("reclaimed nights are counted, because that is the story worth posting", () => {
  const recap = buildRecap([
    log({ showDate: "2021-01-01", source: "reclaim" }),
    log({ showDate: "2022-01-01", source: "backfill" }),
    log({ showDate: "2023-01-01", source: "live" }),
  ]);
  assert.equal(recap.reclaimed, 2);
});

test("the offline caption names the artist, the room and the best night", () => {
  const text = composeShareText({
    shows: 31,
    spanPhrase: "four years of nights",
    topArtists: [{ name: "Fred again..", count: 4 }],
    topVenues: [{ name: "The Midway", count: 6 }],
    highestRated: { title: "Fred again.. at The Midway", rating: 5 },
  });
  assert.match(text, /31 shows — four years of nights\./);
  assert.match(text, /Fred again\.\. 4 times\./);
  assert.match(text, /Mostly at The Midway\./);
  assert.match(text, /Best night: Fred again\.\. at The Midway\./);
});

test("a caption never claims a favourite room from a single visit", () => {
  const text = composeShareText({
    shows: 1,
    spanPhrase: "a year of nights",
    topArtists: [{ name: "MUNA", count: 1 }],
    topVenues: [{ name: "The Fillmore", count: 1 }],
    highestRated: null,
  });
  assert.match(text, /1 show — a year of nights\./);
  assert.match(text, /Starting with MUNA\./);
  assert.doesNotMatch(text, /Mostly at/);
});
