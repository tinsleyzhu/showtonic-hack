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
  buildFestivalQueries,
  buildGapQueries,
  canonicalVenue,
  dayLineupSegment,
  describeProposal,
  extractArtistNames,
  festivalDayTitle,
  festivalSlug,
  harvestBillNames,
  hostOf,
  looksLikeArtistName,
  isTicketingDomain,
  longDate,
  mentionsDate,
  mentionsFestival,
  nearestVenues,
  proposeFestivalDay,
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

// ---------------------------------------------------------------------------
// Festivals — a day is one bill
// ---------------------------------------------------------------------------
//
// A festival page names sixty acts across three days. Reading it whole would
// put Friday's headliners on Saturday's bill with a real URL attached, which is
// the worst shape a wrong claim can take: sourced, plausible, and unfalsifiable
// by the human looking at it. So most of what follows tests the cutting.

test("a festival day is titled by the day, not by an artist", () => {
  assert.equal(festivalDayTitle("Outside Lands 2026", "2026-08-08"), "Outside Lands 2026 — Saturday");
  assert.equal(festivalSlug("Outside Lands", "2026-08-08"), "outside-lands-2026");
  assert.equal(festivalSlug("Outside Lands 2026", "2026-08-08"), "outside-lands-2026");
});

test("a festival is recognised however the page writes its name", () => {
  assert.equal(mentionsFestival("Outside Lands Music and Arts Festival", "Outside Lands 2026"), true);
  assert.equal(mentionsFestival("outside lands 2026 lineup", "Outside Lands Music and Arts Festival"), true);
  assert.equal(mentionsFestival("Portola Festival 2026", "Outside Lands 2026"), false);
});

test("one day's slice stops where the next day's header starts", () => {
  const page =
    "Friday, August 7: Tame Impala | Kaytranada. Saturday, August 8: Doja Cat | Peggy Gou.";
  const friday = dayLineupSegment(page, "2026-08-07");
  assert.equal(friday.segment.includes("Kaytranada"), true);
  assert.equal(friday.segment.includes("Doja Cat"), false);
  const saturday = dayLineupSegment(page, "2026-08-08");
  assert.equal(saturday.segment.includes("Peggy Gou"), true);
  assert.equal(saturday.segment.includes("Tame Impala"), false);
});

test("a page with day sections but not this one carries no day", () => {
  const page = "Saturday, August 8: Doja Cat. Sunday, August 9: Chappell Roan.";
  assert.equal(dayLineupSegment(page, "2026-08-07"), null);
});

test("a page with no day structure at all is read whole, and says so", () => {
  // Safe only because the page-level date gate ran first: proposeFestivalDay
  // refuses a page that never confirms the date, whatever its shape.
  const slice = dayLineupSegment("Tame Impala | Kaytranada | Overmono", "2026-08-07");
  assert.equal(slice.headed, false);
  const { proposal, rejected } = proposeFestivalDay(OSL, [
    {
      title: "Outside Lands returns to Golden Gate Park",
      url: "https://www.sfstation.com/outside-lands",
      content: "Three days of music in Golden Gate Park.",
    },
  ]);
  assert.equal(proposal, null);
  assert.equal(rejected[0].reason, "date not confirmed in the page");
});

test("the festival's date range is not a day header", () => {
  // "August 7-9" reads as a header for the 7th unless ranges are excluded, and
  // then Friday's section swallows the whole page including the other days.
  const page =
    "Outside Lands runs August 7-9, 2026 in Golden Gate Park. " +
    "Saturday, August 8: Doja Cat. Friday, August 7: Tame Impala.";
  const friday = dayLineupSegment(page, "2026-08-07");
  assert.equal(friday.segment.includes("Doja Cat"), false);
  assert.equal(friday.segment.includes("Tame Impala"), true);
});

test("set times and furniture are not acts", () => {
  assert.equal(looksLikeArtistName("Tame Impala"), true);
  assert.equal(looksLikeArtistName("Fred again.."), true);
  assert.equal(looksLikeArtistName("Twin Peaks Stage"), false);
  assert.equal(looksLikeArtistName("9:45 PM"), false);
  assert.equal(looksLikeArtistName("Saturday"), false);
  assert.equal(looksLikeArtistName("VIP passes"), false);
  assert.equal(looksLikeArtistName("$189"), false);
});

