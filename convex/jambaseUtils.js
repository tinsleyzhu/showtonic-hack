function extractPrimaryUrl(ctas) {
  if (!Array.isArray(ctas)) {
    return undefined;
  }

  for (const cta of ctas) {
    if (cta && typeof cta.url === "string" && cta.url.length > 0) {
      return cta.url;
    }
  }

  return undefined;
}

function firstImage(event) {
  if (typeof event?.image === "string") {
    return event.image;
  }

  const images = Array.isArray(event?.image) ? event.image : event?.images;
  const image = Array.isArray(images) ? images[0] : undefined;
  return typeof image === "string" ? image : image?.url;
}

function valueName(value) {
  if (typeof value === "string") return value;
  return typeof value?.name === "string" ? value.name : "";
}

function startTime(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1];
}

function validateJamBaseSourceUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("Source must be a valid JamBase API URL");
  }

  const isJamBaseApi =
    url.protocol === "https:" &&
    url.hostname === "api.data.jambase.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname.startsWith("/v3/");
  if (!isJamBaseApi) {
    throw new Error("Source must be an HTTPS JamBase API URL under api.data.jambase.com/v3");
  }

  return url.toString();
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// JamBase follows schema.org, where a Place carries `geo: { latitude, longitude }`.
// Different endpoints spell it differently, so accept the documented shape plus the
// obvious variants. Venue coordinates are what let the backfill matcher tell two
// same-night shows apart (see convex/backfillMatch.js) — without them the GPS
// signal is dead on real catalog data, so read them wherever they appear.
function readCoordinate(...candidates) {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? Number(candidate) : candidate;
    if (Number.isFinite(value) && value !== 0) return value;
  }
  return undefined;
}

function venueCoordinates(venue) {
  const geo = venue?.geo ?? venue?.location?.geo ?? {};
  return {
    latitude: readCoordinate(geo.latitude, geo.lat, venue?.latitude, venue?.lat),
    longitude: readCoordinate(geo.longitude, geo.lon, geo.lng, venue?.longitude, venue?.lng),
  };
}

// Spread-safe: omit the keys entirely when there is no coordinate, so the
// normalized event keeps its existing shape and Convex is never handed
// `latitude: undefined`.
function definedCoordinates(venue) {
  const coordinates = venueCoordinates(venue);
  return coordinates.latitude !== undefined && coordinates.longitude !== undefined
    ? coordinates
    : {};
}

function normalizeUpcomingEvents(payload, festivalId) {
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events.map((event) => {
    const venue = event.location ?? event.venue ?? {};
    const address = venue.address ?? {};
    const performers = Array.isArray(event.performer)
      ? event.performer
      : Array.isArray(event.artists)
        ? event.artists
        : [];
    const performerIds = performers.map((artist) => artist?.identifier);
    const artistJambaseIds = performerIds.length > 0 && performerIds.every(
      (identifier) => typeof identifier === "string" && identifier.length > 0,
    )
      ? performerIds
      : undefined;
    const title = String(event.title ?? event.name ?? "");
    const date = String(event.date ?? event.startDate ?? "").slice(0, 10);
    const inferredFestivalId =
      performers.length > 1 && /festival|fest|outside lands/i.test(title)
        ? `${slug(title)}-${date.slice(0, 4)}`
        : undefined;

    return {
      jambaseId: String(event.identifier ?? event.id ?? event.jambaseId ?? ""),
      title,
      date,
      startTime: startTime(event.startDate),
      venueName: String(venue.name ?? event.venueName ?? ""),
      city: valueName(venue.city ?? address.addressLocality ?? event.city),
      region: valueName(venue.region ?? address.addressRegion ?? event.region) || undefined,
      ...definedCoordinates(venue),
      image: firstImage(event),
      festivalId: festivalId ?? inferredFestivalId,
      stage: event.stage ?? undefined,
      isHeadliner: Boolean(event.isHeadliner),
      artistNames: performers
        .map((artist) => artist?.name)
        .filter((name) => typeof name === "string" && name.length > 0),
      artistJambaseIds,
      jambaseUrl: typeof event.url === "string" ? event.url : extractPrimaryUrl(event.ctas),
    };
  });
}

export {
  extractPrimaryUrl,
  normalizeUpcomingEvents,
  validateJamBaseSourceUrl,
  venueCoordinates,
};
