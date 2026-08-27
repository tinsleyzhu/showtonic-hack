// Which artists to offer a member during onboarding.
//
// The first version weighted by city (home ×4, elsewhere ×1) and did not
// filter. Weighting is the right tool for ranking people WITHIN a city and the
// wrong tool for deciding whether to show someone at all, and the catalog made
// that concrete: the New York Philharmonic has 234 upcoming New York shows and
// zero in San Francisco. 234 × 1 beats any 4× multiplier an SF artist could
// earn — they would need 59 upcoming SF shows — so the orchestra topped the
// list for San Franciscans permanently, as an artist they could not go and see
// if they wanted to.
//
// So: when we know the member's city, PRESENCE is a gate, not a bonus. Rank
// the survivors afterwards. When we do not know it, fall back to the global
// ranking — that is the honest degraded state, not a broken one.

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * @param entries one per artist:
 *   { name, image?, genres?, homeCityShows, otherCityShows }
 *   where `homeCityShows` counts upcoming shows in the member's city.
 * @param options `homeCity` empty means the member skipped the step.
 */
export function rankOnboardingArtists(entries, options = {}) {
  const { homeCity = "", limit = 18 } = options;
  const scoped = normalize(homeCity).length > 0;

  return entries
    // The gate. An artist with nothing upcoming in your city is not a weak
    // suggestion, it is a wrong one.
    .filter((entry) => (scoped ? entry.homeCityShows > 0 : true))
    .map((entry) => ({
      ...entry,
      // Once everyone left is reachable, rank by how present they are: in your
      // city if we know it, in the catalog at large if we do not.
      rank: scoped ? entry.homeCityShows : entry.homeCityShows + entry.otherCityShows,
    }))
    .sort((left, right) => right.rank - left.rank || left.name.localeCompare(right.name))
    .slice(0, Math.max(1, Math.min(limit, 48)));
}
