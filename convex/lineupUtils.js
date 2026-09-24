// The festival-day lineup: the one fact only the human knows. The matcher can
// place a night at a festival day, but only the person who stood in the field
// knows which acts of the day's bill they actually saw. The confirm sheet
// seeds the multi-select with the full bill and the human subtracts; accept
// then sends exactly the chips left on, and the diary log records those —
// never the unchecked remainder, never an invented act.
//
// Pure like backfillMatch.js and backfillDraft.js: no I/O, byte-for-byte
// deterministic, unit-testable without a backend.

// Case-insensitive act matching, same discipline as festivalDaysUtils.billKey:
// the catalog spells acts differently row to row ("Tyler, The Creator" and
// "Tyler, the Creator" are one artist twice).
function lineupKey(name) {
  return String(name ?? "").trim().toLowerCase();
}

// Validate the human's chosen lineup against the day's bill. Returns the
// chosen act names (trimmed, deduplicated, in the order the human tapped
// them) or throws — an act that is not on the bill is a data error, not a
// silent rewrite of the diary.
//
// A festival accept with nothing chosen is refused here; the UI disables its
// accept button on an empty selection, so hitting this from a client means a
// client bug — and writing a lineup-less festival log would corrupt tasteMath.
export function resolveChosenLineup(dayBill, chosen) {
  if (!Array.isArray(dayBill) || dayBill.length === 0) {
    throw new Error("This night has no lineup to choose from");
  }
  if (!Array.isArray(chosen) || chosen.length === 0) {
    throw new Error("Choose at least one act you saw");
  }
  const bill = new Map();
  for (const name of dayBill) {
    if (typeof name === "string" && name.trim()) bill.set(lineupKey(name), name.trim());
  }
  const seen = new Set();
  const chosenNames = [];
  for (const entry of chosen) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error("Lineup entries must be act names");
    }
    const key = lineupKey(entry);
    if (!bill.has(key)) {
      throw new Error(`"${entry.trim()}" is not on this festival day's bill`);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    chosenNames.push(entry.trim());
  }
  return chosenNames;
}

// The genres of exactly the chosen acts. Without a lineup choice the diary
// keeps every artist's genres; with one, a genre from an act the human did
// not see would mislabel the night in the diary's genre lens.
export function genresForLineup(artists, chosenNames) {
  const keys = new Set((Array.isArray(chosenNames) ? chosenNames : []).map(lineupKey));
  const genres = [];
  const seen = new Set();
  for (const artist of Array.isArray(artists) ? artists : []) {
    if (!keys.has(lineupKey(artist?.name))) continue;
    for (const genre of Array.isArray(artist?.genres) ? artist.genres : []) {
      if (!genre || seen.has(genre)) continue;
      seen.add(genre);
      genres.push(genre);
    }
  }
  return genres;
}
