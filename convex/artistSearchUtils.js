// Web-search artist identification — the last resort, after Ticketmaster
// classifications and MusicBrainz have both missed.
//
// This is a LOOSER question than the catalog-gap agent's. That agent asks
// "what happened at this venue on this date", which is constrained and has a
// citable answer. This asks "who is this artist", where a bare name like
// "Slayr", "Otha" or "Traps PS" will return confident, plausible pages about
// entirely different entities. So the bar is deliberately higher:
//
//   1. ANCHOR the query with what we already know — the room and the city.
//      A bare name is the worst possible query.
//   2. Only read a result that actually mentions the artist by name.
//   3. CORROBORATE: a genre needs two independent domains before it is written.
//   4. Prefer writing NOTHING over writing a plausible wrong genre. A wrong
//      genre feeds taste matching, which feeds recommendations, and a member
//      gets told they like something they do not.
//
// Every function here is pure so the judgement can be tested without spending
// a credit. The action in artistSearch.ts only fetches, counts, and writes.

// Genres we are willing to learn from prose. A closed vocabulary is the point:
// it keeps a stray adjective on a review page from becoming a tag, and it
// keeps the written values in the same shape as the Ticketmaster and
// Spotify/MusicBrainz tags already in the table (lowercase, no punctuation).
const SEARCH_GENRE_VOCABULARY = [
  "rock",
  "indie rock",
  "punk",
  "post-punk",
  "hardcore",
  "metal",
  "pop",
  "synth-pop",
  "hyperpop",
  "indie pop",
  "electronic",
  "techno",
  "house",
  "deep house",
  "drum and bass",
  "dubstep",
  "trance",
  "ambient",
  "hip hop",
  "rap",
  "trap",
  "grime",
  "r&b",
  "soul",
  "funk",
  "disco",
  "jazz",
  "bebop",
  "jazz fusion",
  "blues",
  "folk",
  "americana",
  "bluegrass",
  "country",
  "classical",
  "opera",
  "reggae",
  "dancehall",
  "afrobeats",
  "latin",
  "salsa",
  "cumbia",
  "reggaeton",
  "k-pop",
  "shoegaze",
  "emo",
  "grunge",
  "garage rock",
  "psychedelic",
  "experimental",
  "noise",
  "singer-songwriter",
];

// Longest first, so "indie rock" is found before "rock" and "jazz fusion"
// before "jazz" — otherwise the broader tag always wins and the specific one
// is never recorded.
const VOCABULARY_BY_LENGTH = [...SEARCH_GENRE_VOCABULARY].sort(
  (left, right) => right.length - left.length,
);

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// The registrable-ish domain, used to decide whether two mentions are
// independent. Two pages on the same site corroborate nothing.
function resultDomain(url) {
  const match = String(url ?? "").match(/^https?:\/\/([^/?#]+)/i);
  if (!match) return "";
  const host = match[1].toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : host;
}

// Anchor the query with the room and the city. Without them "Otha" is a
// surname, a village, and a Swedish pop singer; with "Otha The Independent San
// Francisco" it is one of those.
function buildArtistSearchQuery({ name, venueName, city } = {}) {
  const artist = String(name ?? "").trim();
  if (!artist) return "";
  const anchors = [venueName, city]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
  return [`"${artist}"`, "band OR musician OR DJ genre", ...anchors].join(" ");
}

// A result only counts if it actually names the artist. Tavily happily returns
// topically-adjacent pages, and reading a genre off a page about someone else
// is exactly the failure this whole module exists to avoid.
function mentionsArtist(result, name) {
  const needle = normalizeText(name);
  if (!needle) return false;
  const haystack = `${normalizeText(result?.title)} ${normalizeText(result?.content)}`;
  return haystack.includes(needle);
}

// Genres named in one result. Matching is word-bounded so "poprock" does not
// yield "pop" and "trapdoor" does not yield "trap".
function genresInText(text) {
  const haystack = normalizeText(text);
  const found = [];
  let remaining = haystack;
  for (const genre of VOCABULARY_BY_LENGTH) {
    const escaped = genre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    if (pattern.test(remaining)) {
      found.push(genre);
      // Consume the match so a longer tag's substring is not also counted
      // ("jazz fusion" must not additionally produce "jazz").
      remaining = remaining.replace(new RegExp(escaped, "g"), " ");
    }
  }
  return found;
}

// One entry per (genre, domain) pair, deduped — a site repeating itself across
// three pages is still a single source.
function genreEvidenceFromResults(results, name) {
  const seen = new Set();
  const evidence = [];
  for (const result of Array.isArray(results) ? results : []) {
    if (!mentionsArtist(result, name)) continue;
    const domain = resultDomain(result?.url);
    if (!domain) continue;
    for (const genre of genresInText(`${result?.title ?? ""} ${result?.content ?? ""}`)) {
      const key = `${genre}@${domain}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({ genre, domain, url: result?.url });
    }
  }
  return evidence;
}

// The corroboration gate. A genre is only believed when independent domains
// agree on it; anything less is discarded rather than written at low
// confidence, because there is no confidence field for a consumer to read.
function corroboratedGenres(evidence, { minDomains = 2, maxGenres = 3 } = {}) {
  const domainsByGenre = new Map();
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (!domainsByGenre.has(item.genre)) domainsByGenre.set(item.genre, new Set());
    domainsByGenre.get(item.genre).add(item.domain);
  }
  return [...domainsByGenre.entries()]
    .filter(([, domains]) => domains.size >= minDomains)
    .sort((left, right) => right[1].size - left[1].size || left[0].localeCompare(right[0]))
    .slice(0, maxGenres)
    .map(([genre]) => genre);
}

// The whole decision for one artist, so the caller does no judgement of its
// own. Returns the genres to write (possibly none) plus why, for reporting.
function decideArtistGenres(results, { name, minDomains = 2, maxGenres = 3 } = {}) {
  const evidence = genreEvidenceFromResults(results, name);
  if (evidence.length === 0) {
    return { genres: [], reason: "no result both named the artist and named a genre", evidence };
  }
  const genres = corroboratedGenres(evidence, { minDomains, maxGenres });
  if (genres.length === 0) {
    return {
      genres: [],
      reason: `no genre reached ${minDomains} independent sources`,
      evidence,
    };
  }
  const sources = [
    ...new Set(evidence.filter((item) => genres.includes(item.genre)).map((item) => item.domain)),
  ];
  return { genres, reason: `corroborated by ${sources.join(", ")}`, evidence, sources };
}

export {
  SEARCH_GENRE_VOCABULARY,
  normalizeText,
  resultDomain,
  buildArtistSearchQuery,
  mentionsArtist,
  genresInText,
  genreEvidenceFromResults,
  corroboratedGenres,
  decideArtistGenres,
};
