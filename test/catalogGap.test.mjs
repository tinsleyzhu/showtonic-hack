// Catalog-gap agent — pure-logic tests.
//
// The agent's job is to turn an unexplained night into a sourced proposal, and
// its harder job is to REFUSE when the web cannot actually explain the night.
// Most of what follows tests the refusals, because a bad proposal poisons the
// catalog for every user, not just the one who took the photos.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CREDITS_PER_ADVANCED_SEARCH,
  MIN_PROPOSAL_CONFIDENCE,
  eachNightInRange,
  estimateSweepCredits,
  nightsMissingFromCatalog,
  buildGapQueries,
  describeProposal,
  extractArtistNames,
  hostOf,
  isTicketingDomain,
  longDate,
  mentionsDate,
  nearestVenues,
  proposeFromResults,
  splitLineup,
} from "../convex/catalogGapUtils.js";

const MIDWAY = {
  id: "v-midway",
  name: "The Midway",
  city: "San Francisco",
  latitude: 37.748,
  longitude: -122.388,
};
const INDEPENDENT = {
  id: "v-indy",
  name: "The Independent",
  city: "San Francisco",
  latitude: 37.7761,
  longitude: -122.438,
};

test("nearest venue anchors the search on the room the photos were in", () => {
  const gps = { latitude: 37.7481, longitude: -122.3879 };
  const anchors = nearestVenues(gps, [INDEPENDENT, MIDWAY]);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].name, "The Midway");
  assert.equal(anchors[0].distanceMeters < 400, true);
});

test("a night with no GPS has no venue anchor at all", () => {
  assert.deepEqual(nearestVenues(null, [MIDWAY, INDEPENDENT]), []);
});

test("venues across town are never anchors", () => {
  const gps = { latitude: 37.7761, longitude: -122.438 };
  const anchors = nearestVenues(gps, [MIDWAY]);
  assert.deepEqual(anchors, []);
});

test("queries name the room and the night; the city-wide form is the fallback", () => {
  const anchored = buildGapQueries({
    clusterDate: "2026-06-27",
    city: "San Francisco",
    venues: [{ name: "The Midway" }],
  });
  assert.equal(anchored.length, 1);
  assert.equal(anchored[0].anchorVenue, "The Midway");
  assert.match(anchored[0].query, /"The Midway"/);
  assert.match(anchored[0].query, /June 27, 2026/);

  const cityWide = buildGapQueries({ clusterDate: "2026-06-27", city: "San Francisco" });
  assert.equal(cityWide[0].anchorVenue, null);
  assert.match(cityWide[0].query, /San Francisco/);

  // Nothing to anchor on and nowhere to look: ask nothing rather than ask badly.
  assert.deepEqual(buildGapQueries({ clusterDate: "2026-06-27" }), []);
});

test("a date is recognised in every form a listings page writes it", () => {
  const forms = [
    "Doors 9pm on 2026-06-27",
    "Saturday, June 27, 2026",
    "Jun 27 2026",
    "27 June 2026",
    "6/27/2026",
    "06/27/26",
  ];
  for (const form of forms) {
    assert.equal(mentionsDate("2026-06-27", form), true, form);
  }
  assert.equal(mentionsDate("2026-06-27", "June 27, 2025"), false);
  assert.equal(mentionsDate("2026-06-27", "June 28, 2026"), false);
});

test("longDate is the human form used in queries and evidence", () => {
  assert.equal(longDate("2026-06-27"), "June 27, 2026");
  assert.equal(longDate("nonsense"), "");
});

test("artist names come out of real-world listing titles", () => {
  assert.deepEqual(
    extractArtistNames("Peggy Gou at The Midway - Jun 27, 2026 | Tickets", "The Midway"),
    ["Peggy Gou"],
  );
  assert.deepEqual(extractArtistNames("The Midway presents Overmono", "The Midway"), ["Overmono"]);
  assert.deepEqual(extractArtistNames("Tickets for Salute | Public Works", "Public Works"), [
    "Salute",
  ]);
  // A bill, not a single act.
  assert.deepEqual(extractArtistNames("Peggy Gou b2b Sammy Virji @ The Midway", "The Midway"), [
    "Peggy Gou",
    "Sammy Virji",
  ]);
});

