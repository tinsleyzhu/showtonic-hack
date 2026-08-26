export type {
  BackfillCandidate,
  BackfillPhoto,
  BackfillShow,
  ClusterLocation,
  Evidence,
  EvidenceKind,
  GeoPoint,
  MatchOptions,
  NightCluster,
} from "../convex/backfillMatch.d";

export {
  MIN_CLUSTER_PHOTOS,
  MIN_CONFIDENCE,
  VENUE_NEAR_METERS,
  clusterPhotosIntoNights,
  describeConfidence,
  describeDistance,
  describeReclaimSpan,
  formatCaptureWindow,
  haversineMeters,
  locateCluster,
  matchClustersToShows,
  nightDateOf,
  unmatchedClusters,
} from "../convex/backfillMatch.d";

import type { BackfillPhoto, BackfillShow } from "../convex/backfillMatch.d";

export function extractExifDate(buffer: ArrayBuffer): string | null;
export function buildDemoCameraRoll(
  shows: readonly BackfillShow[],
  options?: { today?: string; limit?: number },
): BackfillPhoto[];
