// Labeled fixtures for the backfill match eval (see ./matchEval.mjs).
//
// Every night carries ground truth: `expectedShowId`, or null when the correct
// answer is "don't guess". The scenarios are the failure modes that actually
// happen in a city — a crowded Saturday, a photo set stripped of GPS by a
// messaging app, a show that simply isn't in the catalog.
//
// Venue coordinates are approximate real SF locations. They only need to be
// far enough apart to be distinguishable, which is the point of the exercise.

const VENUES = {
  midway: { id: "v-midway", name: "The Midway", latitude: 37.748, longitude: -122.388 },
  folsom1015: { id: "v-1015", name: "1015 Folsom", latitude: 37.7784, longitude: -122.4058 },
  gamh: {
    id: "v-gamh",
    name: "Great American Music Hall",
    latitude: 37.7847,
    longitude: -122.4189,
  },
  independent: { id: "v-indy", name: "The Independent", latitude: 37.7761, longitude: -122.438 },
  publicWorks: { id: "v-pw", name: "Public Works", latitude: 37.769, longitude: -122.4194 },
  warfield: { id: "v-warfield", name: "The Warfield", latitude: 37.7825, longitude: -122.4103 },
};

const TODAY = "2026-08-26";

function show(id, date, venue, artistNames) {
  return {
    id,
    date,
    title: artistNames.join(" + "),
    artistNames,
    venueId: venue.id,
    venueName: venue.name,
    venueLatitude: venue.latitude,
    venueLongitude: venue.longitude,
    city: "San Francisco",
  };
}

// Deterministic photo burst near a point. Jitter stays inside ~40 m, which is
// realistic phone-GPS scatter inside one room.
function photosAt(date, venue, count, options = {}) {
  const startHour = options.startHour ?? 21;
  const photos = [];
  for (let index = 0; index < count; index += 1) {
    const minute = (index * 11) % 60;
    const hour = startHour + Math.floor((index * 11) / 60);
    const stamp =
      hour < 24
        ? `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
        : `${nextDay(date)}T${String(hour - 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const photo = { name: `IMG_${date}_${index}.jpg`, takenAt: stamp };
    if (venue && !options.stripGps) {
      const jitter = ((index % 5) - 2) * 0.00012;
      photo.latitude = Number((venue.latitude + jitter).toFixed(6));
      photo.longitude = Number((venue.longitude - jitter).toFixed(6));
    }
    photos.push(photo);
  }
  return photos;
}

function nextDay(date) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

// --- Catalog ---------------------------------------------------------------

const QUIET_NIGHTS = [
  { date: "2025-09-12", venue: VENUES.gamh, artists: ["Jamie xx"] },
  { date: "2025-10-03", venue: VENUES.independent, artists: ["Overmono"] },
];

// Five same-date shows per night. The true show sits at a different index each
// night (0,1,2,3,4) so a date-only matcher — which can only take the first —
// scores exactly 1/5, the honest value for guessing among five.
const CROWDED_NIGHTS = [
  { date: "2025-11-15", truthIndex: 0 },
  { date: "2025-12-06", truthIndex: 1 },
  { date: "2026-01-24", truthIndex: 2 },
  { date: "2026-03-14", truthIndex: 3 },
  { date: "2026-05-09", truthIndex: 4 },
];

const CROWDED_VENUE_ORDER = [
  VENUES.folsom1015,
  VENUES.midway,
  VENUES.publicWorks,
  VENUES.warfield,
  VENUES.gamh,
];

const CROWDED_ARTISTS = [
  ["Peggy Gou"],
  ["Sammy Virji"],
  ["Anfisa Letyago"],
  ["Barry Can't Swim"],
  ["Salute"],
];

function buildFixtures() {
  const shows = [];
  const nights = [];

  for (const night of QUIET_NIGHTS) {
    const id = `quiet-${night.date}`;
    shows.push(show(id, night.date, night.venue, night.artists));
    nights.push({
      scenario: "quiet-night",
      clusterDate: night.date,
      expectedShowId: id,
      photos: photosAt(night.date, night.venue, 6),
    });
  }

  for (const night of CROWDED_NIGHTS) {
    CROWDED_VENUE_ORDER.forEach((venue, index) => {
      shows.push(show(`crowd-${night.date}-${index}`, night.date, venue, CROWDED_ARTISTS[index]));
    });
    const truthVenue = CROWDED_VENUE_ORDER[night.truthIndex];
    nights.push({
      scenario: "crowded-night",
      clusterDate: night.date,
      expectedShowId: `crowd-${night.date}-${night.truthIndex}`,
      photos: photosAt(night.date, truthVenue, 9),
    });
  }

  // Same crowded shape, but the photos lost their GPS in transit (WhatsApp,
  // iOS Safari's picker). Truth sits at index 2, so a date-only fallback gets
  // it wrong — the honest result: no location, no better than v1.
  const strippedDate = "2026-02-21";
  CROWDED_VENUE_ORDER.forEach((venue, index) => {
    shows.push(show(`stripped-${strippedDate}-${index}`, strippedDate, venue, CROWDED_ARTISTS[index]));
  });
  nights.push({
    scenario: "gps-stripped",
    clusterDate: strippedDate,
    expectedShowId: `stripped-${strippedDate}-2`,
    photos: photosAt(strippedDate, CROWDED_VENUE_ORDER[2], 7, { stripGps: true }),
  });

  // One show that night, but the photos are across town: a house party, not
  // that gig. Guessing here would put a wrong show in someone's diary, so the
  // right answer is no candidate at all.
  const guardDate = "2026-04-18";
  shows.push(show(`guard-${guardDate}`, guardDate, VENUES.midway, ["Four Tet"]));
  nights.push({
    scenario: "wrong-venue-guard",
    clusterDate: guardDate,
    expectedShowId: null,
    photos: photosAt(guardDate, VENUES.independent, 5), // ~4.5 km from The Midway
  });

  // Nothing in the catalog for this night — the catalog-gap agent's queue.
  const offCatalogDate = "2026-06-27";
  nights.push({
    scenario: "off-catalog",
    clusterDate: offCatalogDate,
    expectedShowId: null,
    photos: photosAt(offCatalogDate, VENUES.publicWorks, 8),
  });

  return { shows, nights, today: TODAY };
}

export { CROWDED_VENUE_ORDER, TODAY, VENUES, buildFixtures, photosAt, show };
