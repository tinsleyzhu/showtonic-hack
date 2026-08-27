import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  CREDITS_PER_ADVANCED_SEARCH,
  buildGapQueries,
  estimateSweepCredits,
  nearestVenues,
  nightsMissingFromCatalog,
  proposeFromResults,
} from "./catalogGapUtils.js";

// Catalog-gap agent — the I/O half. All judgement lives in
// `catalogGapUtils.js`; this file only fetches, stores, and refuses.
//
// The premise: `reclaim_camera_roll` already returns every night the catalog
// could not explain. Until now nothing consumed that queue. Here it becomes a
// search: anchor on the venue the photos were near, ask Tavily what played
// there that night, and write a PROPOSAL — a claim with a URL attached, which a
// human turns into a show or throws away.
//
// The side effect is the point (SPEC.md 1b): every unmatched night that gets
// approved grows the catalog for everyone who comes after.

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const RESULTS_PER_QUERY = 8;

// One night is worth at most this many searches. The gap queue is unbounded —
// a four-year camera roll can produce dozens of unexplained nights — and an
// agent that quietly spends a thousand API calls on someone's holiday photos is
// a bug even when every call succeeds.
const MAX_QUERIES_PER_NIGHT = 2;
const MAX_NIGHTS_PER_RUN = 8;

type TavilyResult = { title?: string; url?: string; content?: string };

type TavilyResponse = { results: TavilyResult[]; credits: number };

async function tavilySearch(query: string, clusterDate: string): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Missing TAVILY_API_KEY environment variable");

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: RESULTS_PER_QUERY,
      // Tavily can bound results by publication window. A listing for the night
      // in question is almost never published a year later, and narrowing here
      // is cheaper than rejecting the same wrong-year pages in the parser.
      start_date: shiftDate(clusterDate, -400),
      end_date: shiftDate(clusterDate, 30),
      // Credits are finite, event-coded, and expire with the event. A batch job
      // that cannot say what it spent is not one anybody should approve twice.
      include_usage: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Tavily search failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const payload = (await response.json()) as {
    results?: TavilyResult[];
    usage?: { credits?: number };
  };
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    credits: payload.usage?.credits ?? CREDITS_PER_ADVANCED_SEARCH,
  };
}

function shiftDate(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// Venues carrying coordinates, which is all the anchoring needs. Small enough
// to hand to an action whole (255 rows today) and it saves a round trip per
// night in a batch run.
export const locatedVenues = query({
  args: {},
  handler: async (ctx) => {
    const venues = await ctx.db.query("venues").collect();
    return venues
      .filter((venue) => venue.latitude !== undefined && venue.longitude !== undefined)
      .map((venue) => ({
        id: venue._id,
        name: venue.name,
        city: venue.city,
        latitude: venue.latitude,
        longitude: venue.longitude,
      }));
  },
});

export const get = query({
  args: { proposalId: v.id("catalogProposals") },
  handler: async (ctx, args) => ctx.db.get(args.proposalId),
});

export const pending = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("catalogProposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return rows
      .sort((left, right) => right.confidence - left.confidence || right.createdAt - left.createdAt)
      .slice(0, args.limit ?? 50);
  },
});

// Idempotent by (night, lineup): re-running the agent over the same camera roll
// must not stack duplicate claims about one night.
export const record = mutation({
  args: {
    clusterDate: v.string(),
    venueName: v.optional(v.string()),
    city: v.optional(v.string()),
    artistNames: v.array(v.string()),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    corroboratingUrls: v.optional(v.array(v.string())),
    confidence: v.number(),
    evidence: v.optional(
      v.array(v.object({ kind: v.string(), detail: v.string(), delta: v.number() })),
    ),
    requestedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const sameNight = await ctx.db
      .query("catalogProposals")
      .withIndex("by_date", (q) => q.eq("clusterDate", args.clusterDate))
      .collect();
    const key = args.artistNames.map((name) => name.toLowerCase()).sort().join("|");
    const duplicate = sameNight.find(
      (row) => row.artistNames.map((name) => name.toLowerCase()).sort().join("|") === key,
    );
    if (duplicate) {
      // A rejected proposal stays rejected. A human already said no to this
      // exact claim; the agent does not get to ask again.
      return { proposalId: duplicate._id, status: duplicate.status, created: false };
    }

    const proposalId = await ctx.db.insert("catalogProposals", {
      clusterDate: args.clusterDate,
      venueName: args.venueName,
      city: args.city,
      artistNames: args.artistNames,
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceTitle,
      corroboratingUrls: args.corroboratingUrls,
      confidence: args.confidence,
      evidence: args.evidence,
      proposedBy: "catalog-gap-agent",
      requestedByUserId: args.requestedByUserId,
      status: "pending",
      createdAt: Date.now(),
    });
    return { proposalId, status: "pending" as const, created: true };
  },
});

