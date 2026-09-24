// The chosen festival lineup, validated against the day's bill, and the
// genres of exactly the chosen acts. Pure helpers; see lineupUtils.js.
export function resolveChosenLineup(
  dayBill: readonly string[],
  chosen: readonly string[],
): string[];
export function genresForLineup(
  artists: ReadonlyArray<{ name?: string; genres?: readonly string[] }>,
  chosenNames: readonly string[],
): string[];
