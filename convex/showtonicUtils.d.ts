export type RatingLog = { rating: number };

export type SearchableShow = {
  title: string;
  artistNames?: string[];
  venueName?: string;
  city?: string;
};

export function validateLogInput(input: { rating: number; vibes: string[] }): void;
export function summarizeRatings(logs: RatingLog[]): { rating: number; ratingCount: number };
export function normalizeSearchTerm(value: string): string;
export function matchesSearch(show: SearchableShow, query: string): boolean;
export function buildDiscoveryShelves<T>(shows: T[], today?: string): {
  popularThisWeek: T[];
  trendingAmongFriends: T[];
  followedArtists: T[];
  nearby: T[];
  thisWeekend: T[];
  pastYear: T[];
};