export const reject = mutation({
  args: { proposalId: v.id("catalogProposals") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.proposalId);
    if (!row) throw new Error("Proposal not found");
    if (row.status !== "pending") return { status: row.status };
    await ctx.db.patch(args.proposalId, { status: "rejected" });
    return { status: "rejected" as const };
  },
});

export const markApproved = mutation({
  args: { proposalId: v.id("catalogProposals"), jambaseId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.proposalId);
    if (!row) throw new Error("Proposal not found");
    const show = await ctx.db
      .query("shows")
      .withIndex("by_jambase", (q) => q.eq("jambaseId", args.jambaseId))
      .unique();
    if (!show) throw new Error("Approved proposal did not produce a show");
    await ctx.db.patch(args.proposalId, { status: "approved", showId: show._id });
    return { status: "approved" as const, showId: show._id };
  },
});

// Approval is an action because it writes through `shows.importUpcoming` — the
// same sink JamBase and the free-data plane use, so an agent-proposed show is
// indistinguishable in shape from an imported one and every downstream reader
// (search, matcher, diary) works on it unchanged. Only its id says where it
// came from: `gap:` namespaced, like `tm:` and `slfm:`, so a catalog reconcile
// never mistakes it for a JamBase row it should delete.
export const approve = action({
  args: { proposalId: v.id("catalogProposals") },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ status: "approved"; showId: Id<"shows"> }> => {
    const proposal: Doc<"catalogProposals"> | null = await ctx.runQuery(api.catalogGap.get, {
      proposalId: args.proposalId,
    });
    if (!proposal) throw new Error("Proposal not found");
    if (proposal.status !== "pending") throw new Error(`Proposal is already ${proposal.status}`);

    const jambaseId = `gap:${proposal.clusterDate}:${proposal.artistNames
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")}`;

    await ctx.runMutation(api.shows.importUpcoming, {
      events: [
        {
          jambaseId,
          title: proposal.artistNames.join(" + "),
          date: proposal.clusterDate,
          venueName: proposal.venueName ?? "Unknown venue",
          city: proposal.city ?? "San Francisco",
          isHeadliner: true,
          artistNames: proposal.artistNames,
          // The source URL rides along as the show's outbound link: a show that
          // exists because a web page said so should say which page.
          jambaseUrl: proposal.sourceUrl,
        },
      ],
    });

    return ctx.runMutation(api.catalogGap.markApproved, { proposalId: args.proposalId, jambaseId });
  },
});

// The consumer the gap queue never had.
//
// `nights` is exactly what `reclaim_camera_roll` returns as `unmatchedNights`,
// plus the cluster's median coordinates where the photos had any. Coordinates
// are used to pick a venue name and are never stored: what lands in the table
// is a venue name and a URL.
export const search = action({
  args: {
    nights: v.array(
      v.object({
        clusterDate: v.string(),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        city: v.optional(v.string()),
      }),
    ),
    requestedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx: ActionCtx, args) => {
    // No key is a no-op, not a crash. The gap agent is an enhancement to
    // reclaim; a missing credential must never take the flagship tool down.
    if (!process.env.TAVILY_API_KEY) {
      return { searched: 0, proposed: 0, declined: [], skipped: "TAVILY_API_KEY is not set" };
    }

    const venues = await ctx.runQuery(api.catalogGap.locatedVenues, {});
    const nights = args.nights.slice(0, MAX_NIGHTS_PER_RUN);
    const proposed: Array<{ clusterDate: string; artistNames: string[]; sourceUrl: string }> = [];
    const declined: Array<{ clusterDate: string; reason: string }> = [];
    let searched = 0;

    for (const night of nights) {
      const gps =
        night.latitude !== undefined && night.longitude !== undefined
          ? { latitude: night.latitude, longitude: night.longitude }
          : null;
      const anchors = nearestVenues(gps, venues);
      const queries = buildGapQueries({
        clusterDate: night.clusterDate,
        city: night.city ?? anchors[0]?.city ?? null,
        venues: anchors,
      }).slice(0, MAX_QUERIES_PER_NIGHT);

      if (!queries.length) {
        declined.push({ clusterDate: night.clusterDate, reason: "no venue or city to search on" });
        continue;
      }

      let placed = false;
      let lastReason = "no result cleared the bar";
      for (const { query, anchorVenue } of queries) {
        let results: TavilyResult[];
        try {
          ({ results } = await tavilySearch(query, night.clusterDate));
        } catch (error) {
          // One night's failed search must not abort the rest of the queue.
          lastReason = error instanceof Error ? error.message : "search failed";
          continue;
        }
        searched += 1;

        const { proposal, declineReason } = proposeFromResults(
          {
            clusterDate: night.clusterDate,
            city: night.city ?? anchors[0]?.city ?? null,
            anchorVenue,
          },
          results,
        );
        if (!proposal) {
          lastReason = declineReason ?? lastReason;
          continue;
        }

        const saved = await ctx.runMutation(api.catalogGap.record, {
          clusterDate: proposal.clusterDate,
          venueName: proposal.venueName ?? undefined,
          city: proposal.city ?? undefined,
          artistNames: proposal.artistNames,
          sourceUrl: proposal.sourceUrl,
          sourceTitle: proposal.sourceTitle,
          corroboratingUrls: proposal.corroboratingUrls,
          confidence: proposal.confidence,
          evidence: proposal.evidence,
          requestedByUserId: args.requestedByUserId,
        });
        if (saved.created) {
          proposed.push({
            clusterDate: proposal.clusterDate,
            artistNames: proposal.artistNames,
            sourceUrl: proposal.sourceUrl,
          });
        }
        placed = true;
        break; // the first anchor that explains the night is enough
      }

      if (!placed) declined.push({ clusterDate: night.clusterDate, reason: lastReason });
    }

    return {
      searched,
      proposed: proposed.length,
      proposals: proposed,
      declined,
      note: "Proposals are claims with a source URL, not catalog entries. Approve one to turn it into a show.",
    };
  },
});