test("a comma inside an act's name drops both halves rather than inventing two acts", () => {
  // "Tyler, The Creator" and "Kaytranada, The Blaze" are indistinguishable once
  // split. Guessing either way puts a wrong artist in the shared catalog.
  const names = harvestBillNames("Tyler, The Creator, Doja Cat, Peggy Gou");
  assert.equal(names.includes("Tyler"), false);
  assert.equal(names.includes("The Creator"), false);
  assert.deepEqual(names, ["Doja Cat", "Peggy Gou"]);
});

const OSL = {
  festivalName: "Outside Lands 2026",
  date: "2026-08-07",
  city: "San Francisco",
  venueName: "Golden Gate Park",
};

const LINEUP_BY_DAY = {
  title: "Outside Lands 2026 Lineup by Day",
  url: "https://www.sfstation.com/outside-lands-2026-lineup",
  content:
    "Outside Lands returns to Golden Gate Park August 7-9, 2026. " +
    "Friday, August 7: Tame Impala | Kaytranada | Overmono | Sudan Archives | Jessie Ware. " +
    "Saturday, August 8: Doja Cat | Peggy Gou. Sunday, August 9: Chappell Roan.",
};

const SET_TIMES = {
  title: "Outside Lands Friday August 7 2026 set times",
  url: "https://www.sfgate.com/music/outside-lands-friday-set-times",
  content:
    "FRIDAY\nTame Impala\nKaytranada\nOvermono\nJessie Ware\nSudan Archives\nMk.gee\nSATURDAY\nDoja Cat",
};

test("a festival day proposal carries that day's bill and nobody else's", () => {
  const { proposal } = proposeFestivalDay(OSL, [LINEUP_BY_DAY, SET_TIMES]);
  assert.notEqual(proposal, null);
  assert.deepEqual(proposal.artistNames.sort(), [
    "Jessie Ware",
    "Kaytranada",
    "Overmono",
    "Sudan Archives",
    "Tame Impala",
  ]);
  assert.equal(proposal.title, "Outside Lands 2026 — Friday");
  assert.equal(proposal.festivalId, "outside-lands-2026");
  assert.equal(proposal.confidence >= MIN_PROPOSAL_CONFIDENCE, true);
});

test("an act named by one non-authoritative page does not make the bill", () => {
  // Mk.gee appears only on sfgate here. One publisher's typo becomes an artist
  // row that everyone else then matches against, so a second source is required.
  const { proposal, uncorroborated } = proposeFestivalDay(OSL, [LINEUP_BY_DAY, SET_TIMES]);
  assert.equal(proposal.artistNames.includes("Mk.gee"), false);
  assert.equal(uncorroborated > 0, true);
});

test("a ticketing page can carry the bill on its own", () => {
  const { proposal } = proposeFestivalDay(OSL, [
    {
      title: "Outside Lands 2026 - Friday Tickets",
      url: "https://www.axs.com/events/outside-lands-friday",
      content:
        "Friday, August 7, 2026\nTame Impala\nKaytranada\nOvermono\nSudan Archives",
    },
  ]);
  assert.notEqual(proposal, null);
  assert.deepEqual(proposal.artistNames.sort(), [
    "Kaytranada",
    "Overmono",
    "Sudan Archives",
    "Tame Impala",
  ]);
});

test("a social caption may corroborate a festival day but never carry one", () => {
  const { proposal, declineReason } = proposeFestivalDay(OSL, [
    {
      title: "outsidelands on Instagram",
      url: "https://www.instagram.com/p/xyz",
      content: "Outside Lands Friday, August 7, 2026 — Tame Impala | Kaytranada",
    },
  ]);
  assert.equal(proposal, null);
  assert.match(declineReason, /caption/);
});

test("a wrong-year festival page is refused, as it is for a venue night", () => {
  const { proposal, rejected } = proposeFestivalDay(OSL, [
    {
      title: "Outside Lands 2025 Lineup",
      url: "https://www.sfstation.com/outside-lands-2025",
      content: "Friday, August 8, 2025: Tyler | Doechii",
    },
  ]);
  assert.equal(proposal, null);
  assert.equal(rejected[0].reason, "date not confirmed in the page");
});

test("a festival day search asks about the day, not the weekend", () => {
  const [first, second] = buildFestivalQueries(OSL);
  assert.match(first.query, /"Outside Lands 2026"/);
  assert.match(first.query, /August 7, 2026/);
  assert.match(second.query, /Friday/);
});

