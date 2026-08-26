// Free-source normalizers — a drop-in replacement for JamBase's paid catalog.
//
// JamBase is an aggregation + normalization layer over data that is itself
// public. We reconstruct the same normalized event shape (see the
// `upcomingEvent` validator in convex/shows.ts) from three free APIs:
//
//   - Ticketmaster Discovery  -> future shows, ticket URLs, venue geo, genre
//   - Setlist.fm              -> historical shows + setlists (crowd-sourced)
//   - Spotify / MusicBrainz   -> artist image, genres, hometown, preview track
//
// Every function here is PURE (no fetch) so it can be unit-tested against
// recorded fixtures, exactly like convex/jambaseUtils.js.
//
// Identity: free events are namespaced by source (`tm:`, `slfm:`) so they never
// collide with `jambase:` ids and survive JamBase's reconcile pass untouched.

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function num(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

// Mirror jambaseUtils: a multi-artist event whose title reads like a festival
// gets grouped so the lineup shelf can find it.
function inferFestivalId(title, date, artistCount) {
  return artistCount > 1 && /festival|fest|outside lands/i.test(String(title))
    ? `${slug(title)}-${String(date).slice(0, 4)}`
    : undefined;
}

// ---------------------------------------------------------------------------
// Ticketmaster Discovery API  (GET /discovery/v2/events.json)
// Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// ---------------------------------------------------------------------------

// Pick the widest 16:9 image so venue/hero art matches JamBase's landscape crop.
function bestTicketmasterImage(images) {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const ranked = [...images].sort((a, b) => {
    const wide = (img) => (img?.ratio === "16_9" ? 1 : 0);
    return wide(b) - wide(a) || (b?.width ?? 0) - (a?.width ?? 0);
  });
  return typeof ranked[0]?.url === "string" ? ranked[0].url : undefined;
}

function ticketmasterGenres(event) {
  const c = Array.isArray(event?.classifications) ? event.classifications[0] : undefined;
  const names = [c?.genre?.name, c?.subGenre?.name].filter(
    (name) => typeof name === "string" && name && name !== "Undefined",
  );
  return [...new Set(names)];
}

function normalizeTicketmasterEvents(payload, festivalId) {
  const events = payload?._embedded?.events;
  if (!Array.isArray(events)) return [];

  return events
    .map((event) => {
      const venue = event?._embedded?.venues?.[0] ?? {};
      const attractions = Array.isArray(event?._embedded?.attractions)
        ? event._embedded.attractions
        : [];
      const artistNames = attractions
        .map((a) => a?.name)
        .filter((name) => typeof name === "string" && name.length > 0);
      const artistIds = attractions
        .map((a) => (typeof a?.id === "string" && a.id ? `tm-attraction:${a.id}` : null))
        .filter(Boolean);

      const title = String(event?.name ?? "");
      const date = String(event?.dates?.start?.localDate ?? "").slice(0, 10);
      const localTime = event?.dates?.start?.localTime; // "20:00:00"
      const startTime =
        typeof localTime === "string" && /^\d{2}:\d{2}/.test(localTime)
          ? localTime.slice(0, 5)
          : undefined;

      return {
        jambaseId: `tm:${event?.id ?? ""}`,
        title,
        date,
        startTime,
        venueName: String(venue?.name ?? ""),
        city: String(venue?.city?.name ?? ""),
        region: venue?.state?.stateCode ?? venue?.state?.name ?? undefined,
        latitude: num(venue?.location?.latitude),
        longitude: num(venue?.location?.longitude),
        image: bestTicketmasterImage(event?.images),
        festivalId: festivalId ?? inferFestivalId(title, date, artistNames.length),
        stage: undefined,
        isHeadliner: false,
        artistNames: artistNames.length ? artistNames : [title],
        artistJambaseIds: artistIds.length === attractions.length && artistIds.length > 0
          ? artistIds
          : undefined,
        jambaseUrl: typeof event?.url === "string" ? event.url : undefined,
        // Non-schema hint used by the artist enricher; stripped before insert.
        _genres: ticketmasterGenres(event),
      };
    })
    .filter((event) => event.jambaseId !== "tm:" && event.title && event.date);
}

// ---------------------------------------------------------------------------
// Setlist.fm API  (GET /rest/1.0/search/setlists)
// Docs: https://api.setlist.fm/docs/1.0/index.html
// Historical shows AND the songs played — the part JamBase upsells.
// ---------------------------------------------------------------------------

// setlist.fm dates are "dd-MM-yyyy"; the rest of Showtonic is ISO "yyyy-MM-dd".
function setlistDateToIso(value) {
  const m = String(value ?? "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

// Flatten sets -> songs into a single ordered list (handy for the "log a set"
// flow; JamBase does not give you this without the setlist add-on).
function setlistSongs(setlist) {
  const sets = Array.isArray(setlist?.sets?.set) ? setlist.sets.set : [];
  return sets.flatMap((set) =>
    (Array.isArray(set?.song) ? set.song : [])
      .map((song) => song?.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
}

function normalizeSetlistFmSetlists(payload) {
  const setlists = Array.isArray(payload?.setlist) ? payload.setlist : [];

  return setlists
    .map((setlist) => {
      const artistName = setlist?.artist?.name;
      const mbid = setlist?.artist?.mbid;
      const venue = setlist?.venue ?? {};
      const city = venue?.city ?? {};
      const coords = city?.coords ?? {};
      const date = setlistDateToIso(setlist?.eventDate);
      const songs = setlistSongs(setlist);

      return {
        jambaseId: `slfm:${setlist?.id ?? ""}`,
        title: typeof artistName === "string" ? artistName : "",
        date,
        startTime: undefined,
        venueName: String(venue?.name ?? ""),
        city: String(city?.name ?? ""),
        region: city?.stateCode ?? city?.state ?? undefined,
        latitude: num(coords?.lat),
        longitude: num(coords?.long),
        image: undefined,
        festivalId: undefined,
        stage: typeof setlist?.tour?.name === "string" ? setlist.tour.name : undefined,
        isHeadliner: false,
        artistNames: typeof artistName === "string" && artistName ? [artistName] : [],
        artistJambaseIds: typeof mbid === "string" && mbid ? [`mbid:${mbid}`] : undefined,
        jambaseUrl: typeof setlist?.url === "string" ? setlist.url : undefined,
        _songs: songs,
      };
    })
    .filter((event) => event.jambaseId !== "slfm:" && event.title && event.date);
}

// ---------------------------------------------------------------------------
// Bandsintown  (GET https://rest.bandsintown.com/artists/{name}/events)
// Per-artist future tour dates — catches non-Ticketmaster inventory (clubs,
// DICE/AXS). Opt-in: their terms restrict commercial redistribution.
// ---------------------------------------------------------------------------

function normalizeBandsintownEvents(payload, fallbackArtist) {
  const events = Array.isArray(payload) ? payload : [];

  return events
    .map((event) => {
      const venue = event?.venue ?? {};
      const lineup = Array.isArray(event?.lineup)
        ? event.lineup.filter((name) => typeof name === "string" && name.length > 0)
        : [];
      const artistNames = lineup.length
        ? lineup
        : fallbackArtist
          ? [fallbackArtist]
          : [];
      const datetime = String(event?.datetime ?? "");
      const date = datetime.slice(0, 10);
      const timeMatch = datetime.match(/T(\d{2}:\d{2})/);
      const offerUrl = Array.isArray(event?.offers)
        ? event.offers.find((offer) => typeof offer?.url === "string" && offer.url)?.url
        : undefined;
      const title = String(event?.title || artistNames[0] || "");

      return {
        jambaseId: `bit:${event?.id ?? ""}`,
        title,
        date,
        startTime: timeMatch ? timeMatch[1] : undefined,
        venueName: String(venue?.name ?? ""),
        city: String(venue?.city ?? ""),
        region: venue?.region || undefined,
        latitude: num(venue?.latitude),
        longitude: num(venue?.longitude),
        image: undefined,
        festivalId: inferFestivalId(title, date, artistNames.length),
        stage: undefined,
        isHeadliner: false,
        artistNames,
        artistJambaseIds: undefined,
        jambaseUrl: offerUrl ?? (typeof event?.url === "string" ? event.url : undefined),
      };
    })
    .filter((event) => event.jambaseId !== "bit:" && event.title && event.date);
}

// ---------------------------------------------------------------------------
// Artist enrichment shaping (Spotify + MusicBrainz responses are fetched in the
// action; these helpers keep the field-picking pure and testable).
// ---------------------------------------------------------------------------

function spotifyArtistFields(searchPayload) {
  const artist = searchPayload?.artists?.items?.[0];
  if (!artist) return {};
  const image = Array.isArray(artist.images) && artist.images[0]?.url ? artist.images[0].url : undefined;
  const genres = Array.isArray(artist.genres) ? artist.genres.slice(0, 5) : [];
  return {
    spotifyId: typeof artist.id === "string" ? artist.id : undefined,
    image,
    genres,
    spotifyUrl: artist?.external_urls?.spotify,
  };
}

function musicbrainzArtistFields(searchPayload) {
  const artist = searchPayload?.artists?.[0];
  if (!artist) return {};
  const tags = Array.isArray(artist.tags)
    ? artist.tags
        .slice()
        .sort((a, b) => (b?.count ?? 0) - (a?.count ?? 0))
        .map((t) => t?.name)
        .filter(Boolean)
        .slice(0, 5)
    : [];
  return {
    mbid: typeof artist.id === "string" ? artist.id : undefined,
    hometown: typeof artist?.area?.name === "string" ? artist.area.name : undefined,
    genres: tags,
  };
}

// ---------------------------------------------------------------------------
// Genre inference from venue/title context — last-resort fallback for artists
// no API knows anything about. A Public Works listing is not a Davies Symphony
// Hall listing: the room and the show title carry a genre signal even when
// Spotify and MusicBrainz have never heard of the act (local support acts,
// DJs, community-hall bookings). Pure + keyword-based, so it is honest about
// being a heuristic, not a confirmed tag.
//
// PRECISION OVER COVERAGE. Only rooms whose programming is near-monogenre are
// listed: a symphony hall only books classical, a dance club only books DJs.
// Broad rooms (the Fillmore, the Warfield, arenas, most indie clubs) are
// deliberately absent — they book everything, so "played the Fillmore" carries
// no genre information and tagging it rock/pop is padding, not data. When an
// artist's rooms disagree with each other, that is itself evidence the venue
// signal is meaningless for them, and nothing is inferred.
// ---------------------------------------------------------------------------

// `family` groups genres that describe the same kind of night, so conflicting
// evidence can be detected. Two families firing = the context is uninformative.
const VENUE_GENRE_HINTS = [
  {
    family: "classical",
    pattern: /symphony|opera house|philharmonic|conservatory|orchestra hall|davies\b/i,
    genres: ["classical"],
  },
  {
    family: "jazz",
    pattern: /\bjazz\b|sfjazz|keystone korner|mr\.? tipple|black cat sf/i,
    genres: ["jazz"],
  },
  {
    family: "electronic",
    pattern: /public works|1015 folsom|halcyon|monarch|f8\b|great northern|the endup|temple nightclub|audio sf/i,
    genres: ["electronic", "dance"],
  },
  { family: "comedy", pattern: /punch line|cobb'?s comedy|comedy club/i, genres: ["comedy"] },
];

const TITLE_GENRE_HINTS = [
  {
    family: "electronic",
    pattern: /\bdj\b|\brave\b|house music|\btechno\b|\bedm\b|drum\s*(and|&)\s*bass|dubstep/i,
    genres: ["electronic"],
  },
  {
    family: "classical",
    pattern: /orchestra|symphony|philharmonic|classical|string quartet/i,
    genres: ["classical"],
  },
  { family: "jazz", pattern: /\bjazz\b/i, genres: ["jazz"] },
  { family: "loud", pattern: /\bmetal\b|hardcore|\bpunk\b/i, genres: ["metal"] },
  { family: "hiphop", pattern: /hip.?hop|\brap\b/i, genres: ["hip hop"] },
  { family: "country", pattern: /\bcountry\b/i, genres: ["country"] },
  { family: "comedy", pattern: /comedy/i, genres: ["comedy"] },
  { family: "blues", pattern: /\bblues\b/i, genres: ["blues"] },
];

// Returns the matching hints, or [] when they span more than one family —
// conflicting evidence means the signal is not trustworthy for this artist.
function agreeingGenreHints(hints, texts) {
  const text = texts.filter(Boolean).join(" \n ");
  if (!text) return [];
  const matched = hints.filter((hint) => hint.pattern.test(text));
  const families = new Set(matched.map((hint) => hint.family));
  if (families.size !== 1) return [];
  return matched.flatMap((hint) => hint.genres);
}

// venueNames / titles are the raw strings pulled off the artist's shows. The
// room is the stronger signal (a monogenre room's identity is sticky), so a
// confident venue read wins outright and titles are only consulted when the
// rooms say nothing.
function inferGenresFromContext({ venueNames = [], titles = [] } = {}) {
  const fromVenues = agreeingGenreHints(VENUE_GENRE_HINTS, venueNames);
  if (fromVenues.length) return [...new Set(fromVenues)].slice(0, 5);
  return [...new Set(agreeingGenreHints(TITLE_GENRE_HINTS, titles))].slice(0, 5);
}

// Strip the non-schema `_genres` / `_songs` hints before handing events to the
// `importUpcoming` mutation (its validator rejects unknown keys).
function toImportEvents(events) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return events.map(({ _genres, _songs, ...event }) => event);
}

export {
  slug,
  inferFestivalId,
  bestTicketmasterImage,
  ticketmasterGenres,
  normalizeTicketmasterEvents,
  setlistDateToIso,
  setlistSongs,
  normalizeSetlistFmSetlists,
  normalizeBandsintownEvents,
  spotifyArtistFields,
  musicbrainzArtistFields,
  inferGenresFromContext,
  toImportEvents,
};