// --- History sweeps ---------------------------------------------------------
//
// Everything above is triggered by a person's photos. Everything below is
// triggered by a hole in the catalog.
//
// Why this exists: backfill matches against PAST shows, Ticketmaster sells no
// past events, and Setlist.fm needs a key we do not have. So the catalog has
// almost no history, and the same search that explains one unmatched night can
// walk a venue's calendar backwards.
//
// The claim changes and the bar does not. A reclaim proposal says "you were
// probably here" and the human judges it next to their own photos. A history
// proposal says only "this show probably happened" — and nobody is looking at
// it with any context at all. A fabricated past show just becomes catalog, and
// then other people's photos match against it. So the evidence gate is
// unchanged, and an ambiguous night is left empty.

// Dates this venue already has shows on, so a sweep fills holes and never
// second-guesses a row that came from a first-party source.
export const venueShowDates = query({
  args: { venueName: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_date", (q) => q.gte("date", args.from).lte("date", args.to))
      .collect();
    const wanted = args.venueName.trim().toLowerCase();
    return shows
      .filter((show) => (show.venueName ?? "").trim().toLowerCase() === wanted)
      .map((show) => show.date);
  },
});

// One (venue, night) pair, on demand. The building block — and the thing to
// call when you want to check the agent's judgement on a night you know.
export const searchNight = action({
  args: {
    venueName: v.string(),
    city: v.optional(v.string()),
    date: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    date: string;
    venueName: string;
    proposed: boolean;
    proposalId?: Id<"catalogProposals">;
    artistNames?: string[];
    sourceUrl?: string;
    confidence?: number;
    declineReason?: string;
    creditsSpent: number;
    rejected?: { url: string; reason: string }[];
  }> => {
    if (!process.env.TAVILY_API_KEY) {
      return {
        date: args.date,
        venueName: args.venueName,
        proposed: false,
        declineReason: "TAVILY_API_KEY is not set",
        creditsSpent: 0,
      };
    }

    const [{ query }] = buildGapQueries({
      clusterDate: args.date,
      city: args.city ?? null,
      venues: [{ name: args.venueName }],
    });

    // A dry run reports the question and the bill without paying it.
    if (args.dryRun) {
      return {
        date: args.date,
        venueName: args.venueName,
        proposed: false,
        declineReason: `dry run — would search: ${query}`,
        creditsSpent: 0,
      };
    }

    const { results, credits } = await tavilySearch(query, args.date);
    const { proposal, declineReason, rejected } = proposeFromResults(
      { clusterDate: args.date, city: args.city ?? null, anchorVenue: args.venueName },
      results,
    );

    if (!proposal) {
      return {
        date: args.date,
        venueName: args.venueName,
        proposed: false,
        declineReason: declineReason ?? "no result cleared the bar",
        creditsSpent: credits,
        rejected,
      };
    }

    // Note the absent requestedByUserId: a history proposal is attached to no
    // one's night, and claims nothing about attendance.
    const saved = await ctx.runMutation(api.catalogGap.record, {
      clusterDate: proposal.clusterDate,
      venueName: proposal.venueName ?? undefined,
      city: proposal.city ?? undefined,
      artistNames: proposal.artistNames,
      sourceUrl: proposal.sourceUrl,
      sourceTitle: proposal.sourceTitle,
      corroboratingUrls: proposal.corroboratingUrls,
      confidence: proposal.confidence,
      evidence: proposal.evidence,
    });

    return {
      date: args.date,
      venueName: args.venueName,
      proposed: saved.created,
      proposalId: saved.proposalId,
      artistNames: proposal.artistNames,
      sourceUrl: proposal.sourceUrl,
      confidence: proposal.confidence,
      declineReason: saved.created ? undefined : `already proposed (${saved.status})`,
      creditsSpent: credits,
    };
  },
});

