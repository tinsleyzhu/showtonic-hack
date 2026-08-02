import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUpcomingEvents } from "../convex/jambaseUtils.js";

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
    venueName: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    image: "https://example.com/hero.jpg",
    festivalId: "outside-lands-2026",
    stage: "Twin Peaks",
    isHeadliner: true,
    artistNames: ["Charli XCX"],
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
            { name: "Doechii" },
            { name: "Charli XCX" },
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
    venueName: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    image: "https://example.com/outside-lands.jpg",
    festivalId: "outside-lands-2026",
    stage: undefined,
    isHeadliner: false,
    artistNames: ["Doechii", "Charli XCX"],
    jambaseUrl: "https://www.jambase.com/festival/outside-lands-2026",
  });
});
