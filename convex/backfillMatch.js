// Backfill matching engine — pure logic shared by the browser scan
// (`app/backfill.js`) and the server-assisted MCP path (`reclaim_camera_roll`).
// No I/O, no Convex, no DOM: everything here is a function of its arguments so
// both callers score identically and the eval harness can measure it.
//
// See docs/agent-hack/SPEC.md "Evidence fleet" and ARCHITECTURE.md.

const EVENING_START_HOUR = 17; // 5 PM — nights start here
const NIGHT_END_HOUR = 4; // photos before 4 AM belong to the previous night
const MIN_CLUSTER_PHOTOS = 3;
const MIN_CONFIDENCE = 0.5;

// GPS bands, in metres from the show's venue.
const VENUE_NEAR_METERS = 150; // same block — strong confirmation
const VENUE_NEARBY_METERS = 500; // festival grounds, GPS drift — weak confirmation
const VENUE_FAR_METERS = 2000; // different neighbourhood — evidence AGAINST

// Confidence deltas. Date is the anchor; GPS is what disambiguates a crowded
// Saturday, so it outweighs every taste-based hint.
const DELTA_DATE = 0.5;
const DELTA_GPS_NEAR = 0.35;
const DELTA_GPS_NEARBY = 0.15;
const DELTA_GPS_FAR = -0.3;
const DELTA_HEAVY_DOCUMENTATION = 0.1;
const DELTA_TASTE_ARTIST = 0.2;
const DELTA_VISITED_VENUE = 0.2;
const HEAVY_DOCUMENTATION_PHOTOS = 8;

// How much better the winner's LOCATING evidence must be than the runner-up's
// before we are willing to name it. Below this the two shows are, as far as
// anything we know about where you were, the same show — and picking between
// them is a coin flip wearing a confidence score.
const AMBIGUITY_MARGIN = 0.05;

// Which evidence actually places a person in a room. Taste and venue history
// describe what someone LIKES; they must never be what decides where they
// were, or the matcher just confirms what it already believed.
const LOCATING_KINDS = new Set(["date", "gps", "volume"]);

// ---------------------------------------------------------------------------
// Geo
// ---------------------------------------------------------------------------

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function isFiniteCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // 0,0 is Null Island — always a stripped/garbage coordinate, never a venue.
    !(latitude === 0 && longitude === 0)
  );
}

