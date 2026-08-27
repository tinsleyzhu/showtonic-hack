import type { Evidence, GeoPoint } from "./backfillMatch";

export type LocatedVenue = {
  id?: string;
  _id?: string;
  name: string;
  city?: string | null;
  latitude?: number;
  longitude?: number;
};

export type VenueAnchor = {
  name: string;
  city: string | null;
  venueId: string | null;
  latitude?: number;
  longitude?: number;
  distanceMeters: number;
};

export type GapNight = {
  clusterDate: string;
  city?: string | null;
  // Only the name is read — a caller that already knows the venue (a history
  // sweep) does not have to invent a distance to pass one in.
  venues?: readonly { name: string }[];
  anchorVenue?: string | null;
};

export type GapQuery = { anchorVenue: string | null; query: string };

export type SearchResult = { title?: string; url?: string; content?: string };

export type CatalogProposal = {
  clusterDate: string;
  venueName: string | null;
  city: string | null;
  artistNames: string[];
  sourceUrl: string;
  sourceTitle: string;
  corroboratingUrls: string[];
  confidence: number;
  evidence: Evidence[];
};

export type ConsideredLineup = {
  artistNames: string[];
  sources: { url: string; title: string }[];
  hosts: string[];
  venueConfirmed: boolean;
  ticketing: boolean;
  evidence: Evidence[];
  confidence: number;
};

export type ProposalOutcome = {
  proposal: CatalogProposal | null;
  considered: ConsideredLineup[];
  rejected: { url: string; reason: string }[];
  declineReason: string | null;
};

export const MIN_PROPOSAL_CONFIDENCE: number;
export const CREDITS_PER_ADVANCED_SEARCH: number;
export const VENUE_ANCHOR_METERS: number;
export const MAX_VENUE_ANCHORS: number;
export const DELTA_DATE_CONFIRMED: number;
export const DELTA_VENUE_CONFIRMED: number;
export const DELTA_TICKETING_DOMAIN: number;
export const DELTA_CORROBORATED: number;
export const DELTA_NO_VENUE_ANCHOR: number;
export const TICKETING_DOMAINS: readonly string[];

export function nearestVenues(
  gps: GeoPoint | null,
  venues: readonly LocatedVenue[],
  options?: { radiusMeters?: number; limit?: number },
): VenueAnchor[];
export function buildGapQueries(gap: GapNight): GapQuery[];
export function eachNightInRange(from: string, to: string): string[];
export function nightsMissingFromCatalog(
  from: string,
  to: string,
  datesWithShows: readonly string[] | null | undefined,
): string[];
export function estimateSweepCredits(nightCount: number, queriesPerNight?: number): number;
export function dateNeedles(isoDate: string): string[];
export function longDate(isoDate: string): string;
export function mentionsDate(isoDate: string, ...texts: (string | undefined)[]): boolean;
export function extractArtistNames(title: string, venueName?: string | null): string[];
export function splitLineup(value: string): string[];
export function hostOf(url: string): string;
export function isTicketingDomain(url: string): boolean;
export function isSocialDomain(url: string): boolean;
export function mentionsVenue(text: string, venueName: string): boolean;
export function canonicalVenue<T extends { name: string; city?: string | null }>(
  candidateName: string,
  candidateCity: string | null | undefined,
  venues: readonly T[] | null | undefined,
): T | null;
export function weekdayDateNeedles(isoDate: string): string[];
export function describeProposal(proposal: CatalogProposal | null): string;
export function proposeFromResults(
  gap: GapNight,
  results: readonly SearchResult[] | null | undefined,
  options?: { minConfidence?: number },
): ProposalOutcome;

// --- Festivals --------------------------------------------------------------

export type FestivalDay = {
  festivalName: string;
  date: string;
  city?: string | null;
  venueName?: string | null;
};

export type FestivalProposal = {
  clusterDate: string;
  festivalId: string;
  festivalName: string;
  title: string;
  venueName: string | null;
  city: string | null;
  artistNames: string[];
  sourceUrl: string;
  sourceTitle: string;
  corroboratingUrls: string[];
  confidence: number;
  evidence: Evidence[];
};

export type FestivalOutcome = {
  proposal: FestivalProposal | null;
  considered: { name: string; hosts: string[]; authoritative: boolean }[];
  rejected: { url: string; reason: string }[];
  // Names seen once, on a source with no authority — held back rather than
  // billed, and reported so a thin bill is distinguishable from a strict gate.
  uncorroborated?: number;
  declineReason: string | null;
};

export const DELTA_FESTIVAL_CONFIRMED: number;
export const MAX_BILL_NAMES: number;
export const MIN_BILL_NAMES: number;

export function buildFestivalQueries(festival: {
  festivalName: string;
  date?: string;
  clusterDate?: string;
  city?: string | null;
}): { query: string }[];
export function festivalSlug(festivalName: string, isoDate: string): string;
export function festivalDayTitle(festivalName: string, isoDate: string): string;
export function weekdayName(isoDate: string): string;
export function mentionsFestival(text: string, festivalName: string): boolean;
export function runOfDatesIncludes(text: string, isoDate: string): boolean;
export function dayLineupSegment(
  content: string,
  isoDate: string,
): { segment: string; headed: boolean } | null;
export function harvestBillNames(
  segment: string,
  context?: { festivalName?: string; venueName?: string | null; city?: string | null },
): string[];
export function looksLikeArtistName(value: string): boolean;
export function isListShaped(segment: string): boolean;
export function isAuthoritativeFestivalSource(url: string, festivalName: string): boolean;
export function proposeFestivalDay(
  festival: FestivalDay,
  results: readonly SearchResult[] | null | undefined,
  options?: { minConfidence?: number },
): FestivalOutcome;
