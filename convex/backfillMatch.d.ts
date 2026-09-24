export type GeoPoint = { latitude: number; longitude: number };

export type BackfillPhoto = {
  takenAt: string;
  name?: string;
  latitude?: number;
  longitude?: number;
};

export type ClusterLocation = GeoPoint & { sampleCount: number };

// Where a scan's photos went that never became a cluster. Every count is a
// decision the clusterer used to make silently.
export type SkippedPhotoCounts = {
  unreadableTimestamps: number;
  outsideEveningWindow: number;
  belowClusterMinimum: number;
};

export type NightScan = {
  clusters: NightCluster[];
  skipped: SkippedPhotoCounts;
};

export type NightCluster = {
  clusterDate: string;
  photoCount: number;
  firstTakenAt: string;
  lastTakenAt: string;
  captureWindow: string;
  gps: ClusterLocation | null;
};

export type EvidenceKind = "date" | "gps" | "volume" | "taste" | "venue" | "vision" | "web";

export type Evidence = {
  kind: EvidenceKind;
  detail: string;
  delta: number;
};

export type BackfillShow = {
  id: string;
  date: string;
  title?: string;
  artistNames?: readonly string[];
  venueName?: string;
  venueId?: string;
  venueLatitude?: number;
  venueLongitude?: number;
  city?: string;
  image?: string;
  // Set on every row of a festival; the per-date entity also carries
  // isFestivalDay and its artistNames is the whole day's bill.
  festivalId?: string;
  isFestivalDay?: boolean;
};

export type BackfillCandidate = {
  clusterDate: string;
  photoCount: number;
  captureWindow: string;
  showId: string;
  showTitle?: string;
  artistNames: string[];
  // True when the matched entity is a festival-day row — the accept sheet
  // seeds its lineup multi-select from artistNames in that case.
  isFestivalDay: boolean;
  venueName?: string;
  city?: string;
  image?: string;
  confidence: number;
  evidence: Evidence[];
  distanceMeters: number | null;
};

export type MatchOptions = {
  tasteArtists?: readonly string[];
  visitedVenueIds?: readonly string[];
  today?: string;
  venueRadiusMeters?: number;
  // 0 reproduces v1, which had no ambiguity guard. Only the eval sets this.
  ambiguityMargin?: number;
};

export const AMBIGUITY_MARGIN: number;
export const MIN_CLUSTER_PHOTOS: number;
export const MIN_CONFIDENCE: number;
export const VENUE_NEAR_METERS: number;
export const VENUE_NEARBY_METERS: number;
export const VENUE_FAR_METERS: number;
export const DELTA_DATE: number;
export const DELTA_GPS_NEAR: number;
export const DELTA_GPS_NEARBY: number;
export const DELTA_GPS_FAR: number;
export const HEAVY_DOCUMENTATION_PHOTOS: number;

export function haversineMeters(from: GeoPoint | null, to: GeoPoint | null): number | null;
export function describeDistance(meters: number): string;
export function locateCluster(photos: readonly BackfillPhoto[]): ClusterLocation | null;
export function nightDateOf(takenAt: string): string | null;
export function hasTimezoneDesignator(takenAt: string): boolean;
export function captureLocalWallClock(takenAt: string): string | null;
export function formatCaptureWindow(firstIso: string, lastIso: string): string;
export function clusterPhotosIntoNights(photos: readonly BackfillPhoto[]): NightScan;
export function matchClustersToShows(
  clusters: readonly NightCluster[],
  shows: readonly BackfillShow[],
  options?: MatchOptions,
): BackfillCandidate[];
export function collapseFestivalDays(sameNight: readonly BackfillShow[]): BackfillShow[];
export function unmatchedClusters(
  clusters: readonly NightCluster[],
  candidates: readonly BackfillCandidate[],
): NightCluster[];
export function describeConfidence(confidence: number): string;
export function describeReclaimSpan(candidates: readonly { clusterDate: string }[]): string;

// A coordinate the matcher would trust — finite, in range, not Null Island.
// isFiniteCoordinate stays internal; coverage reporting (convex/geoCoverage.js)
// asks the matcher what "geo-located" means through venueLocationOf, which is
// the predicate it actually scores with.
export type VenueLocationSource = {
  latitude?: number;
  longitude?: number;
  venueLatitude?: number;
  venueLongitude?: number;
};

// The show's venue position, if any — reads the scan shape
// (venueLatitude/venueLongitude) and venue rows (latitude/longitude) alike.
export function venueLocationOf(show: VenueLocationSource | null | undefined): GeoPoint | null;
