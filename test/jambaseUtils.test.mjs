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