// Great-circle distance. Plain arithmetic — no maps API needed anywhere in this
// feature (see docs/agent-hack/SPEC.md).
function haversineMeters(from, to) {
  if (!from || !to) return null;
  if (!isFiniteCoordinate(from.latitude, from.longitude)) return null;
  if (!isFiniteCoordinate(to.latitude, to.longitude)) return null;

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function describeDistance(meters) {
  if (meters < 150) return "within a block";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

// ---------------------------------------------------------------------------
// Night attribution
// ---------------------------------------------------------------------------

// A night is defined by the clock on the wall where the photo was taken. Naive
// timestamps ("2026-06-27T22:30:00") are already that wall clock — EXIF and
// QuickTime sources record the camera's local time with no zone attached — and
// every Date read here hands the naive components back untouched. Offset-bearing
// timestamps ("2026-06-27T22:30:00-0700") carry their capture zone in the string
// itself, so the naive part IS the wall clock: strip the designator rather than
// converting through the runtime's zone. Converting is what shifted a
// UTC-exported night out of the evening window entirely — the whole night
// dropped with no error and no candidate.
const TIMEZONE_DESIGNATOR = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function hasTimezoneDesignator(takenAt) {
  return TIMEZONE_DESIGNATOR.test(String(takenAt ?? "").trim());
}

// The capture-local wall clock of a timestamp, as the naive string the night
// rules below expect; null when there is nothing to read.
function captureLocalWallClock(takenAt) {
  const raw = String(takenAt ?? "").trim();
  if (!raw) return null;
  return hasTimezoneDesignator(raw) ? raw.replace(TIMEZONE_DESIGNATOR, "") : raw;
}

// A photo taken before NIGHT_END_HOUR belongs to the previous calendar night.
function nightDateOf(takenAt) {
  const wallClock = captureLocalWallClock(takenAt);
  if (wallClock === null) return null;
  return nightOfWallClock(new Date(wallClock));
}

function nightOfWallClock(date) {
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime());
  if (date.getHours() < NIGHT_END_HOUR) shifted.setDate(shifted.getDate() - 1);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The evening window: shows start after 5 PM, and photos before 4 AM still
// belong to the night before. Everything else is a daytime photo, not a show.
// Takes the parsed capture-local wall clock — see captureLocalWallClock.
function isEveningWallClock(date) {
  const hours = date.getHours();
  return hours >= EVENING_START_HOUR || hours < NIGHT_END_HOUR;
}

function formatClock(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
}

function formatCaptureWindow(firstIso, lastIso) {
  const firstWall = captureLocalWallClock(firstIso);
  const lastWall = captureLocalWallClock(lastIso);
  if (firstWall === null || lastWall === null) return "";
  const first = new Date(firstWall);
  const last = new Date(lastWall);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return "";
  return `${formatClock(first)}–${formatClock(last)}`;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

// The cluster's location is the MEDIAN of its geotagged photos, not the mean —
// one stray shot from the taxi home should not drag the whole night across town.
function locateCluster(photos) {
  const points = photos.filter((photo) => isFiniteCoordinate(photo.latitude, photo.longitude));
  if (!points.length) return null;
  return {
    latitude: median(points.map((photo) => photo.latitude)),
    longitude: median(points.map((photo) => photo.longitude)),
    sampleCount: points.length,
  };
}

// Where a scan's photos went that never became a cluster. Every bucket is a
// decision the clusterer used to make silently — the whole-night-vanishes bug
// was invisible precisely because these counts did not exist. Photos with no
// timestamp and photos whose timestamp no parser could read share one bucket:
// to the scan there is no observable difference between the two.
function emptySkippedPhotoCounts() {
  return {
    unreadableTimestamps: 0, // no takenAt at all, or one that parses to nothing
    outsideEveningWindow: 0, // readable, but not plausibly part of a show night
    belowClusterMinimum: 0, // evening photos on a night that never reached 3
  };
}

// photos: [{ takenAt: ISO datetime, name?, latitude?, longitude? }]
//   → { clusters, skipped }, clusters newest first. Every hour check, sort key,
//     and capture endpoint reads the photo's own capture-local wall clock (see
//     captureLocalWallClock), never the runtime's zone. `skipped` is the
//     per-scan accounting for everything that did NOT become a cluster — a
//     returned empty array used to be ambiguous between "nothing there" and
//     "we dropped your night", so the caller always gets both answers.
function clusterPhotosIntoNights(photos) {
  const roll = Array.isArray(photos) ? photos : [];
  const skipped = emptySkippedPhotoCounts();
  const byNight = new Map();
  for (const photo of roll) {
    if (!photo?.takenAt) {
      skipped.unreadableTimestamps += 1;
      continue;
    }
    const wallClock = captureLocalWallClock(photo.takenAt);
    const parsed = wallClock === null ? null : new Date(wallClock);
    if (!parsed || Number.isNaN(parsed.getTime())) {
      skipped.unreadableTimestamps += 1;
      continue;
    }
    if (!isEveningWallClock(parsed)) {
      skipped.outsideEveningWindow += 1;
      continue;
    }
    const night = nightOfWallClock(parsed);
    if (!night) {
      // Unreachable after the parse above; a silent drop is never an option,
      // so even a defensive miss is counted rather than discarded.
      skipped.unreadableTimestamps += 1;
      continue;
    }
    const entry = byNight.get(night) ?? { clusterDate: night, photos: [] };
    entry.photos.push(photo);
    byNight.set(night, entry);
  }

  const clusters = [...byNight.values()]
    .filter((entry) => entry.photos.length >= MIN_CLUSTER_PHOTOS)
    .map((entry) => {
      const sorted = [...entry.photos].sort((left, right) =>
        captureLocalWallClock(left.takenAt).localeCompare(captureLocalWallClock(right.takenAt)),
      );
      const firstTakenAt = captureLocalWallClock(sorted[0].takenAt);
      const lastTakenAt = captureLocalWallClock(sorted[sorted.length - 1].takenAt);
      return {
        clusterDate: entry.clusterDate,
        photoCount: sorted.length,
        firstTakenAt,
        lastTakenAt,
        captureWindow: formatCaptureWindow(firstTakenAt, lastTakenAt),
        gps: locateCluster(sorted),
      };
    })
    .sort((left, right) => right.clusterDate.localeCompare(left.clusterDate));

  // Held back for size, not skipped by rule — a 2-photo evening is one more
  // photo away from being a night someone remembers.
  skipped.belowClusterMinimum = [...byNight.values()]
    .filter((entry) => entry.photos.length < MIN_CLUSTER_PHOTOS)
    .reduce((total, entry) => total + entry.photos.length, 0);

  return {
    clusters,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Matching — clusters × catalog shows → scored, evidenced candidates
// ---------------------------------------------------------------------------

function venueLocationOf(show) {
  if (!show) return null;
  const latitude = show.venueLatitude ?? show.latitude;
  const longitude = show.venueLongitude ?? show.longitude;
  return isFiniteCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

// Every signal returns an evidence row so the UI can show its work
// (docs/agent-hack/DESIGN.md "Evidence card") instead of a bare percentage.
function scoreShow(cluster, show, context) {
  const evidence = [
    {
      kind: "date",
      detail: cluster.captureWindow
        ? `${cluster.photoCount} photos, ${cluster.captureWindow} on the show date`
        : `${cluster.photoCount} photos on the show date`,
      delta: DELTA_DATE,
    },
  ];

  const venue = venueLocationOf(show);
  const distance = cluster.gps && venue ? haversineMeters(cluster.gps, venue) : null;
  const venueLabel = show.venueName ?? "the venue";

  if (distance !== null) {
    const photoWord = cluster.gps.sampleCount === 1 ? "photo" : "photos";
    if (distance <= context.nearMeters) {
      // Graded, not flat. Two clubs on one block — 1015 Folsom and its
      // neighbours are 60 m apart — used to score identically inside this band,
      // which left the winner to be decided by database iteration order. Being
      // nearer is evidence, so it has to move the number.
      evidence.push({
        kind: "gps",
        detail: `${cluster.gps.sampleCount} ${photoWord} within a block of ${venueLabel}`,
        delta:
          DELTA_GPS_NEAR -
          (distance / context.nearMeters) * (DELTA_GPS_NEAR - DELTA_GPS_NEARBY),
      });
    } else if (distance <= VENUE_NEARBY_METERS) {
      evidence.push({
        kind: "gps",
        detail: `${cluster.gps.sampleCount} ${photoWord} ${describeDistance(distance)} from ${venueLabel}`,
        delta: DELTA_GPS_NEARBY,
      });
    } else if (distance >= VENUE_FAR_METERS) {
      // Evidence AGAINST: a wrong log is worse than no log. Sinking the score
      // below MIN_CONFIDENCE hands the night to the catalog-gap agent instead.
      evidence.push({
        kind: "gps",
        detail: `Photos were ${describeDistance(distance)} from ${venueLabel}`,
        delta: DELTA_GPS_FAR,
      });
    }
  }

  if (cluster.photoCount >= HEAVY_DOCUMENTATION_PHOTOS) {
    evidence.push({
      kind: "volume",
      detail: `Heavy documentation — ${cluster.photoCount} photos`,
      delta: DELTA_HEAVY_DOCUMENTATION,
    });
  }

  const tasteHit = (show.artistNames ?? []).find((name) =>
    context.taste.has(String(name).toLowerCase()),
  );
  if (tasteHit) {
    evidence.push({
      kind: "taste",
      detail: `${tasteHit} is in your taste profile`,
      delta: DELTA_TASTE_ARTIST,
    });
  }

  if (show.venueId && context.visited.has(show.venueId)) {
    evidence.push({
      kind: "venue",
      detail: `You've logged shows at ${venueLabel}`,
      delta: DELTA_VISITED_VENUE,
    });
  }

  const confidence = Math.min(
    evidence.reduce((total, row) => total + row.delta, 0),
    0.99,
  );
  // Tracked separately so a crowded night is decided by where the photos were,
  // never by which act the person already likes.
  const locating = evidence
    .filter((row) => LOCATING_KINDS.has(row.kind))
    .reduce((total, row) => total + row.delta, 0);
  return { confidence, locating, evidence, distanceMeters: distance };
}

// shows: [{ id, date, artistNames?, venueName?, venueId?, venueLatitude?,
//           venueLongitude?, city?, title?, image? }]
// options: { tasteArtists?, visitedVenueIds?, today?, venueRadiusMeters? }
function matchClustersToShows(clusters, shows, options = {}) {
  const context = {
    taste: new Set((options.tasteArtists ?? []).map((name) => String(name).toLowerCase())),
    visited: new Set(options.visitedVenueIds ?? []),
    nearMeters: options.venueRadiusMeters ?? VENUE_NEAR_METERS,
  };
  // Exposed so the eval can reproduce v1 faithfully: what shipped at Outside
  // Lands had no ambiguity guard, and a baseline that quietly gets today's
  // improvements is not a baseline.
  const ambiguityMargin = options.ambiguityMargin ?? AMBIGUITY_MARGIN;
  const today = options.today ?? "9999-12-31";

  const byDate = new Map();
  for (const show of Array.isArray(shows) ? shows : []) {
    if (typeof show.date !== "string" || show.date >= today) continue; // never match the future
    const entry = byDate.get(show.date) ?? [];
    entry.push(show);
    byDate.set(show.date, entry);
  }

  const candidates = [];
  for (const cluster of Array.isArray(clusters) ? clusters : []) {
    const sameNight = byDate.get(cluster.clusterDate) ?? [];
    const scored = sameNight
      .map((show) => ({ show, ...scoreShow(cluster, show, context) }))
      .sort((left, right) => right.locating - left.locating || right.confidence - left.confidence);

    const best = scored[0] ?? null;
    const runnerUp = scored[1] ?? null;

    // A night where two shows are equally well located is a night we cannot
    // explain — so we decline it and it becomes the catalog-gap agent's
    // problem, rather than a coin flip in someone's diary. Note the comparison
    // is on LOCATING evidence only: taste may raise a candidate's confidence,
    // but it is not allowed to be the reason one show beat another.
    const ambiguous = runnerUp !== null && best.locating - runnerUp.locating < ambiguityMargin;

    if (best && !ambiguous && best.confidence >= MIN_CONFIDENCE) {
      candidates.push({
        clusterDate: cluster.clusterDate,
        photoCount: cluster.photoCount,
        captureWindow: cluster.captureWindow,
        showId: best.show.id,
        showTitle: best.show.title,
        artistNames: best.show.artistNames ?? [],
        venueName: best.show.venueName,
        city: best.show.city,
        image: best.show.image,
        confidence: best.confidence,
        evidence: best.evidence,
        distanceMeters: best.distanceMeters,
      });
    }
  }
  return candidates.sort(
    (left, right) =>
      right.confidence - left.confidence || right.clusterDate.localeCompare(left.clusterDate),
  );
}

// Nights the matcher could not place — the catalog-gap agent's queue (phase 3).
function unmatchedClusters(clusters, candidates) {
  const matched = new Set((candidates ?? []).map((candidate) => candidate.clusterDate));
  return (Array.isArray(clusters) ? clusters : []).filter(
    (cluster) => !matched.has(cluster.clusterDate),
  );
}

// Confidence → the "N% likely" label on the evidence card (design 09).
function describeConfidence(confidence) {
  return `${Math.round(confidence * 100)}% likely`;
}

// Design 11 headline: "Four years of nights, back in one place."
function describeReclaimSpan(candidates) {
  const dates = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => candidate.clusterDate)
    .filter(Boolean)
    .sort();
  if (!dates.length) return "";
  const firstYear = Number(dates[0].slice(0, 4));
  const lastYear = Number(dates[dates.length - 1].slice(0, 4));
  const span = lastYear - firstYear + 1;
  if (span <= 1) return "A year of nights, back in one place.";
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const label = words[span] ?? String(span);
  return `${label} years of nights, back in one place.`;
}

export {
  AMBIGUITY_MARGIN,
  DELTA_DATE,
  DELTA_GPS_FAR,
  DELTA_GPS_NEAR,
  DELTA_GPS_NEARBY,
  HEAVY_DOCUMENTATION_PHOTOS,
  MIN_CLUSTER_PHOTOS,
  MIN_CONFIDENCE,
  VENUE_FAR_METERS,
  VENUE_NEARBY_METERS,
  VENUE_NEAR_METERS,
  captureLocalWallClock,
  clusterPhotosIntoNights,
  describeConfidence,
  describeDistance,
  describeReclaimSpan,
  formatCaptureWindow,
  hasTimezoneDesignator,
  haversineMeters,
  locateCluster,
  matchClustersToShows,
  nightDateOf,
  unmatchedClusters,
};
