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

/** True for recurring event formats the feeds file as artists (karaoke, open mic, a secret-concert series). */
export function isEventNotAnArtist(name: string): boolean;

/** One entry per casefolded name, counts summed, the row with a picture kept. */
export function mergeArtistDuplicates<T extends OnboardingArtistEntry>(entries: readonly T[]): T[];
