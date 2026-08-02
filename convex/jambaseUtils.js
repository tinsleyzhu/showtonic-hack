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

function normalizeUpcomingEvents(payload, festivalId) {
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events.map((event) => ({
    jambaseId: String(event.id ?? event.jambaseId ?? ""),
    title: String(event.title ?? event.name ?? ""),
    date: String(event.date ?? event.startDate ?? ""),
    venueName: String(event.venue?.name ?? event.venueName ?? ""),
    city: String(event.venue?.city ?? event.city ?? ""),
    region: event.venue?.region ?? event.region ?? undefined,
    image: event.image ?? event.images?.[0]?.url ?? undefined,
    festivalId,
    stage: event.stage ?? undefined,
    isHeadliner: Boolean(event.isHeadliner),
    artistNames: Array.isArray(event.artists)
      ? event.artists
          .map((artist) => artist?.name)
          .filter((name) => typeof name === "string" && name.length > 0)
      : [],
    jambaseUrl: extractPrimaryUrl(event.ctas),
  }));
}

module.exports = {
  extractPrimaryUrl,
  normalizeUpcomingEvents,
};
