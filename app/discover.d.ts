export type ReasonContext = {
  shelf?: "watchlist" | "popular" | "trending" | "weekend" | "nearby" | "taste" | string;
  favoriteArtists?: readonly string[];
  followedArtistNames?: readonly string[];
  homeCity?: string;
};

export function reasonForShow(
  show: {
    artistNames?: readonly string[];
    city?: string;
    goingCount?: number;
    loggedCount?: number;
    rating?: number;
    ratingCount?: number;
  },
  context?: ReasonContext,
): string;

export function dateRangeForPreset(
  preset: "tonight" | "weekend" | "custom",
  todayIso: string,
): { from: string; to: string };
