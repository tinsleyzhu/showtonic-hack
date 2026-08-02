export type NormalizedUpcomingEvent = {
  jambaseId: string;
  title: string;
  date: string;
  venueName: string;
  city: string;
  region?: string;
  image?: string;
  festivalId?: string;
  stage?: string;
  isHeadliner: boolean;
  artistNames: string[];
  jambaseUrl?: string;
};

export function extractPrimaryUrl(ctas: unknown): string | undefined;
export function normalizeUpcomingEvents(
  payload: unknown,
  festivalId?: string,
): NormalizedUpcomingEvent[];
export function validateJamBaseSourceUrl(sourceUrl: string): string;
