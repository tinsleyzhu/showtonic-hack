import assert from "node:assert/strict";
import test from "node:test";

import {
  DELTA_DATE,
  DELTA_GPS_FAR,
  DELTA_GPS_NEAR,
  DELTA_GPS_NEARBY,
  MIN_CONFIDENCE,
  clusterPhotosIntoNights,
  describeDistance,
  haversineMeters,
  locateCluster,
  matchClustersToShows,
  unmatchedClusters,
} from "../convex/backfillMatch.js";

const MIDWAY = { latitude: 37.748, longitude: -122.388 };
const INDEPENDENT = { latitude: 37.7761, longitude: -122.438 };

// --- Geometry --------------------------------------------------------------

test("haversine measures real distances and rejects unusable coordinates", () => {
  const meters = haversineMeters(MIDWAY, INDEPENDENT);
  // The Midway to The Independent is roughly 5 km across San Francisco.
  assert.equal(meters > 4000 && meters < 6000, true);
  assert.equal(Math.round(haversineMeters(MIDWAY, MIDWAY)), 0);

  assert.equal(haversineMeters(MIDWAY, null), null);
  assert.equal(haversineMeters(MIDWAY, { latitude: 0, longitude: 0 }), null); // Null Island
  assert.equal(haversineMeters(MIDWAY, { latitude: 91, longitude: 0 }), null);
  assert.equal(haversineMeters(MIDWAY, { latitude: NaN, longitude: 12 }), null);
});

test("distance copy switches units at readable thresholds", () => {
  assert.equal(describeDistance(80), "within a block");
  assert.equal(describeDistance(420), "420 m away");
  assert.equal(describeDistance(4500), "4.5 km away");
});

// --- Cluster location ------------------------------------------------------

test("cluster location is the median, so one stray photo cannot move the night", () => {
  const located = locateCluster([
    { latitude: 37.748, longitude: -122.388 },
    { latitude: 37.7481, longitude: -122.3881 },
    { latitude: 37.7482, longitude: -122.3882 },
    { latitude: 37.9, longitude: -122.9 }, // the taxi home
  ]);
  assert.equal(located.sampleCount, 4);
  assert.equal(haversineMeters(located, MIDWAY) < 150, true);
});

test("cluster location is null when nothing is geotagged", () => {
  assert.equal(locateCluster([{ takenAt: "2025-11-15T21:00:00" }]), null);
  assert.equal(locateCluster([]), null);
});

test("clustering carries GPS onto the night", () => {
  const photos = [0, 1, 2].map((index) => ({
    takenAt: `2025-11-15T2${index}:10:00`,
    latitude: MIDWAY.latitude,
    longitude: MIDWAY.longitude,
  }));
  const [cluster] = clusterPhotosIntoNights(photos);
  assert.equal(cluster.gps.sampleCount, 3);
  assert.equal(Math.round(haversineMeters(cluster.gps, MIDWAY)), 0);
});

// --- GPS scoring -----------------------------------------------------------

const crowdedNight = [
  {
    id: "midway",
    date: "2025-11-15",
    title: "Peggy Gou",
    artistNames: ["Peggy Gou"],
    venueId: "v-midway",
    venueName: "The Midway",
    venueLatitude: MIDWAY.latitude,
    venueLongitude: MIDWAY.longitude,
  },
  {
    id: "independent",
    date: "2025-11-15",
    title: "Overmono",
    artistNames: ["Overmono"],
    venueId: "v-indy",
    venueName: "The Independent",
    venueLatitude: INDEPENDENT.latitude,
    venueLongitude: INDEPENDENT.longitude,
  },
];

function clusterAt(point, options = {}) {
  return {
    clusterDate: options.date ?? "2025-11-15",
    photoCount: options.photoCount ?? 5,
    captureWindow: "10:00 PM–1:00 AM",
    firstTakenAt: "",
    lastTakenAt: "",
    gps: point ? { ...point, sampleCount: options.sampleCount ?? 5 } : null,
  };
}

test("GPS picks the right show out of a crowded night", () => {
  const [candidate] = matchClustersToShows([clusterAt(INDEPENDENT)], crowdedNight, {
    today: "2026-08-26",
  });
  // Date-only would have taken "midway" — the first same-date show.
  assert.equal(candidate.showId, "independent");
  assert.equal(Number(candidate.confidence.toFixed(2)), DELTA_DATE + DELTA_GPS_NEAR);
  assert.equal(
    candidate.evidence.some((row) => row.kind === "gps" && row.detail.includes("within a block")),
    true,
  );
});

test("nearby-but-not-adjacent GPS is a weaker signal", () => {
  // ~350 m from The Midway: festival grounds or GPS drift, not a confirmation.
  const nearby = { latitude: MIDWAY.latitude + 0.0031, longitude: MIDWAY.longitude };
  const [candidate] = matchClustersToShows([clusterAt(nearby)], [crowdedNight[0]], {
    today: "2026-08-26",
  });
  assert.equal(Number(candidate.confidence.toFixed(2)), DELTA_DATE + DELTA_GPS_NEARBY);
});

test("photos across town sink the only same-date show below the threshold", () => {
  const candidates = matchClustersToShows([clusterAt(INDEPENDENT)], [crowdedNight[0]], {
    today: "2026-08-26",
  });
  // 0.5 date - 0.3 contradiction = 0.2. A wrong diary entry is worse than none.
  assert.deepEqual(candidates, []);
  assert.equal(DELTA_DATE + DELTA_GPS_FAR < MIN_CONFIDENCE, true);
});

