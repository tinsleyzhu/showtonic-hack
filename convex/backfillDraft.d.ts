export type BackfillDraft = {
  caption: string;
  vibes: string[];
};

// The slice of a candidate row the draft may speak about: the evidence fields
// (venue, date, capture window, photo count) and the show's genres. The pure
// module accepts anything looser — callers pass what they have.
export type DraftShowInput = {
  venueName?: string | null;
  genres?: readonly string[] | null;
} | null;

export type DraftInput = {
  clusterDate?: string | null;
  photoCount?: number | null;
  captureWindow?: string | null;
  show?: DraftShowInput;
};

// A draft a client already wrote, with any fields it left unset.
export type PartialDraft = {
  caption?: string | null;
  vibes?: string[] | null;
} | null;

export const VIBE_CHIP_GENRES: readonly { vibe: string; genres: readonly string[] }[];
export const MAX_SUGGESTED_VIBES: number;

export function writeDraft(candidate?: DraftInput): BackfillDraft;
export function completeDraft(provided?: PartialDraft, computed?: BackfillDraft | null): BackfillDraft;
