import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeUpcomingEvents,
  validateJamBaseSourceUrl,
  venueCoordinates,
} from "../convex/jambaseUtils.js";

test("validateJamBaseSourceUrl only permits the JamBase v3 HTTPS host", () => {
  const sourceUrl =
    "https://api.data.jambase.com/v3/events?name=Outside%20Lands&perPage=100";

  assert.equal(validateJamBaseSourceUrl(sourceUrl), sourceUrl);
  assert.throws(
    () => validateJamBaseSourceUrl("https://example.com/collect-key"),
    /JamBase API URL/,
  );
  assert.throws(
    () => validateJamBaseSourceUrl("http://api.data.jambase.com/v3/events"),
    /JamBase API URL/,
  );
});

test("normalizeUpcomingEvents extracts the primary event url and artist names", () => {
  const [event] = normalizeUpcomingEvents(
    {
      events: [
        {
          id: "jam-1",
          title: "Charli XCX",
          date: "2026-08-07",
          venue: { name: "Golden Gate Park", city: "San Francisco", region: "CA" },
          artists: [{ name: "Charli XCX" }],
          image: "https://example.com/hero.jpg",
          ctas: [{ label: "Tickets", url: "https://www.jambase.com/show/jam-1" }],
          stage: "Twin Peaks",
          isHeadliner: true,
        },
      ],
    },
    "outside-lands-2026",
  );

  assert.deepEqual(event, {
    jambaseId: "jam-1",
    title: "Charli XCX",
    date: "2026-08-07",
    startTime: undefined,
    venueName: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    image: "https://example.com/hero.jpg",
    festivalId: "outside-lands-2026",
    stage: "Twin Peaks",
    isHeadliner: true,
    artistNames: ["Charli XCX"],
    artistJambaseIds: undefined,
    jambaseUrl: "https://www.jambase.com/show/jam-1",
  });
});

test("normalizeUpcomingEvents supports the JamBase v3 event schema", () => {
  const [event] = normalizeUpcomingEvents(
    {
      events: [
        {
          identifier: "jambase:15583575",
          name: "Outside Lands",
          startDate: "2026-08-07T11:00:00",
          location: {
            name: "Golden Gate Park",
            address: {
              addressLocality: "San Francisco",
              addressRegion: "CA",
            },
          },
          performer: [
            { name: "Doechii", identifier: "jambase:doechii" },
            { name: "Charli XCX", identifier: "jambase:charli-xcx" },
          ],
          image: "https://example.com/outside-lands.jpg",
          url: "https://www.jambase.com/festival/outside-lands-2026",
        },
      ],
    },
    "outside-lands-2026",
  );

  assert.deepEqual(event, {
    jambaseId: "jambase:15583575",
    title: "Outside Lands",
    date: "2026-08-07",
    startTime: "11:00",
    venueName: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    image: "https://example.com/outside-lands.jpg",
    festivalId: "outside-lands-2026",
    stage: undefined,
    isHeadliner: false,
    artistNames: ["Doechii", "Charli XCX"],
    artistJambaseIds: ["jambase:doechii", "jambase:charli-xcx"],
    jambaseUrl: "https://www.jambase.com/festival/outside-lands-2026",
  });
});

test("normalizeUpcomingEvents identifies a multi-artist festival as one event", () => {
  const [event] = normalizeUpcomingEvents({
    events: [{
      identifier: "jambase:outside-lands-2026",
      name: "Outside Lands",
      startDate: "2026-08-07T12:00:00",
      location: { name: "Golden Gate Park", city: "San Francisco" },
      performer: [
        { identifier: "jambase:artist-a", name: "Artist A" },
        { identifier: "jambase:artist-b", name: "Artist B" },
      ],
    }],
  });

  assert.equal(event.festivalId, "outside-lands-2026");
  assert.deepEqual(event.artistNames, ["Artist A", "Artist B"]);
});

// --- Venue coordinates ------------------------------------------------------
// Venue geo drives the backfill GPS signal (convex/backfillMatch.js). JamBase is
// schema.org-shaped, but the spelling varies by endpoint.

test("reads schema.org geo from a venue", () => {
  assert.deepEqual(venueCoordinates({ geo: { latitude: 37.7749, longitude: -122.4194 } }), {
    latitude: 37.7749,
    longitude: -122.4194,
  });
});

test("accepts lat/lon/lng spellings and numeric strings", () => {
  assert.deepEqual(venueCoordinates({ geo: { lat: "37.78", lon: "-122.41" } }), {
    latitude: 37.78,
    longitude: -122.41,
  });
  assert.deepEqual(venueCoordinates({ latitude: 40.7, lng: -73.9 }), {
    latitude: 40.7,
    longitude: -73.9,
  });
});

test("treats missing, zero, and unparseable coordinates as absent", () => {
  assert.deepEqual(venueCoordinates({}), { latitude: undefined, longitude: undefined });
  assert.deepEqual(venueCoordinates(null), { latitude: undefined, longitude: undefined });
  // 0,0 is Null Island — a stripped value, never a venue.
  assert.deepEqual(venueCoordinates({ geo: { latitude: 0, longitude: 0 } }), {
    latitude: undefined,
    longitude: undefined,
  });
  assert.deepEqual(venueCoordinates({ geo: { latitude: "nope", longitude: "nope" } }), {
    latitude: undefined,
    longitude: undefined,
  });
});

test("normalized events carry venue coordinates through to the catalog", () => {
  const [event] = normalizeUpcomingEvents({
    events: [
      {
        identifier: "jambase:1",
        name: "Test Show",
        startDate: "2026-01-10T21:00:00",
        location: {
          name: "The Midway",
          city: "San Francisco",
          geo: { latitude: 37.748, longitude: -122.388 },
        },
        performer: [{ name: "Someone", identifier: "jambase:a1" }],
      },
    ],
  });
  assert.equal(event.latitude, 37.748);
  assert.equal(event.longitude, -122.388);
});
