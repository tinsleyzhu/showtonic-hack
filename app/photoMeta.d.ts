import type { BackfillPhoto } from "../convex/backfillMatch.d";

export type RollSummary = {
  total: number;
  geotagged: number;
  withoutLocation: number;
};

export function toLocalIso(value: Date): string | null;
export function readPhotoMetadata(file: File): Promise<BackfillPhoto & { takenAt: string | null }>;
export function readCameraRoll(files: FileList | readonly File[] | null): Promise<BackfillPhoto[]>;
export function summarizeRoll(photos: readonly BackfillPhoto[]): RollSummary;