test("a day that yields two or three names is a page we failed to read", () => {
  // Lollapalooza 2025: JamBase's day sections came back empty and setlist.fm's
  // came back as one run-on line, so what survived the filters was the venue,
  // a stage programme, and two acts merged into one name. Three real-looking
  // claims about who played, and not one of them a bill.
  const { proposal, declineReason } = proposeFestivalDay(OSL, [
    {
      title: "Outside Lands 2026 At-a-Glance",
      url: "https://www.jambase.com/festival/outside-lands-2026",
      // List-shaped, so the refusal below is the floor talking and not the
      // prose rule: the page is readable, it just did not yield a bill.
      content:
        "Friday, August 7, 2026\nTame Impala\nKaytranada\nVenue\nMap & Directions\nAdvertisement",
    },
  ]);
  assert.equal(proposal, null);
  assert.match(declineReason, /failed to read/);
});

test("prose about a festival cannot be cut into a day's bill", () => {
  // Coachella 2025: Pitchfork named the right acts in sentences, and splitting
  // those sentences on their commas billed "the festival wrote" as an act and
  // put Friday's headliner on the Sunday. Being right about the festival is not
  // being right about the day.
  const { proposal, rejected } = proposeFestivalDay(OSL, [
    {
      title: "Outside Lands 2026 Full Lineup Announced",
      url: "https://pitchfork.com/news/outside-lands-2026-lineup",
      content:
        "The full lineup has been revealed. Charli xcx, Turnstile, and Labrinth " +
        "will headline Friday, August 7, 2026, the festival wrote, with sets from " +
        "Wet Leg, Geese, and many more.",
    },
  ]);
  assert.equal(proposal, null);
  assert.equal(rejected.at(-1).reason, "this day's part of the page reads as prose, not a lineup");
});

test("a sentence fragment is never an act", () => {
  assert.equal(looksLikeArtistName("the festival wrote"), false);
  assert.equal(looksLikeArtistName("many more artists"), false);
  assert.equal(looksLikeArtistName("scheduled for Sunday"), false);
  assert.equal(looksLikeArtistName("Wet Leg"), true);
});

// ---------------------------------------------------------------------------
// Approving a proposal must not mint a twin venue
// ---------------------------------------------------------------------------
//
// The agent's whole purpose is filling the catalog. Writing through the venue
// name the SOURCE used — "Midway San Francisco" next to the catalog's "The
// Midway" — turns it into a duplicate generator pointed at the thing it exists
// to fix, and every later match has to pick between the twins.

const CATALOG_VENUES = [
  { name: "The Midway", city: "San Francisco" },
  { name: "The Independent", city: "San Francisco" },
  { name: "Irving Plaza", city: "New York" },
  { name: "Blue Note Jazz Club", city: "New York" },
];

test("a room the web wrote differently resolves to the row the catalog has", () => {
  const resolve = (name, city) => canonicalVenue(name, city, CATALOG_VENUES)?.name ?? null;
  assert.equal(resolve("Midway San Francisco", "San Francisco"), "The Midway");
  assert.equal(resolve("The Midway SF", "San Francisco"), "The Midway");
  // The alias shape L1 measured on the catalog itself: a sponsor bolted on.
  assert.equal(resolve("Irving Plaza Powered By Verizon 5G", "New York"), "Irving Plaza");
  assert.equal(resolve("The Blue Note", "New York"), "Blue Note Jazz Club");
});

test("a room the catalog does not have is inserted, not merged into a neighbour", () => {
  // Null means "write what the source said". A wrong merge is worse than a
  // duplicate: it moves a show into a room it was not in.
  assert.equal(canonicalVenue("Bimbo's 365 Club", "San Francisco", CATALOG_VENUES), null);
  // "The Midway" plus a word that is not a sponsor, a city or a room type is a
  // different name that happens to start the same way.
  assert.equal(canonicalVenue("Midway Point", "San Francisco", CATALOG_VENUES), null);
});

test("the same name in another city is another room", () => {
  assert.equal(canonicalVenue("The Independent", "Los Angeles", CATALOG_VENUES), null);
  assert.equal(
    canonicalVenue("The Independent", "San Francisco", CATALOG_VENUES)?.name,
    "The Independent",
  );
});

test("two plausible rows mean the catalog is ambiguous, so nothing is merged", () => {
  const twins = [
    { name: "Blue Note", city: "New York" },
    { name: "Blue Note Jazz Club", city: "New York" },
  ];
  assert.equal(canonicalVenue("Blue Note Jazz", "New York", twins), null);
});
