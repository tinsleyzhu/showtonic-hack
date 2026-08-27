export type OnboardingArtistEntry = {
  name: string;
  image?: string;
  genres?: readonly string[];
  /** Upcoming shows in the member's home city. */
  homeCityShows: number;
  /** Upcoming shows everywhere else. */
  otherCityShows: number;
};

export function rankOnboardingArtists<T extends OnboardingArtistEntry>(
  entries: readonly T[],
  options?: { homeCity?: string; limit?: number },
): (T & { rank: number })[];