test("a title with nothing but boilerplate yields no artist", () => {
  assert.deepEqual(extractArtistNames("Events | The Midway | Tickets", "The Midway"), []);
  assert.deepEqual(extractArtistNames("The Midway - Upcoming Shows", "The Midway"), []);
  assert.deepEqual(extractArtistNames("", "The Midway"), []);
});

test("splitLineup drops listing noise but keeps short stage names", () => {
  assert.deepEqual(splitLineup("Overmono + Salute"), ["Overmono", "Salute"]);
  assert.deepEqual(splitLineup("Tickets, Concerts"), []);
});

test("ticketing domains are recognised by host, not by substring", () => {
  assert.equal(isTicketingDomain("https://dice.fm/event/abc"), true);
  assert.equal(isTicketingDomain("https://www.ra.co/events/2026"), true);
  assert.equal(isTicketingDomain("https://themidwaysf.com/events"), false);
  // A lookalike host must not pass as the real one.
  assert.equal(isTicketingDomain("https://dice.fm.evil.example/x"), false);
  assert.equal(hostOf("https://www.songkick.com/x"), "songkick.com");
});

const GAP = {
  clusterDate: "2026-06-27",
  city: "San Francisco",
  anchorVenue: "The Midway",
};

test("a corroborated listing becomes a proposal with a source URL", () => {
  const { proposal, declineReason } = proposeFromResults(GAP, [
    {
      title: "Peggy Gou at The Midway - Jun 27, 2026",
      url: "https://dice.fm/event/peggy-gou-midway",
      content: "Peggy Gou plays The Midway on June 27, 2026. Doors 9pm.",
    },
    {
      title: "Peggy Gou | The Midway | San Francisco",
      url: "https://www.songkick.com/concerts/peggy-gou-midway",
      content: "June 27, 2026 at The Midway, San Francisco.",
    },
  ]);
  assert.equal(declineReason, null);
  assert.deepEqual(proposal.artistNames, ["Peggy Gou"]);
  assert.equal(proposal.venueName, "The Midway");
  assert.equal(proposal.sourceUrl, "https://dice.fm/event/peggy-gou-midway");
  assert.equal(proposal.corroboratingUrls.length, 1);
  assert.equal(proposal.confidence >= MIN_PROPOSAL_CONFIDENCE, true);
  assert.match(describeProposal(proposal), /Peggy Gou at The Midway/);
});

test("a single strong listing is enough; the venue and date carry it", () => {
  const { proposal } = proposeFromResults(GAP, [
    {
      title: "Overmono at The Midway - June 27, 2026",
      url: "https://themidwaysf.com/events/overmono",
      content: "The Midway presents Overmono, June 27, 2026.",
    },
  ]);
  assert.deepEqual(proposal.artistNames, ["Overmono"]);
  // date 0.40 + venue 0.30 = 0.70, over the bar without any ticketing boost.
  assert.equal(Number(proposal.confidence.toFixed(2)), 0.7);
});

test("declines when the results are about a different night", () => {
  const { proposal, declineReason, rejected } = proposeFromResults(GAP, [
    {
      title: "Peggy Gou at The Midway - Jun 27, 2025",
      url: "https://dice.fm/event/peggy-gou-midway-2025",
      content: "Peggy Gou played The Midway on June 27, 2025.",
    },
  ]);
  assert.equal(proposal, null);
  assert.match(declineReason, /named both the date and a lineup/);
  assert.match(rejected[0].reason, /date not confirmed/);
});

test("declines when the page never names the room the photos were in", () => {
  const { proposal, rejected } = proposeFromResults(GAP, [
    {
      title: "Peggy Gou at 1015 Folsom - Jun 27, 2026",
      url: "https://dice.fm/event/peggy-gou-1015",
      content: "Peggy Gou plays 1015 Folsom on June 27, 2026.",
    },
  ]);
  assert.equal(proposal, null);
  assert.match(rejected[0].reason, /does not name The Midway/);
});

test("declines when two sources name different headliners", () => {
  const { proposal, declineReason } = proposeFromResults(GAP, [
    {
      title: "Peggy Gou at The Midway - Jun 27, 2026",
      url: "https://dice.fm/a",
      content: "The Midway, June 27, 2026.",
    },
    {
      title: "Overmono at The Midway - Jun 27, 2026",
      url: "https://www.songkick.com/b",
      content: "The Midway, June 27, 2026.",
    },
  ]);
  assert.equal(proposal, null);
  assert.equal(declineReason, "sources disagree about who played");
});

