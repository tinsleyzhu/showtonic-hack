export type NormalizedFreeEvent = {
  jambaseId: string;
  title: string;
  date: string;
  startTime?: string;
  venueName: string;
  city: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  image?: string;
  festivalId?: string;
  stage?: string;
  isHeadliner: boolean;
  artistNames: string[];
  artistJambaseIds?: string[];
  jambaseUrl?: string;
  /** Non-schema hints, stripped by toImportEvents before insertion. */
  _genres?: string[];
  _songs?: string[];
};

export type ImportEvent = Omit<NormalizedFreeEvent, "_genres" | "_songs">;

export type SpotifyArtistFields = {
  spotifyId?: string;
  image?: string;
  genres?: string[];
  spotifyUrl?: string;
};

export type MusicbrainzArtistFields = {
  mbid?: string;
  hometown?: string;
  genres?: string[];
};

export function slug(value: unknown): string;
export function inferFestivalId(
  title: unknown,
  date: unknown,
  artistCount: number,
): string | undefined;
export function bestTicketmasterImage(images: unknown): string | undefined;
export function ticketmasterGenres(event: unknown): string[];
export function normalizeTicketmasterEvents(
  payload: unknown,
  festivalId?: string,
): NormalizedFreeEvent[];
export function setlistDateToIso(value: unknown): string;
export function setlistSongs(setlist: unknown): string[];
export function normalizeSetlistFmSetlists(payload: unknown): NormalizedFreeEvent[];
export function normalizeBandsintownEvents(
  payload: unknown,
  fallbackArtist?: string,
): NormalizedFreeEvent[];
export function spotifyArtistFields(searchPayload: unknown): SpotifyArtistFields;
export function musicbrainzArtistFields(searchPayload: unknown): MusicbrainzArtistFields;
export function toImportEvents(events: NormalizedFreeEvent[]): ImportEvent[];

/**
 * Last-resort genre guess for artists no API knows, keyed off the rooms they
 * play and the titles they play under. A Public Works listing is not a Davies
 * Symphony Hall listing, and that signal is free.
 */
export function inferGenresFromContext(context?: {
  venueNames?: readonly string[];
  titles?: readonly string[];
}): string[];

/**
 * True when an artist's stored genres look like they were written by the
 * low-precision venue tags dropped in 6ea0240 — explainable entirely by a
 * dropped hint, backed by a room that hint matched, and not reproduced by the
 * current stricter rules. Used by `artists.clearInferredGenres`.
 */
export function looksLikeDroppedVenueInference(context?: {
  genres?: readonly string[];
  venueNames?: readonly string[];
  titles?: readonly string[];
}): boolean;
