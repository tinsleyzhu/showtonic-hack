import type { RecapFormat, RecapShape } from "./recapCanvas";

export type ReclaimNight = {
  clusterDate: string;
  artistNames?: readonly string[];
  showTitle?: string;
};

export type ReclaimStory =
  | { empty: true; nights: 0; handle: string }
  | {
      empty: false;
      handle: string;
      nights: number;
      oldest: string;
      oldestLabel: string;
      names: string[];
      headline: string;
      shareText: string;
    };

export function monthYear(date: string): string;

export function buildReclaimStory(
  nights: readonly ReclaimNight[],
  options?: { handle?: string },
): ReclaimStory;

export function reclaimFilename(handle: string, format: RecapFormat): string;

export function drawReclaim(
  ctx: CanvasRenderingContext2D,
  options: { story: Extract<ReclaimStory, { empty: false }>; format?: RecapFormat },
): RecapShape;
