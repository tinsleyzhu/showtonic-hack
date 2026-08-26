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

export { dateRangeForPreset, reasonForShow };
