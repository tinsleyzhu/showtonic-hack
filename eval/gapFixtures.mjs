// Labeled fixtures for the catalog-gap eval (see ./gapEval.mjs).
//
// Each night here is one the matcher already declined — no catalog show
// explains it — paired with the search results the web actually returns for
// that kind of night. Ground truth is `expectedArtists`, or null when the
// correct behaviour is to propose nothing.
//
// The canned results are modelled on real listing pages: DICE and Songkick
// event pages, a venue's own calendar index, a Resident Advisor archive from
// the wrong year. They are the shapes that break naive parsing, which is the
// point of having them.
//
// Venues match eval/fixtures.mjs so the two evals describe one city.

import { VENUES } from "./fixtures.mjs";

// A night, as the gap agent receives it: the cluster date, and the venue the
// photos were near (already resolved by nearestVenues in the real path).
function night(scenario, clusterDate, anchorVenue, expectedArtists, results) {
  return {
    scenario,
    clusterDate,
    anchorVenue,
    city: "San Francisco",
    expectedArtists,
    results,
  };
}

const NIGHTS = [
  // --- The case the feature exists for --------------------------------------
  night(
    "gap-resolved",
    "2026-06-27",
    VENUES.publicWorks.name,
    ["Sherelle"],
    [
      {
        title: "Sherelle at Public Works - Jun 27, 2026 | Tickets",
        url: "https://dice.fm/event/sherelle-public-works-2026",
        content: "Sherelle plays Public Works, San Francisco on June 27, 2026. Doors 10pm.",
      },
      {
        title: "Public Works - Upcoming Shows",
        url: "https://publicsf.com/events",
        content: "Our June 27, 2026 calendar and everything after it.",
      },
    ],
  ),

  night(
    "gap-corroborated",
    "2026-07-11",
    VENUES.midway.name,
    ["Anz"],
    [
      {
        title: "Anz at The Midway - July 11, 2026",
        url: "https://dice.fm/event/anz-midway",
        content: "The Midway, San Francisco. July 11, 2026.",
      },
      {
        title: "Anz | The Midway | San Francisco",
        url: "https://www.songkick.com/concerts/anz-the-midway",
        content: "July 11, 2026 at The Midway.",
      },
    ],
  ),

  // A bill, not a headliner — the proposal must carry both names or the show
  // it creates is wrong for everyone who matches against it later.
  night(
    "gap-multi-artist",
    "2026-07-25",
    VENUES.folsom1015.name,
    ["Overmono", "Salute"],
    [
      {
        title: "Overmono + Salute at 1015 Folsom - Jul 25, 2026",
        url: "https://ra.co/events/1985412",
        content: "1015 Folsom, San Francisco. July 25, 2026.",
      },
    ],
  ),

  // --- The refusals ---------------------------------------------------------

  // Same room, same day-of-month, wrong year. The single most likely way to
  // put a plausible lie in the catalog.
  night("gap-wrong-year", "2026-05-30", VENUES.gamh.name, null, [
    {
      title: "Jamie xx at Great American Music Hall - May 30, 2024",
      url: "https://ra.co/events/1620993",
      content: "Great American Music Hall, San Francisco. May 30, 2024.",
    },
    {
      title: "Great American Music Hall Concert History",
      url: "https://www.setlist.fm/venue/great-american-music-hall-abc.html",
      content: "Every show at Great American Music Hall, 1972 to today.",
    },
  ]),

  // The web disagrees with itself about who played. Either answer is a coin
  // flip wearing a source URL.
  night("gap-contested", "2026-04-04", VENUES.warfield.name, null, [
    {
      title: "Little Simz at The Warfield - Apr 4, 2026",
      url: "https://www.axs.com/events/little-simz-warfield",
      content: "The Warfield, San Francisco, April 4, 2026.",
    },
    {
      title: "black midi at The Warfield - Apr 4, 2026",
      url: "https://www.songkick.com/concerts/black-midi-warfield",
      content: "The Warfield, San Francisco. April 4, 2026.",
    },
  ]),

  // No GPS on the night, so the search was city-wide. A show that happened
  // somewhere in San Francisco is not evidence this person attended it.
  night("gap-no-gps", "2026-03-07", null, null, [
    {
      title: "Fred again.. at Bill Graham Civic - Mar 7, 2026",
      url: "https://www.ticketmaster.com/event/fred-again-bill-graham",
      content: "Bill Graham Civic Auditorium, San Francisco. March 7, 2026.",
    },
  ]),

  // The venue's calendar index page names the date but never a lineup. A
  // naive parser reads "Upcoming Shows" as an artist.
  night("gap-index-page-only", "2026-02-14", VENUES.independent.name, null, [
    {
      title: "The Independent - Upcoming Shows",
      url: "https://www.theindependentsf.com/calendar",
      content: "Shows at The Independent including February 14, 2026.",
    },
    {
      title: "Events | The Independent | Tickets",
      url: "https://www.theindependentsf.com/events",
      content: "February 14, 2026 and beyond at The Independent.",
    },
  ]),

  // A house party near a venue. The web has nothing about that room that
  // night, and the results are about the venue in general.
  night("gap-nothing-there", "2026-01-10", VENUES.midway.name, null, [
    {
      title: "The Midway San Francisco - Art and Music Complex",
      url: "https://themidwaysf.com/",
      content: "A 40,000 sq ft creative complex in the Dogpatch.",
    },
  ]),

  // A lookalike host must not collect the ticketing-domain boost, which is
  // what would otherwise push a lone unverified listing over the bar.
  night("gap-lookalike-domain", "2026-08-01", VENUES.publicWorks.name, null, [
    {
      title: "Peggy Gou at 1015 Folsom - Aug 1, 2026",
      url: "https://dice.fm.tickets-cheap.example/peggy-gou",
      content: "1015 Folsom, San Francisco, August 1, 2026.",
    },
  ]),

  // Nothing came back at all. The agent must survive an empty result set.
  night("gap-no-results", "2025-12-20", VENUES.gamh.name, null, []),
];

export { NIGHTS, night };