// Tavily's free tier is ~2 requests/second. One night at a time with a pause
// between is slower than it could be and cannot get us rate-limited mid-sweep.
const SWEEP_PAUSE_MS = 600;

// The whole budget we have is event-coded and expires with the event, so a
// single sweep may never be able to eat it. The caller can lower this; it
// cannot raise it.
const MAX_SWEEP_NIGHTS = 60;

export const sweepVenueHistory = action({
  args: {
    venueName: v.string(),
    city: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    maxNights: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    venueName: string;
    range: { from: string; to: string };
    nightsInRange: number;
    alreadyInCatalog: number;
    nightsWalked: number;
    nightsSkippedByCap: number;
    proposed: number;
    declined: number;
    creditsSpent: number;
    estimatedCredits: number;
    proposals: { date: string; artistNames: string[]; sourceUrl: string; confidence: number }[];
    declines: { date: string; reason: string }[];
    dryRun: boolean;
    note: string;
  }> => {
    const known: string[] = await ctx.runQuery(api.catalogGap.venueShowDates, {
      venueName: args.venueName,
      from: args.from,
      to: args.to,
    });
    const missing = nightsMissingFromCatalog(args.from, args.to, known);
    const cap = Math.min(args.maxNights ?? MAX_SWEEP_NIGHTS, MAX_SWEEP_NIGHTS);
    const walking = missing.slice(0, cap);
    const estimatedCredits = estimateSweepCredits(walking.length, 1);

    const base = {
      venueName: args.venueName,
      range: { from: args.from, to: args.to },
      nightsInRange: missing.length + known.length,
      alreadyInCatalog: known.length,
      nightsSkippedByCap: missing.length - walking.length,
      estimatedCredits,
    };

    if (args.dryRun) {
      return {
        ...base,
        nightsWalked: 0,
        proposed: 0,
        declined: 0,
        creditsSpent: 0,
        proposals: [],
        declines: [],
        dryRun: true,
        note: `Would search ${walking.length} nights for about ${estimatedCredits} Tavily credits.`,
      };
    }
    if (!process.env.TAVILY_API_KEY) {
      return {
        ...base,
        nightsWalked: 0,
        proposed: 0,
        declined: 0,
        creditsSpent: 0,
        proposals: [],
        declines: [],
        dryRun: false,
        note: "TAVILY_API_KEY is not set — nothing searched.",
      };
    }

    const proposals: { date: string; artistNames: string[]; sourceUrl: string; confidence: number }[] = [];
    const declines: { date: string; reason: string }[] = [];
    let creditsSpent = 0;
    let walked = 0;

    for (const date of walking) {
      if (walked) await new Promise((resolve) => setTimeout(resolve, SWEEP_PAUSE_MS));
      walked += 1;
      let outcome;
      try {
        outcome = await ctx.runAction(api.catalogGap.searchNight, {
          venueName: args.venueName,
          city: args.city,
          date,
        });
      } catch (error) {
        // One bad night must not end the sweep, and it must not be silent.
        declines.push({ date, reason: error instanceof Error ? error.message : "search failed" });
        continue;
      }
      creditsSpent += outcome.creditsSpent;
      if (outcome.proposed && outcome.artistNames && outcome.sourceUrl) {
        proposals.push({
          date,
          artistNames: outcome.artistNames,
          sourceUrl: outcome.sourceUrl,
          confidence: outcome.confidence ?? 0,
        });
      } else {
        declines.push({ date, reason: outcome.declineReason ?? "declined" });
      }
    }

    return {
      ...base,
      nightsWalked: walked,
      proposed: proposals.length,
      declined: declines.length,
      creditsSpent,
      proposals,
      declines,
      dryRun: false,
      note:
        "Every proposal is pending and claims only that the show happened — not that anyone attended it. " +
        "A sweep never auto-approves, however confident.",
    };
  },
});
