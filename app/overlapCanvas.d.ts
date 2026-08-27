import type { RecapFormat, RecapShape } from "./recapCanvas";

export type OverlapStory =
  | { empty: true }
  | {
      empty: false;
      me: string;
      them: string;
      pair: string;
      percent: number;
      names: string[];
      shows: number;
      headline: string;
      shareText: string;
    };

export function buildOverlapStory(input: {
  mine?: string;
  theirs?: string;
  matchPercent?: number;
  sharedArtists?: readonly ({ name: string } | string)[];
  sharedShowCount?: number;
}): OverlapStory;

export function overlapFilename(theirs: string, format: RecapFormat): string;

export function drawOverlap(
  ctx: CanvasRenderingContext2D,
  options: { story: Extract<OverlapStory, { empty: false }>; format?: RecapFormat },
): RecapShape;
