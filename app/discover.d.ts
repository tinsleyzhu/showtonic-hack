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

// One card per festival. Generic over the show type so callers keep their
// full shape (Show) — the card is the representative row with the festival
// name, the union bill, and the run's date range folded in.
export function festivalDisplayName(title: string | undefined): string;

export function collapseFestivalShows<
  T extends {
    id: unknown;
    title: string;
    date: string;
    artistNames?: readonly string[];
    festivalId?: string;
    isFestivalDay?: boolean;
    dateRange?: { start: string; end: string };
  },
>(shows: readonly T[]): T[];
