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
  venues?: readonly VenueAnchor[];
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
export function dateNeedles(isoDate: string): string[];
export function longDate(isoDate: string): string;
export function mentionsDate(isoDate: string, ...texts: (string | undefined)[]): boolean;
export function extractArtistNames(title: string, venueName?: string | null): string[];
export function splitLineup(value: string): string[];
export function hostOf(url: string): string;
export function isTicketingDomain(url: string): boolean;
export function describeProposal(proposal: CatalogProposal | null): string;
export function proposeFromResults(
  gap: GapNight,
  results: readonly SearchResult[] | null | undefined,
  options?: { minConfidence?: number },
): ProposalOutcome;
