export type RecapLog = {
  showId?: string;
  showTitle?: string;
  showDate: string;
  showImage?: string | null;
  artistNames?: readonly string[];
  venueName?: string | null;
  city?: string | null;
  artistGenres?: readonly string[];
  rating?: number;
  source?: string;
};

export type RecapTally = { name: string; count: number };

export type RecapHighlight = {
  showId: string | null;
  title: string;
  artistNames: readonly string[];
  venueName: string | null;
  date: string;
  rating: number;
  image: string | null;
};

export type RecapSummary = {
  empty: boolean;
  lowSignal: boolean;
  shows: number;
  artists: number;
  venues: number;
  cities: number;
  reclaimed: number;
  firstDate: string | null;
  lastDate: string | null;
  years: number;
  spanLine: string;
  spanPhrase: string;
  headline: string;
  topArtists: RecapTally[];
  topVenues: RecapTally[];
  topGenres: RecapTally[];
  highestRated: RecapHighlight | null;
  averageRating: number | null;
  shareText: string;
};

export const LOW_SIGNAL_SHOWS: number;

export function buildRecap(
  logs: readonly RecapLog[],
  options?: { limit?: number },
): RecapSummary;

export function composeShareText(summary: {
  shows: number;
  spanPhrase: string;
  topArtists: readonly RecapTally[];
  topVenues: readonly RecapTally[];
  highestRated: RecapHighlight | null;
}): string;

export function spanPhrase(dates: readonly string[]): string;

export function tally(values: readonly (string | null | undefined)[]): RecapTally[];

export const MAX_CAPTION: number;

export function captionPrompt(recap: RecapSummary): string;

export function tidyCaption(text: unknown): string;
