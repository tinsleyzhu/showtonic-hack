// A festival row as the collapse planner reads it: the fields of a `shows`
// row the plan touches, with venue coordinates resolved by the caller.
export type FestivalShowRow = {
  id: string;
  jambaseId: string;
  title: string;
  date: string;
  festivalId: string;
  isFestivalDay?: boolean;
  nonMatchable?: boolean;
  isHeadliner?: boolean;
  startTime?: string;
  artistNames?: string[];
  venueName: string;
  city: string;
  venueLatitude?: number;
  venueLongitude?: number;
};

// An event for `shows.importUpcoming` — the festival-day row to insert.
export type FestivalDayEvent = {
  jambaseId: string;
  title: string;
  date: string;
  festivalId: string;
  isFestivalDay: true;
  venueName: string;
  city: string;
  latitude?: number;
  longitude?: number;
  isHeadliner: true;
  artistNames: string[];
};

export type FestivalDayReport = {
  festivalId: string;
  festivalName: string;
  date: string;
  title: string;
  jambaseId: string;
  dayRowExisted: boolean;
  acts: number;
  demoted: number;
  alreadyDemoted: number;
};

export type FestivalDayPlan = {
  dayRows: FestivalDayEvent[];
  demotions: string[];
  days: FestivalDayReport[];
  festivalCount: number;
};

/** The one-per-date festival entity: flagged rows and gap-agent keys. */
export function isFestivalDayRow(show: unknown): boolean;
/** Slug to display name: "outside-lands-2026" → "Outside Lands 2026". */
export function festivalDisplayName(festivalId: unknown): string;
/** The day's bill: every act in canonical row order, once. */
export function dayBill(perSetRows: readonly FestivalShowRow[]): string[];
/** The room most of the day's sets name; ties prefer located venues. */
export function dayVenue(
  perSetRows: readonly FestivalShowRow[],
): { venueName: string; city: null; latitude?: number; longitude?: number } | null;
/** The winning venue's city, then any row's. */
export function dayCity(perSetRows: readonly FestivalShowRow[], venueName?: string): string;

/** Plan the writes that collapse legacy festivals into festival-day rows. */
export function planFestivalDayCollapse(
  shows: readonly FestivalShowRow[] | undefined,
  options?: { festivalId?: string },
): FestivalDayPlan;