test("missing coordinates degrade to date-only rather than failing", () => {
  // One show that night: no GPS is a weaker answer, not a missing one.
  const [candidate] = matchClustersToShows([clusterAt(null)], [crowdedNight[0]], {
    today: "2026-08-26",
  });
  assert.equal(candidate.confidence, DELTA_DATE);
  assert.equal(
    candidate.evidence.every((row) => row.kind !== "gps"),
    true,
  );

  // A show with no venue coordinates is scored, never penalised.
  const [noVenueGps] = matchClustersToShows(
    [clusterAt(MIDWAY)],
    [{ id: "x", date: "2025-11-15", artistNames: ["X"], venueName: "Unknown room" }],
    { today: "2026-08-26" },
  );
  assert.equal(noVenueGps.confidence, DELTA_DATE);
});

test("a crowded night with no location is declined, not guessed", () => {
  // Five shows, nothing to tell them apart but the date. Every one of them
  // scores exactly the same, so naming one would be a coin flip presented as a
  // 50% confident answer. The night goes to the catalog-gap agent instead.
  const candidates = matchClustersToShows([clusterAt(null)], crowdedNight, {
    today: "2026-08-26",
  });
  assert.deepEqual(candidates, []);
});

test("taste cannot be the reason one show beat another", () => {
  // The dangerous version of the case above: the same unlocatable night, but
  // now one of the five is by an artist the person already likes and at a room
  // they have been to. Those add up to 0.90 — a confident, systematically
  // biased wrong answer that tells people they saw the acts they already like.
  const candidates = matchClustersToShows([clusterAt(null)], crowdedNight, {
    today: "2026-08-26",
    tasteArtists: ["peggy gou"],
    visitedVenueIds: ["v-midway"],
  });
  assert.deepEqual(candidates, []);
});

test("the nearer of two venues on one block wins, whatever the catalog order", () => {
  // 1015 Folsom and its neighbours are ~60 m apart. A flat "within a block"
  // bonus scored them identically and left the winner to database iteration
  // order; proximity is evidence, so it has to move the number.
  const here = { latitude: MIDWAY.latitude, longitude: MIDWAY.longitude };
  const neighbour = { latitude: MIDWAY.latitude + 0.00054, longitude: MIDWAY.longitude };
  const shows = [
    { id: "neighbour", date: "2025-11-15", artistNames: ["Wrong"], venueName: "Next door", venueLatitude: neighbour.latitude, venueLongitude: neighbour.longitude },
    { id: "truth", date: "2025-11-15", artistNames: ["Right"], venueName: "This room", venueLatitude: here.latitude, venueLongitude: here.longitude },
  ];
  for (const order of [shows, [...shows].reverse()]) {
    const [candidate] = matchClustersToShows([clusterAt(here)], order, { today: "2026-08-26" });
    assert.equal(candidate.showId, "truth");
  }
});

test("two shows in the same room on one night are declined", () => {
  // Identical coordinates: an early set and a late set, or two rooms in one
  // building. Location cannot separate them, so nothing should.
  const shows = ["early", "late"].map((id) => ({
    id,
    date: "2025-11-15",
    artistNames: [id],
    venueName: "The Midway",
    venueLatitude: MIDWAY.latitude,
    venueLongitude: MIDWAY.longitude,
  }));
  assert.deepEqual(matchClustersToShows([clusterAt(MIDWAY)], shows, { today: "2026-08-26" }), []);
});

// --- Evidence --------------------------------------------------------------

test("every signal produces an evidence row that sums to the confidence", () => {
  const [candidate] = matchClustersToShows([clusterAt(MIDWAY, { photoCount: 9 })], crowdedNight, {
    today: "2026-08-26",
    tasteArtists: ["peggy gou"],
    visitedVenueIds: ["v-midway"],
  });
  const kinds = candidate.evidence.map((row) => row.kind);
  assert.deepEqual(kinds, ["date", "gps", "volume", "taste", "venue"]);

  const summed = candidate.evidence.reduce((total, row) => total + row.delta, 0);
  assert.equal(candidate.confidence, Math.min(Number(summed.toFixed(10)), 0.99));
  assert.equal(candidate.confidence, 0.99); // capped
  assert.equal(
    candidate.evidence.some((row) => row.detail === "Peggy Gou is in your taste profile"),
    true,
  );
});

test("evidence explains a negative signal in the user's words", () => {
  // Scored directly against a single far show so the row survives thresholding.
  const [cluster] = [clusterAt(INDEPENDENT)];
  const candidates = matchClustersToShows([cluster], crowdedNight, { today: "2026-08-26" });
  const against = candidates[0].evidence.filter((row) => row.delta < 0);
  assert.equal(against.length, 0); // the winning show is the near one
});

// --- Unmatched nights (the catalog-gap agent's queue) ----------------------

test("nights with no same-date show come back as unmatched", () => {
  const clusters = [clusterAt(MIDWAY), clusterAt(MIDWAY, { date: "2026-06-27" })];
  const candidates = matchClustersToShows(clusters, crowdedNight, { today: "2026-08-26" });
  const gaps = unmatchedClusters(clusters, candidates);
  assert.deepEqual(
    gaps.map((cluster) => cluster.clusterDate),
    ["2026-06-27"],
  );
});

test("future shows are never matched", () => {
  const candidates = matchClustersToShows(
    [clusterAt(MIDWAY, { date: "2030-01-01" })],
    [{ ...crowdedNight[0], date: "2030-01-01" }],
    { today: "2026-08-26" },
  );
  assert.deepEqual(candidates, []);
});
