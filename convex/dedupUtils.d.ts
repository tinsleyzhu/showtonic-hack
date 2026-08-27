export type DedupRow = Record<string, unknown> & { _id: string; _creationTime?: number };

export type MergePlan<Id = string> = {
  key?: string;
  canonicalId: Id;
  duplicateIds: Id[];
  patch: Record<string, unknown>;
};

export type DeduplicationPlan<Id = string> = {
  groupCount: number;
  excessRows: number;
  merges: (MergePlan<Id> & { key: string })[];
};

export function foldText(value: unknown): string;
export function stripLeadingThe(folded: unknown): string;
export function normalizeVenueName(name: unknown): string;
export function normalizeArtistName(name: unknown): string;

/** date | venue | headliner | startTime — start time is what keeps an early and a late set apart. */
export function showKey(show: unknown): string;
export function artistKey(artist: unknown): string;
/** Name and city, so two rooms sharing a name in two towns never merge. */
export function venueKey(venue: unknown): string;

export function isPlaceholderImage(url: unknown): boolean;

export function buildDuplicateGroups<T>(
  rows: readonly T[] | undefined,
  keyFn: (row: T) => string,
): { key: string; members: T[] }[];

export function chooseCanonical<T>(members: readonly T[], scoreFn: (row: T) => number): T;
export function scoreShow(show: unknown): number;
export function scoreArtist(artist: unknown): number;
export function scoreVenue(venue: unknown): number;

export function unionLineup(members: readonly unknown[]): { artistIds: unknown[]; artistNames: unknown[] };

export function planShowMerge<T extends { _id: unknown }>(members: readonly T[]): MergePlan<T["_id"]>;
export function planArtistMerge<T extends { _id: unknown }>(members: readonly T[]): MergePlan<T["_id"]>;
export function planVenueMerge<T extends { _id: unknown }>(members: readonly T[]): MergePlan<T["_id"]>;

export function planDeduplication<T extends { _id: unknown }>(
  rows: readonly T[],
  options: { keyFn: (row: T) => string; mergeFn: (members: T[]) => MergePlan<T["_id"]> },
): DeduplicationPlan<T["_id"]>;

/** Venue-name tokens with sponsor dressing and trailing city suffixes removed. */
export function venueTokens(name: unknown): string[];
export function hasSponsorSuffix(name: unknown): boolean;

/**
 * One room under two names: one token set contains the other, and the
 * contained set is distinctive (not just "hall" or "park"). Directional
 * containment, not overlap — that is what refuses Sofar NoLita vs NoMad.
 */
export function venueNamesAlias(left: unknown, right: unknown): boolean;

/** date | headliner | startTime, with no venue. A candidate set, never a merge key. */
export function showAliasKey(show: unknown): string;

export function clusterByVenueAlias<T extends { venueName?: string }>(
  rows: readonly T[] | undefined,
): T[][];

export function planVenueAliasDeduplication<T extends { _id: unknown }>(
  shows: readonly T[] | undefined,
): {
  groupCount: number;
  excessRows: number;
  untimedAttached: number;
  merges: (MergePlan<T["_id"]> & { key: string })[];
};

export function chooseDisplayVenueName(
  candidates: readonly { name: string; count?: number; fromVenueRow?: boolean }[] | undefined,
): string;

/** One spelling per room for the denormalized shows.venueName string. */
export function planVenueNameCanonicalization(
  shows: readonly unknown[] | undefined,
  venues: readonly unknown[] | undefined,
): {
  roomCount: number;
  spellingCount: number;
  renames: { key: string; keep: string; replace: string[] }[];
};
