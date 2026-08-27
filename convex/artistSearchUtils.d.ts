export type SearchResult = { title?: string; url?: string; content?: string };

export type GenreEvidence = { genre: string; domain: string; url?: string };

export type ArtistGenreDecision = {
  genres: string[];
  reason: string;
  evidence: GenreEvidence[];
  sources?: string[];
};

export const SEARCH_GENRE_VOCABULARY: string[];

export function normalizeText(value: unknown): string;

export function resultDomain(url: unknown): string;

/**
 * Anchor an artist lookup with the room and city. A bare name is the worst
 * possible query — it is what makes a wrong, confident answer likely.
 */
export function buildArtistSearchQuery(context?: {
  name?: string;
  venueName?: string;
  city?: string;
}): string;

export function mentionsArtist(result: SearchResult | undefined, name: unknown): boolean;

export function genresInText(text: unknown): string[];

export function genreEvidenceFromResults(
  results: readonly SearchResult[] | undefined,
  name: unknown,
): GenreEvidence[];

/** Genres named by at least `minDomains` independent domains. */
export function corroboratedGenres(
  evidence: readonly GenreEvidence[] | undefined,
  options?: { minDomains?: number; maxGenres?: number },
): string[];

/**
 * The whole decision for one artist: which genres (if any) are corroborated
 * well enough to write, and why. Writing nothing is a normal outcome.
 */
export function decideArtistGenres(
  results: readonly SearchResult[] | undefined,
  options?: { name?: string; minDomains?: number; maxGenres?: number },
): ArtistGenreDecision;

export const MAX_CONSECUTIVE_IDENTIFY_FAILURES: number;

export type IdentifyBatchResult = {
  searched?: number;
  requested?: number;
  identified?: number;
  skipped?: string;
  budgetRemaining?: number;
};

export type IdentifyPlan = {
  done: boolean;
  stop: boolean;
  reason: string;
  delayMs: number | null;
  nextLimit: number;
  failures: number;
  creditsSpent: number;
};

/**
 * Every stop condition for the backlog drain, in one pure place: budget cap,
 * batch cap, empty backlog, and the difference between a batch that finished
 * and one that broke early against a failing endpoint.
 */
export function planNextIdentifyBatch(state?: {
  limit?: number;
  maxCredits?: number;
  creditsSpent?: number;
  batchIndex?: number;
  maxBatches?: number;
  failures?: number;
  last?: IdentifyBatchResult | null;
}): IdentifyPlan;
