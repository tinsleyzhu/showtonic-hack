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
  },
): RankedOnboardingGenre[];
