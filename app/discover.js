// Discover logic (designs 13–14): reason strings and date presets.
// Rule (FEATURES §4): every recommendation carries a reason — no black boxes.

// show: { artistNames?, city?, goingCount?, loggedCount?, rating?, ratingCount? }
// context: { shelf?: string, favoriteArtists?: string[], followedArtistNames?: string[], homeCity?: string }
function reasonForShow(show, context = {}) {
  const favorites = new Set((context.favoriteArtists ?? []).map((name) => name.toLowerCase()));
  const followed = new Set((context.followedArtistNames ?? []).map((name) => name.toLowerCase()));
  const artistNames = show.artistNames ?? [];

  if (context.shelf === "watchlist") return "From your watchlist";

  const followedMatch = artistNames.find((name) => followed.has(name.toLowerCase()));
  if (followedMatch) return `Because you follow ${followedMatch}`;

  const tasteMatch = artistNames.find((name) => favorites.has(name.toLowerCase()));
  if (tasteMatch) return `Because you picked ${tasteMatch}`;

  const activity = (show.goingCount ?? 0) + (show.loggedCount ?? 0);
  if (context.shelf === "popular" || context.shelf === "trending") {
    return activity > 0
      ? `${activity} showgoer${activity === 1 ? "" : "s"} active`
      : "Trending near you";
  }
  if (context.shelf === "weekend") {
    return show.city ? `This weekend in ${show.city}` : "This weekend";
  }
  if (context.shelf === "nearby") {
    return show.city ? `Near you in ${show.city}` : "Near you";
  }
  if ((show.ratingCount ?? 0) > 0 && (show.rating ?? 0) >= 4) {
    return `Rated ${show.rating?.toFixed(1)} by verified fans`;
  }
  if (activity > 0) return `${activity} showgoer${activity === 1 ? "" : "s"} active`;
  return "";
}

// Date presets (design 14): Tonight · This weekend · Custom.
// Weekend = the coming Friday through Sunday; mid-weekend, from today.
function dateRangeForPreset(preset, todayIso) {
  if (preset === "tonight") return { from: todayIso, to: todayIso };
  if (preset === "weekend") {
    const today = new Date(`${todayIso}T12:00:00`);
    const day = today.getDay(); // 0 Sun … 6 Sat
    const daysToFriday = day === 0 ? -2 : 5 - day; // Sun counts as the tail of this weekend
    const friday = new Date(today);
    friday.setDate(friday.getDate() + Math.max(daysToFriday, 0));
    const sunday = new Date(friday);
    sunday.setDate(sunday.getDate() + (day === 0 ? 0 : day === 6 ? 1 : 2));
    const iso = (date) => date.toISOString().slice(0, 10);
    const from = day === 6 || day === 0 ? todayIso : iso(friday);
    return { from, to: iso(sunday) };
  }
  return { from: "", to: "" }; // custom: caller supplies its own bounds
}

// One card per festival (spec A.4): every show sharing a festivalId collapses
// to a single card — the festival's name (day-row weekday suffix stripped),
// the union of its bills, and a date range spanning the run. The card keeps a
// real show id (the earliest festival-day row when the catalog has one, the
// biggest-bill row otherwise) so the card opens the entity page the diary
// links to. Non-festival shows pass through unchanged. Pure and
// deterministic: same input, byte-for-byte same output.
const DAY_TITLE_SUFFIX = /\s+—\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

export function festivalDisplayName(title) {
  return String(title ?? "").replace(DAY_TITLE_SUFFIX, "");
}

function byEarliestDate(left, right) {
  return (
    left.date.localeCompare(right.date) || String(left.id).localeCompare(String(right.id))
  );
}

function festivalCard(members) {
  // Day rows are the festival's own entity — the card links to the earliest
  // one. Legacy festivals (never collapsed) fall back to their earliest row.
  const pool = members.filter((show) => show.isFestivalDay);
  const representative = [...(pool.length ? pool : members)].sort(byEarliestDate)[0];
  const dates = members.map((show) => show.date).sort();
  const seen = new Set();
  const bill = [];
  // Walk members in date order so the union bill does not depend on the
  // catalog's row order — within a day, headliner order is preserved.
  for (const member of [...members].sort(byEarliestDate)) {
    for (const name of member.artistNames ?? []) {
      const key = String(name).trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      bill.push(String(name));
    }
  }
  const start = dates[0];
  const end = dates[dates.length - 1];
  return {
    ...representative,
    title: festivalDisplayName(representative.title),
    artistNames: bill,
    dateRange: start === end ? undefined : { start, end },
  };
}

export function collapseFestivalShows(shows) {
  const festivals = new Map();
  for (const show of shows) {
    if (!show.festivalId) continue;
    const members = festivals.get(show.festivalId);
    if (members) members.push(show);
    else festivals.set(show.festivalId, [show]);
  }
  const collapsed = new Map();
  for (const show of shows) {
    const members = show.festivalId ? festivals.get(show.festivalId) : undefined;
    const card = members ? festivalCard(members) : show;
    collapsed.set(String(card.id), card);
  }
  return [...collapsed.values()];
}

export { dateRangeForPreset, reasonForShow };