test("a city-wide search without a venue anchor cannot clear the bar alone", () => {
  // 0.40 date - 0.25 no-anchor + 0.15 ticketing = 0.30. A show that merely
  // happened in the same city that night is not evidence this person was there.
  const { proposal, declineReason } = proposeFromResults(
    { clusterDate: "2026-06-27", city: "San Francisco" },
    [
      {
        title: "Peggy Gou at 1015 Folsom - Jun 27, 2026",
        url: "https://dice.fm/event/peggy-gou-1015",
        content: "June 27, 2026 in San Francisco.",
      },
    ],
  );
  assert.equal(proposal, null);
  assert.match(declineReason, /below 0.6/);
});

test("an empty search result set declines rather than throwing", () => {
  assert.equal(proposeFromResults(GAP, []).proposal, null);
  assert.equal(proposeFromResults(GAP, null).proposal, null);
});

// --- History sweeps ---------------------------------------------------------
//
// Pointing the same search at the catalog's holes rather than at one person's
// unmatched night. Ticketmaster sells no past events and Setlist.fm needs a key
// we do not have, so this is currently the only route to catalog history.

test("a date range walks every night, inclusive of both ends", () => {
  assert.deepEqual(eachNightInRange("2026-06-27", "2026-06-30"), [
    "2026-06-27",
    "2026-06-28",
    "2026-06-29",
    "2026-06-30",
  ]);
  assert.deepEqual(eachNightInRange("2026-06-27", "2026-06-27"), ["2026-06-27"]);
});

test("a backwards or malformed range walks nothing rather than looping", () => {
  assert.deepEqual(eachNightInRange("2026-06-30", "2026-06-27"), []);
  assert.deepEqual(eachNightInRange("not-a-date", "2026-06-27"), []);
  assert.deepEqual(eachNightInRange("2026-06-27", ""), []);
});

test("a month boundary and a leap day are ordinary nights", () => {
  assert.deepEqual(eachNightInRange("2026-01-31", "2026-02-01"), ["2026-01-31", "2026-02-01"]);
  assert.equal(eachNightInRange("2024-02-28", "2024-03-01").includes("2024-02-29"), true);
});

test("a sweep fills holes and never second-guesses what the catalog has", () => {
  // Dates the catalog already explains are left alone: those rows came from a
  // first-party source, and a web guess does not get to argue with them.
  const missing = nightsMissingFromCatalog("2026-06-27", "2026-07-01", [
    "2026-06-28",
    "2026-06-30",
  ]);
  assert.deepEqual(missing, ["2026-06-27", "2026-06-29", "2026-07-01"]);
});

test("an empty catalog means every night in range is a hole", () => {
  assert.equal(nightsMissingFromCatalog("2026-06-27", "2026-07-01", []).length, 5);
  assert.equal(nightsMissingFromCatalog("2026-06-27", "2026-07-01", null).length, 5);
});

test("a sweep can price itself before it spends anything", () => {
  // Tavily credits are finite, event-coded, and expire with the event. A batch
  // job that cannot say what it is about to spend is not one to approve.
  assert.equal(estimateSweepCredits(10, 1), 10 * CREDITS_PER_ADVANCED_SEARCH);
  assert.equal(estimateSweepCredits(0), 0);
  assert.equal(estimateSweepCredits(-5), 0);
});

test("a history proposal is scored exactly like a reclaim proposal", () => {
  // The claim is weaker — "this show happened", not "you were here" — but the
  // bar is identical. Nobody reviews a swept night next to their own photos, so
  // a fabricated past show would just become catalog and then get matched
  // against by other people.
  const gap = { clusterDate: "2026-06-27", city: "San Francisco", anchorVenue: "The Midway" };
  const weak = proposeFromResults(gap, [
    {
      title: "The Midway - Upcoming Shows",
      url: "https://themidwaysf.com/events",
      content: "Our June 27, 2026 calendar.",
    },
  ]);
  assert.equal(weak.proposal, null);

  const strong = proposeFromResults(gap, [
    {
      title: "ATLiens at The Midway - June 27, 2026",
      url: "https://www.insomniac.com/events/atliens-2026-06-27-san-francisco-ca/",
      content: "ATLiens plays The Midway, San Francisco on June 27, 2026.",
    },
  ]);
  assert.deepEqual(strong.proposal.artistNames, ["ATLiens"]);
  assert.equal(strong.proposal.confidence >= MIN_PROPOSAL_CONFIDENCE, true);
});
