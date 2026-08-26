// Receipt copy (designs 23–24): your history with an artist or venue, written
// the way the exports phrase it. Pure so it stays testable.

const ORDINALS = ["", "most-visited", "second most-visited", "third most-visited"];

function formatShortDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

// { showCount, firstSeenYear?, averageRating? } → design 23's receipt line.
function describeArtistHistory(history, artistName) {
  if (!history || !history.showCount) return "";
  const parts = [];
  if (history.firstSeenYear) {
    parts.push(`You first saw ${artistName} in ${history.firstSeenYear}.`);
  } else {
    parts.push(`You've seen ${artistName} ${history.showCount === 1 ? "once" : `${history.showCount} times`}.`);
  }
  if (history.averageRating) {
    parts.push(`Your average rating is ${history.averageRating.toFixed(1)}.`);
  }
  return parts.join(" ");
}

// { showCount, rank, lastSeen: {artistName, date} } → design 24's receipt line.
function describeVenueHistory(history) {
  if (!history || !history.showCount) return "";
  const rankLabel =
    history.rank && history.rank <= 3
      ? `Your ${ORDINALS[history.rank]} venue.`
      : `${history.showCount} ${history.showCount === 1 ? "night" : "nights"} in this room.`;
  const lastSeen = history.lastSeen
    ? ` Last seen: ${history.lastSeen.artistName} · ${formatShortDate(history.lastSeen.date)}.`
    : "";
  return `${rankLabel}${lastSeen}`;
}

export { describeArtistHistory, describeVenueHistory };
