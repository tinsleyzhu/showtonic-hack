import type { RecapSummary } from "../convex/recapSummary";

export type RecapFormat = "story" | "square";

export type RecapShape = {
  width: number;
  height: number;
  heroHeight: number;
  label: string;
};

export const RECAP_FORMATS: Record<RecapFormat, RecapShape>;

export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): { sx: number; sy: number; sWidth: number; sHeight: number };

export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines?: number,
): string[];

export function recapFilename(handle: string, format: RecapFormat): string;

export function drawRecap(
  ctx: CanvasRenderingContext2D,
  options: {
    recap: RecapSummary & {
      handle?: string;
      photos?: readonly { url: string | null }[];
      heroImage?: string | null;
    };
    format?: RecapFormat;
    images?: Map<string, CanvasImageSource & { width: number; height: number }>;
  },
): RecapShape;

export function describeShareFailure(error: unknown): {
  fallback: boolean;
  failed: boolean;
  message: string;
};
