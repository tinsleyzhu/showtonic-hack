import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  CREDITS_PER_ADVANCED_SEARCH,
  buildFestivalQueries,
  buildGapQueries,
  canonicalVenue,
  estimateSweepCredits,
  nearestVenues,
  eachNightInRange,
  festivalSlug,
  nightsMissingFromCatalog,
  proposeFestivalDay,
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

// Every venue's name and city, with coordinates where they exist. Wider than
// `locatedVenues`, which filters to rows the anchoring can use: approval needs
// the rooms that have no coordinates too, or it mints a twin for each of them.
export const namedVenues = query({
  args: {},
  handler: async (ctx) => {
    const venues = await ctx.db.query("venues").collect();
    return venues.map((venue) => ({
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
    festivalId: v.optional(v.string()),
    title: v.optional(v.string()),
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
    // A festival day is identified by its festival, not by its bill: re-running
    // a sweep after the lineup page gained one act must update one claim about
    // that day, never stack a second one beside it.
    const duplicate = args.festivalId
      ? sameNight.find((row) => row.festivalId === args.festivalId)
      : sameNight.find(
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
      festivalId: args.festivalId,
      title: args.title,
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

    // A festival day is one row keyed by the festival and the date, so the
    // bill can change without the day becoming a second show.
    const jambaseId = proposal.festivalId
      ? `gap:fest:${proposal.festivalId}:${proposal.clusterDate}`
      : `gap:${proposal.clusterDate}:${proposal.artistNames
          .join("-")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}`;

    // The proposal carries the venue name its SOURCE used. Writing that name
    // straight through is how an agent that fills the catalog starts polluting
    // it: "Midway San Francisco" beside "The Midway" is one room and two rows,
    // and every later match has to pick. Resolve to the catalog's own name
    // first; when nothing matches, insert what the source said rather than
    // guessing, because a wrong merge moves a show into a room it was not in.
    const venues = await ctx.runQuery(api.catalogGap.namedVenues, {});
    const existingVenue = proposal.venueName
      ? canonicalVenue(proposal.venueName, proposal.city, venues)
      : null;

    await ctx.runMutation(api.shows.importUpcoming, {
      events: [
        {
          jambaseId,
          // A festival day is titled by the day, not by an artist — nobody
          // remembers Saturday as six separate sets.
          title: proposal.title ?? proposal.artistNames.join(" + "),
          festivalId: proposal.festivalId,
          date: proposal.clusterDate,
          venueName: existingVenue?.name ?? proposal.venueName ?? "Unknown venue",
          city: existingVenue?.city ?? proposal.city ?? "San Francisco",
          latitude: existingVenue?.latitude,
          longitude: existingVenue?.longitude,
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

// --- Festivals --------------------------------------------------------------
//
// The other hole in the catalog, and a differently shaped one. A venue night is
// one bill; a festival is sixty acts across three days, and the mistake to
// avoid is not an invented artist — every name on a lineup page is real — it is
// a real act filed under the wrong day.
//
// So the unit here is a festival DAY. One proposal per day, carrying that day's
// bill, titled by the day, keyed by `festivalId`. That is the row SPEC.md's
// "a festival is one thing, not sixty" asks the catalog for, which is why
// recovering lineups now does not have to be undone when the model lands.

// Two searches per day: the lineup, and the set-times pages that publish bills
// day by day. Their results are POOLED before scoring — two searches that each
// find one publisher are exactly the corroboration the per-act bar wants, and
// scoring them separately would throw it away.
const MAX_QUERIES_PER_FESTIVAL_DAY = 2;

// No festival runs longer, and a typo in a date should not cost sixty searches.
const MAX_FESTIVAL_DAYS = 14;

export const searchFestivalDay = action({
  args: {
    festivalName: v.string(),
    date: v.string(),
    city: v.optional(v.string()),
    venueName: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    date: string;
    festivalName: string;
    proposed: boolean;
    proposalId?: Id<"catalogProposals">;
    title?: string;
    artistNames?: string[];
    sourceUrl?: string;
    confidence?: number;
    heldBack?: number;
    declineReason?: string;
    creditsSpent: number;
  }> => {
    const queries = buildFestivalQueries({
      festivalName: args.festivalName,
      city: args.city ?? null,
      date: args.date,
    }).slice(0, MAX_QUERIES_PER_FESTIVAL_DAY);

    if (!queries.length) {
      return {
        date: args.date,
        festivalName: args.festivalName,
        proposed: false,
        declineReason: "a festival needs a name and a valid date",
        creditsSpent: 0,
      };
    }
    if (args.dryRun) {
      return {
        date: args.date,
        festivalName: args.festivalName,
        proposed: false,
        declineReason: `dry run — would search: ${queries.map((row) => row.query).join(" | ")}`,
        creditsSpent: 0,
      };
    }
    if (!process.env.TAVILY_API_KEY) {
      return {
        date: args.date,
        festivalName: args.festivalName,
        proposed: false,
        declineReason: "TAVILY_API_KEY is not set",
        creditsSpent: 0,
      };
    }

    const results: TavilyResult[] = [];
    let creditsSpent = 0;
    for (const { query } of queries) {
      try {
        const outcome = await tavilySearch(query, args.date);
        creditsSpent += outcome.credits;
        results.push(...outcome.results);
      } catch (error) {
        // One failed query still leaves the other one's evidence usable.
        if (!results.length && query === queries[queries.length - 1].query) {
          return {
            date: args.date,
            festivalName: args.festivalName,
            proposed: false,
            declineReason: error instanceof Error ? error.message : "search failed",
            creditsSpent,
          };
        }
      }
    }

    const { proposal, declineReason, uncorroborated } = proposeFestivalDay(
      {
        festivalName: args.festivalName,
        date: args.date,
        city: args.city ?? null,
        venueName: args.venueName ?? null,
      },
      results,
    );
    if (!proposal) {
      return {
        date: args.date,
        festivalName: args.festivalName,
        proposed: false,
        declineReason: declineReason ?? "no result cleared the bar",
        creditsSpent,
      };
    }

    // No requestedByUserId, exactly as with a history sweep: this claims that a
    // day of a festival had a bill, never that anybody was standing in it.
    const saved = await ctx.runMutation(api.catalogGap.record, {
      clusterDate: proposal.clusterDate,
      venueName: proposal.venueName ?? undefined,
      city: proposal.city ?? undefined,
      festivalId: proposal.festivalId,
      title: proposal.title,
      artistNames: proposal.artistNames,
      sourceUrl: proposal.sourceUrl,
      sourceTitle: proposal.sourceTitle,
      corroboratingUrls: proposal.corroboratingUrls,
      confidence: proposal.confidence,
      evidence: proposal.evidence,
    });

    return {
      date: args.date,
      festivalName: args.festivalName,
      proposed: saved.created,
      proposalId: saved.proposalId,
      title: proposal.title,
      artistNames: proposal.artistNames,
      sourceUrl: proposal.sourceUrl,
      confidence: proposal.confidence,
      heldBack: uncorroborated,
      declineReason: saved.created ? undefined : `already proposed (${saved.status})`,
      creditsSpent,
    };
  },
});

// Dates this festival already has rows on, so a sweep fills holes and never
// second-guesses a lineup that came from a first-party source.
export const festivalShowDates = query({
  args: { festivalId: v.string() },
  handler: async (ctx, args) => {
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_festival", (q) => q.eq("festivalId", args.festivalId))
      .collect();
    return [...new Set(shows.map((show) => show.date))];
  },
});

export const sweepFestival = action({
  args: {
    festivalName: v.string(),
    from: v.string(),
    to: v.string(),
    city: v.optional(v.string()),
    venueName: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    festivalName: string;
    festivalId: string;
    range: { from: string; to: string };
    daysInRange: number;
    alreadyInCatalog: number;
    daysWalked: number;
    proposed: number;
    declined: number;
    creditsSpent: number;
    estimatedCredits: number;
    bills: { date: string; title: string; acts: number; sourceUrl: string; confidence: number }[];
    declines: { date: string; reason: string }[];
    collisions: { name: string; dates: string[] }[];
    dryRun: boolean;
    note: string;
  }> => {
    const festivalId = festivalSlug(args.festivalName, args.from);
    const days = eachNightInRange(args.from, args.to).slice(0, MAX_FESTIVAL_DAYS);
    const known: string[] = await ctx.runQuery(api.catalogGap.festivalShowDates, { festivalId });
    const walking = days.filter((day) => !known.includes(day));
    const estimatedCredits = estimateSweepCredits(walking.length, MAX_QUERIES_PER_FESTIVAL_DAY);

    const base = {
      festivalName: args.festivalName,
      festivalId,
      range: { from: args.from, to: args.to },
      daysInRange: days.length,
      alreadyInCatalog: known.length,
      estimatedCredits,
    };
    if (args.dryRun || !process.env.TAVILY_API_KEY) {
      return {
        ...base,
        daysWalked: 0,
        proposed: 0,
        declined: 0,
        creditsSpent: 0,
        bills: [],
        declines: [],
        collisions: [],
        dryRun: Boolean(args.dryRun),
        note: args.dryRun
          ? `Would search ${walking.length} days for about ${estimatedCredits} Tavily credits.`
          : "TAVILY_API_KEY is not set — nothing searched.",
      };
    }

    const bills: { date: string; title: string; acts: number; sourceUrl: string; confidence: number }[] = [];
    const declines: { date: string; reason: string }[] = [];
    const seen = new Map<string, string[]>();
    let creditsSpent = 0;
    let walked = 0;

    for (const date of walking) {
      if (walked) await new Promise((resolve) => setTimeout(resolve, SWEEP_PAUSE_MS));
      walked += 1;
      let outcome;
      try {
        outcome = await ctx.runAction(api.catalogGap.searchFestivalDay, {
          festivalName: args.festivalName,
          date,
          city: args.city,
          venueName: args.venueName,
        });
      } catch (error) {
        declines.push({ date, reason: error instanceof Error ? error.message : "search failed" });
        continue;
      }
      creditsSpent += outcome.creditsSpent;
      if (outcome.proposed && outcome.artistNames && outcome.sourceUrl) {
        bills.push({
          date,
          title: outcome.title ?? args.festivalName,
          acts: outcome.artistNames.length,
          sourceUrl: outcome.sourceUrl,
          confidence: outcome.confidence ?? 0,
        });
        for (const name of outcome.artistNames) {
          const key = name.toLowerCase();
          seen.set(key, [...(seen.get(key) ?? []), date]);
        }
      } else {
        declines.push({ date, reason: outcome.declineReason ?? "declined" });
      }
    }

    // An act on two days of one festival is the failure this whole path is
    // shaped to avoid, so the sweep reports it rather than leaving a human to
    // notice. It is visible without any answer key.
    const collisions = [...seen.entries()]
      .filter(([, dates]) => dates.length > 1)
      .map(([name, dates]) => ({ name, dates }));

    return {
      ...base,
      daysWalked: walked,
      proposed: bills.length,
      declined: declines.length,
      creditsSpent,
      bills,
      declines,
      collisions,
      dryRun: false,
      note:
        "One proposal per festival DAY, carrying that day's bill. Every one is pending and claims " +
        "only that the day happened — approving it creates a single festival-day show, not sixty.",
    };
  },
});
