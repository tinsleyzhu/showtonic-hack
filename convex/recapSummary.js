// Recap — turning a diary into something a person actually wants to post.
//
// Pure and dependency-free on purpose: the Convex query (`convex/recap.ts`),
// the agent tool (`generate_recap`) and the share card all read the SAME
// summary, so an agent-generated recap and a tapped-a-button recap can never
// disagree about how many shows someone went to.
//
// The voice is not invented here. `describeReclaimSpan` already decided how
// this product talks about a stretch of years ("Four years of nights, back in
// one place."), so the span copy is derived from that one function rather than
// duplicated into a second word list that would drift the first time someone
// edited one of them.

import { describeReclaimSpan } from "./backfillMatch.js";

// Same low-N promise the rest of the app keeps: under five logged shows we do
// not imply a pattern (see `agents.tasteProfile`, `LOW_N_THRESHOLD` in the UI).
const LOW_SIGNAL_SHOWS = 5;

function tally(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => ({ name, count }));
}

// "Four years of nights, back in one place." -> "four years of nights".
// Derived, never re-typed — one source for the phrase, two lengths of it.
function spanPhrase(dates) {
  const sentence = describeReclaimSpan(dates.map((date) => ({ clusterDate: date })));
  if (!sentence) return "";
  return sentence.replace(/,.*$/, "").toLowerCase();
}

// The one night worth putting a name to. Highest rating wins; ties break to the
// most recent, then to the title, so the same diary always produces the same
// recap — a share card that reshuffles on reload reads as broken.
function pickHighestRated(rows) {
  const rated = rows.filter((log) => Number(log.rating) > 0);
  if (!rated.length) return null;
  const best = [...rated].sort(
    (left, right) =>
      right.rating - left.rating ||
      String(right.showDate).localeCompare(String(left.showDate)) ||
      String(left.showTitle).localeCompare(String(right.showTitle)),
  )[0];
  return {
    showId: best.showId ?? null,
    title: best.showTitle ?? "",
    artistNames: best.artistNames ?? [],
    venueName: best.venueName ?? null,
    date: best.showDate ?? "",
    rating: best.rating,
    image: best.showImage ?? null,
  };
}

function buildRecap(logs, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 10));
  const rows = (Array.isArray(logs) ? logs : []).filter(
    (log) => log && typeof log.showDate === "string" && log.showDate,
  );

  // Empty-room rule: nothing logged, nothing claimed. The caller renders no
  // card at all rather than a recap of zero nights.
  if (!rows.length) {
    return {
      empty: true,
      lowSignal: true,
      shows: 0,
      artists: 0,
      venues: 0,
      cities: 0,
      reclaimed: 0,
      firstDate: null,
      lastDate: null,
      years: 0,
      spanLine: "",
      spanPhrase: "",
      headline: "No nights logged yet",
      topArtists: [],
      topVenues: [],
      topGenres: [],
      highestRated: null,
      averageRating: null,
      shareText: "",
    };
  }

  const dates = rows.map((log) => log.showDate).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const years = Number(lastDate.slice(0, 4)) - Number(firstDate.slice(0, 4)) + 1;

  const topArtists = tally(rows.flatMap((log) => log.artistNames ?? [])).slice(0, limit);
  const topVenues = tally(rows.map((log) => log.venueName ?? "")).slice(0, limit);
  const topGenres = tally(rows.flatMap((log) => log.artistGenres ?? [])).slice(0, limit);
  const rated = rows.filter((log) => Number(log.rating) > 0);
  const lowSignal = rows.length < LOW_SIGNAL_SHOWS;

  const distinctArtists = new Set(rows.flatMap((log) => log.artistNames ?? [])).size;
  const distinctVenues = new Set(rows.map((log) => log.venueName ?? "").filter(Boolean)).size;
  const distinctCities = new Set(rows.map((log) => log.city ?? "").filter(Boolean)).size;
  // Nights that came back from a camera roll rather than being typed in. This
  // is the number that makes the recap a story about the product and not just
  // a leaderboard, so it travels with the summary.
  const reclaimed = rows.filter(
    (log) => log.source === "reclaim" || log.source === "backfill",
  ).length;

  const headline = `${rows.length} ${rows.length === 1 ? "show" : "shows"} and counting`;
  const phrase = spanPhrase(dates);
  const highestRated = pickHighestRated(rows);

  return {
    empty: false,
    lowSignal,
    shows: rows.length,
    artists: distinctArtists,
    venues: distinctVenues,
    cities: distinctCities,
    reclaimed,
    firstDate,
    lastDate,
    years,
    spanLine: describeReclaimSpan(dates.map((date) => ({ clusterDate: date }))),
    spanPhrase: phrase,
    headline,
    topArtists,
    topVenues,
    topGenres,
    highestRated,
    // Averages stay hidden under five rated shows, same as everywhere else.
    averageRating:
      rated.length >= LOW_SIGNAL_SHOWS
        ? Number((rated.reduce((sum, log) => sum + log.rating, 0) / rated.length).toFixed(2))
        : null,
    shareText: composeShareText({
      shows: rows.length,
      spanPhrase: phrase,
      topArtists,
      topVenues,
      highestRated,
    }),
  };
}

// The offline caption. `recap.caption` will try AIsa for something with more
// personality, but this is what ships when there is no key, no credit, or no
// network — a caption that is always there beats one that sometimes is.
function composeShareText(summary) {
  const parts = [];
  parts.push(
    summary.spanPhrase
      ? `${summary.shows} ${summary.shows === 1 ? "show" : "shows"} — ${summary.spanPhrase}.`
      : `${summary.shows} ${summary.shows === 1 ? "show" : "shows"} and counting.`,
  );
  const artist = summary.topArtists[0];
  if (artist) {
    parts.push(
      artist.count > 1
        ? `${artist.name} ${artist.count} times.`
        : `Starting with ${artist.name}.`,
    );
  }
  const venue = summary.topVenues[0];
  if (venue && venue.count > 1) parts.push(`Mostly at ${venue.name}.`);
  if (summary.highestRated && summary.highestRated.rating >= 4.5) {
    parts.push(`Best night: ${summary.highestRated.title}.`);
  }
  return parts.join(" ");
}

export { buildRecap, composeShareText, LOW_SIGNAL_SHOWS, spanPhrase, tally };
