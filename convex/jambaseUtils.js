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

    return {
      jambaseId: String(event.identifier ?? event.id ?? event.jambaseId ?? ""),
      title: String(event.title ?? event.name ?? ""),
      date: String(event.date ?? event.startDate ?? "").slice(0, 10),
      venueName: String(venue.name ?? event.venueName ?? ""),
      city: valueName(venue.city ?? address.addressLocality ?? event.city),
      region: valueName(venue.region ?? address.addressRegion ?? event.region) || undefined,
      image: firstImage(event),
      festivalId,
      stage: event.stage ?? undefined,
      isHeadliner: Boolean(event.isHeadliner),
      artistNames: performers
        .map((artist) => artist?.name)
        .filter((name) => typeof name === "string" && name.length > 0),
      jambaseUrl: typeof event.url === "string" ? event.url : extractPrimaryUrl(event.ctas),
    };
  });
}

module.exports = {
  extractPrimaryUrl,
  normalizeUpcomingEvents,
};
