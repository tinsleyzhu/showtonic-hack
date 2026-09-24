export type VenueGeoCoverage = {
  total: number;
  geocoded: number;
  missing: number;
  fraction: number;
};

export type ShowGeoCoverage = {
  total: number;
  matchable: number;
  dateOnly: number;
  fraction: number;
};

export type GeoCoverageSummary = {
  venues: VenueGeoCoverage;
  shows: ShowGeoCoverage;
};

export const DATE_ONLY_WARNING_THRESHOLD: number;

// Both coverage readers pass whatever venue shape they hold — the matcher only
// needs latitude/longitude to exist and be trustworthy.
export type GeoVenue = {
  _id?: unknown;
  latitude?: number;
  longitude?: number;
};

export type GeoShow = {
  venueId?: unknown;
  venueLatitude?: number;
  venueLongitude?: number;
  latitude?: number;
  longitude?: number;
};

export function venueGeoCoverage(venues: readonly GeoVenue[]): VenueGeoCoverage;

export function showGeoCoverage(
  shows: readonly GeoShow[],
  venuesById?: ReadonlyMap<unknown, GeoVenue>,
): ShowGeoCoverage;

export function geoCoverageSummary(
  venues: readonly GeoVenue[],
  shows: readonly GeoShow[],
): GeoCoverageSummary;

// The scan's date-only warning sentence, or null when coverage is healthy
// (or the catalog is empty — an empty catalog is never thin).
export function describeGeoSignalWarning(
  venueCoverage: VenueGeoCoverage | null | undefined,
): string | null;

// One-screen report for `scripts/geocode-venues.mjs --report`.
export function formatGeoReport(summary: GeoCoverageSummary | null | undefined): string;
