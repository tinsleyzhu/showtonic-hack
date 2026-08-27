// THE CONTRACT for the concierge redesign. Coordinator-owned: lanes build
// against these types and fixtures but never edit this file — shape-change
// requests go to TEAM.md. See docs/agent-hack/CONCIERGE.md.
//
// L6 renders BRIEFING_FIXTURE until convex/briefing.ts lands; the swap is one
// useQuery flip because the query returns exactly `Briefing`.

export type BriefingEvidence = {
  kind: "venue-history" | "artist-overlap" | "genre-fit" | "friend-going" | "recency";
  detail: string; // human-checkable: "4 nights at this venue rated ≥4★"
  weight: number; // 0..1 contribution, for the Why expansion
};

export type AgentFind = {
  showId: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  venueName: string;
  city: string;
  image?: string;
  score: number; // 0..1 — never rendered without its evidence
  evidence: BriefingEvidence[]; // NO evidence → the find must not exist
};

export type TasteBelief = {
  statement: string; // "You've drifted toward smaller rooms this year"
  basis: string; // "6 of your last 8 nights were under 500 cap"
  strength: "strong" | "forming";
};

export type AgentActivityItem = {
  at: number; // epoch ms
  kind: "reclaimed" | "searched" | "refused" | "squad" | "recap";
  summary: string; // one line, concierge voice, past tense
  detail?: string; // expansion; for "refused", WHY is mandatory
};

export type Briefing = {
  decisionsOwed: number; // pending candidates + open squad invites
  finds: AgentFind[]; // capped at 5 — a concierge recommends, it doesn't paginate
  beliefs: TasteBelief[];
  activity: AgentActivityItem[]; // newest first, capped at 10
};

export const BRIEFING_FIXTURE: Briefing = {
  decisionsOwed: 1,
  finds: [
    {
      showId: "fixture-show-1",
      title: "Mannequin Pussy",
      date: "2026-09-04",
      venueName: "Rickshaw Stop",
      city: "San Francisco",
      score: 0.87,
      evidence: [
        { kind: "venue-history", detail: "4 nights at this venue rated 4★ or higher", weight: 0.4 },
        { kind: "artist-overlap", detail: "Bill overlaps 2 artists you follow", weight: 0.3 },
        { kind: "genre-fit", detail: "Punk is your most-logged genre this year", weight: 0.17 },
      ],
    },
    {
      showId: "fixture-show-2",
      title: "Jamie xx",
      date: "2026-09-12",
      venueName: "The Midway",
      city: "San Francisco",
      score: 0.74,
      evidence: [
        { kind: "genre-fit", detail: "Electronic sits in your top three genres", weight: 0.42 },
        { kind: "friend-going", detail: "1 person with 78% taste overlap is going", weight: 0.32 },
      ],
    },
  ],
  beliefs: [
    {
      statement: "You keep going back to Rickshaw Stop",
      basis: "4 of your logged nights this year were in that room",
      strength: "strong",
    },
    {
      statement: "Saturday is your night",
      basis: "11 of 19 logged shows fell on a Saturday",
      strength: "forming",
    },
  ],
  activity: [
    {
      at: 1756257600000,
      kind: "reclaimed",
      summary: "Rebuilt one night from 9 photos: Witch Whores of Satan at Rickshaw Stop, 95%",
      detail: "Waiting on you in Decisions.",
    },
    {
      at: 1756254000000,
      kind: "refused",
      summary: "Declined to guess your set at Hardly Strictly Bluegrass",
      detail: "40 acts share one field and one date — location evidence can't separate them. I know the night, not the set.",
    },
    {
      at: 1756250400000,
      kind: "searched",
      summary: "Searched the web for one unexplained night; proposed nothing",
      detail: "The two sources disagreed on the date, so no proposal was made.",
    },
  ],
};
