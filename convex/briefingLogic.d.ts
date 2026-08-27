import type { AgentActivityItem, AgentFind, TasteBelief } from "../app/briefing";

export type BriefingLog = {
  showId?: string;
  showTitle?: string;
  showDate?: string;
  artistNames?: readonly string[];
  artistGenres?: readonly string[];
  venueName?: string;
  rating?: number;
  source?: "live" | "backfill" | "reclaim" | "morning_after";
  createdAt?: number;
};

export type BriefingShow = {
  showId: string;
  title: string;
  date: string;
  venueName: string;
  city: string;
  image?: string;
  /** Local start time, used to tell one event from two in the same room. */
  startTime?: string;
  artistNames?: readonly string[];
  genres?: readonly string[];
};

export type PeerGoing = { handle: string; matchPercent: number };

export type TasteInputs = {
  logs?: readonly BriefingLog[];
  followedArtistNames?: readonly string[];
  /** Shows already logged or already on the member's calendar. */
  excludeShowIds?: readonly string[];
  peersGoing?: Record<string, readonly PeerGoing[]>;
  /** Per-show genre lists the rarity weighting is measured against. */
  catalogGenres?: readonly (readonly string[])[];
  today?: string;
  limit?: number;
};

/** Empty under `LOW_SIGNAL_SHOWS` logged nights, and never returns an unexplained find. */
export function scoreFinds(shows: readonly BriefingShow[], taste?: TasteInputs): AgentFind[];

/** Two to four beliefs, each carrying the arithmetic that produced it. */
export function narrateBeliefs(
  logs?: readonly BriefingLog[],
  shows?: readonly BriefingShow[],
): TasteBelief[];

export type BriefingCandidate = {
  clusterDate?: string;
  showTitle?: string;
  venueName?: string;
  photoCount?: number;
  confidence?: number;
  evidence?: readonly { kind?: string; detail?: string; delta?: number }[];
  status?: string;
  createdAt?: number;
};

export type BriefingSquadPlan = {
  userIds?: readonly string[];
  showTitle?: string;
  showDate?: string;
  settlement?: string;
  createdAt?: number;
  transcript?: readonly { agent: string; handle: string; message: string; at: number }[];
};

/** Newest first, capped at 10. A refusal without a stated reason is dropped, not shown bare. */
export function deriveActivity(
  candidates?: readonly BriefingCandidate[],
  squadPlans?: readonly BriefingSquadPlan[],
  logs?: readonly BriefingLog[],
  options?: { limit?: number; userId?: string },
): AgentActivityItem[];

export type BeliefFeedback = {
  statement: string;
  verdict: "right" | "wrong";
  /** The basis sentence as it read when they corrected it. */
  basisAtTime?: string;
};

/** Suppresses corrected beliefs until their evidence genuinely changes; pins confirmed ones. */
export function applyBeliefFeedback(
  beliefs?: readonly TasteBelief[],
  feedback?: readonly BeliefFeedback[],
  options?: { limit?: number },
): TasteBelief[];
