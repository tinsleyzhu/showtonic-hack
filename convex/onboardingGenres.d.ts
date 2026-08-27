export type OnboardingGenreShow = {
  date?: string;
  city?: string;
  genres?: readonly string[];
};

export type RankedOnboardingGenre = {
  genre: string;
  weight: number;
  family: string;
};

export function rankOnboardingGenres(
  shows: readonly OnboardingGenreShow[],
  options?: {
    homeCity?: string;
    today?: string;
    limit?: number;
    cityWeight?: number;
    perFamily?: number;
    /** One genre array per ARTIST — used to learn subgenre relationships. */
    genreSets?: readonly (readonly string[])[];
    cooccurrenceThreshold?: number;
  },
): RankedOnboardingGenre[];
