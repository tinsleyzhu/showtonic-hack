import { action, mutation, query, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { buildArtistSearchQuery, decideArtistGenres } from "./artistSearchUtils.js";
import type { SearchResult } from "./artistSearchUtils.js";

// Last-resort artist identification by web search, after Ticketmaster
// classifications and MusicBrainz have both missed. All the judgement lives in
// artistSearchUtils.js (pure, tested); this file only fetches, counts, and
// writes. See that module for why the corroboration bar is set where it is.

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const RESULTS_PER_QUERY = 8;

// One search per artist. This lane's whole allowance is 1,500 credits out of a
// shared 8,000 that expire with the event, so a second query per artist would
// halve the number of artists we can reach for a marginal accuracy gain.
const BUDGET_KEY = "tavily:artists";
const DEFAULT_BUDGET = 1500;

async function tavilySearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Missing TAVILY_API_KEY environment variable");

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: RESULTS_PER_QUERY,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Tavily search failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const payload = (await response.json()) as { results?: SearchResult[] };
  return Array.isArray(payload.results) ? payload.results : [];
}

// ---------------------------------------------------------------------------
// Budget — enforced, not advisory. Credits are shared with other lanes and
// expire with the event, so overspending here takes them from someone else.
// ---------------------------------------------------------------------------

export const searchBudgetStatus = query({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const key = args.key ?? BUDGET_KEY;
    const row = await ctx.db
      .query("searchBudget")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const spent = row?.spent ?? 0;
    const limit = row?.limit ?? DEFAULT_BUDGET;
    return { key, spent, limit, remaining: Math.max(0, limit - spent) };
  },
});

// Reserve credits BEFORE spending them. Returning less than requested means
// the budget is nearly gone; returning zero means stop.
export const reserveSearchCredits = mutation({
  args: { key: v.optional(v.string()), count: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const key = args.key ?? BUDGET_KEY;
    const row = await ctx.db
      .query("searchBudget")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const limit = args.limit ?? row?.limit ?? DEFAULT_BUDGET;
    const spent = row?.spent ?? 0;
    const granted = Math.max(0, Math.min(args.count, limit - spent));
    if (granted > 0) {
      if (row) await ctx.db.patch(row._id, { spent: spent + granted, limit, updatedAt: Date.now() });
      else
        await ctx.db.insert("searchBudget", {
          key,
          spent: granted,
          limit,
          updatedAt: Date.now(),
        });
    }
    return { granted, spent: spent + granted, limit, remaining: Math.max(0, limit - spent - granted) };
  },
});

// Hand back credits reserved but not spent, so an early exit does not burn
// budget it never used.
export const refundSearchCredits = mutation({
  args: { key: v.optional(v.string()), count: v.number() },
  handler: async (ctx, args) => {
    const key = args.key ?? BUDGET_KEY;
    const row = await ctx.db
      .query("searchBudget")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row || args.count <= 0) return { refunded: 0 };
    const refunded = Math.min(args.count, row.spent);
    await ctx.db.patch(row._id, { spent: row.spent - refunded, updatedAt: Date.now() });
    return { refunded };
  },
});

// ---------------------------------------------------------------------------
// Targeting — only artists someone can actually go and see.
// ---------------------------------------------------------------------------

// Artists with an UPCOMING show in a covered city and still no genres.
// Enriching an artist nobody can go and see is spent budget for nothing, which
// is the same reasoning behind the upcoming-scoped coverage metric.
export const listUpcomingArtistsNeedingIdentity = query({
  args: {
    limit: v.optional(v.number()),
    city: v.optional(v.string()),
    today: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const today = args.today ?? new Date(Date.now()).toISOString().slice(0, 10);
    const cityNeedle = args.city?.trim().toLowerCase();

    const [artists, shows] = await Promise.all([
      ctx.db.query("artists").collect(),
      ctx.db.query("shows").collect(),
    ]);

    // Best anchor per artist: the soonest upcoming show, whose venue and city
    // are what make the query specific enough to trust.
    const anchor = new Map<string, { date: string; venueName: string; city: string }>();
    const weight = new Map<string, number>();
    for (const show of shows) {
      if (show.date < today) continue;
      if (cityNeedle && show.city.toLowerCase() !== cityNeedle) continue;
      for (const artistId of show.artistIds) {
        weight.set(artistId, (weight.get(artistId) ?? 0) + 1);
        const current = anchor.get(artistId);
        if (!current || show.date < current.date) {
          anchor.set(artistId, { date: show.date, venueName: show.venueName, city: show.city });
        }
      }
    }

    return artists
      .filter((artist) => (artist.genres ?? []).length === 0)
      .filter((artist) => anchor.has(artist._id))
      .sort((left, right) => (weight.get(right._id) ?? 0) - (weight.get(left._id) ?? 0))
      .slice(0, limit)
      .map((artist) => ({
        _id: artist._id,
        name: artist.name,
        venueName: anchor.get(artist._id)!.venueName,
        city: anchor.get(artist._id)!.city,
      }));
  },
});

// Write a searched genre, tagged with its provenance so a later consumer can
// tell it apart from a Spotify tag. Never clobbers existing genres.
export const recordSearchedGenres = mutation({
  args: { artistId: v.id("artists"), genres: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.genres.length === 0) return { patched: false };
    const artist = await ctx.db.get(args.artistId);
    if (!artist || artist.genres.length > 0) return { patched: false };
    await ctx.db.patch(args.artistId, { genres: args.genres, genreSource: "web-search" });
    return { patched: true };
  },
});

// ---------------------------------------------------------------------------
// The action
// ---------------------------------------------------------------------------

type Outcome = {
  name: string;
  venueName: string;
  query: string;
  genres: string[];
  reason: string;
  sources?: string[];
};

export const identifyArtistsWithSearch = action({
  args: {
    limit: v.optional(v.number()),
    city: v.optional(v.string()),
    today: v.optional(v.string()),
    minDomains: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    searched: number;
    identified: number;
    declined: number;
    creditsSpent: number;
    budget: { spent: number; limit: number; remaining: number };
    outcomes: Outcome[];
    skipped?: string;
  }> => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const minDomains = Math.min(Math.max(args.minDomains ?? 2, 1), 5);
    const dryRun = args.dryRun ?? false;

    const candidates = await ctx.runQuery(api.artistSearch.listUpcomingArtistsNeedingIdentity, {
      limit,
      city: args.city,
      today: args.today,
    });

    // A dry run spends nothing: it shows exactly which queries would be issued,
    // which is worth checking before committing metered credits.
    if (dryRun) {
      const budget = await ctx.runQuery(api.artistSearch.searchBudgetStatus, {});
      return {
        searched: 0,
        identified: 0,
        declined: 0,
        creditsSpent: 0,
        budget: { spent: budget.spent, limit: budget.limit, remaining: budget.remaining },
        outcomes: candidates.map((artist) => ({
          name: artist.name,
          venueName: artist.venueName,
          query: buildArtistSearchQuery(artist),
          genres: [],
          reason: "dry run — no search issued",
        })),
      };
    }

    if (!process.env.TAVILY_API_KEY) {
      const budget = await ctx.runQuery(api.artistSearch.searchBudgetStatus, {});
      return {
        searched: 0,
        identified: 0,
        declined: 0,
        creditsSpent: 0,
        budget: { spent: budget.spent, limit: budget.limit, remaining: budget.remaining },
        outcomes: [],
        skipped: "TAVILY_API_KEY is not set",
      };
    }

    // Reserve up front so a crash mid-run cannot leave the budget understated,
    // then refund whatever is unused.
    const reservation = await ctx.runMutation(api.artistSearch.reserveSearchCredits, {
      count: candidates.length,
    });
    if (reservation.granted === 0) {
      return {
        searched: 0,
        identified: 0,
        declined: 0,
        creditsSpent: 0,
        budget: {
          spent: reservation.spent,
          limit: reservation.limit,
          remaining: reservation.remaining,
        },
        outcomes: [],
        skipped: "search budget exhausted",
      };
    }

    const outcomes: Outcome[] = [];
    let searched = 0;
    let identified = 0;

    for (const artist of candidates.slice(0, reservation.granted)) {
      const query = buildArtistSearchQuery(artist);
      if (!query) continue;

      let results: SearchResult[] = [];
      try {
        results = await tavilySearch(query);
        searched += 1;
      } catch {
        // A failed search still consumed nothing useful; stop rather than
        // burning the remaining budget against a broken endpoint.
        outcomes.push({
          name: artist.name,
          venueName: artist.venueName,
          query,
          genres: [],
          reason: "search request failed — stopping this run",
        });
        break;
      }

      const decision = decideArtistGenres(results, { name: artist.name, minDomains });
      if (decision.genres.length > 0) {
        const written = await ctx.runMutation(api.artistSearch.recordSearchedGenres, {
          artistId: artist._id,
          genres: decision.genres,
        });
        if (written.patched) identified += 1;
      }
      outcomes.push({
        name: artist.name,
        venueName: artist.venueName,
        query,
        genres: decision.genres,
        reason: decision.reason,
        sources: decision.sources,
      });
    }

    const unused = reservation.granted - searched;
    if (unused > 0) await ctx.runMutation(api.artistSearch.refundSearchCredits, { count: unused });

    const budget = await ctx.runQuery(api.artistSearch.searchBudgetStatus, {});
    return {
      searched,
      identified,
      declined: searched - identified,
      creditsSpent: searched,
      budget: { spent: budget.spent, limit: budget.limit, remaining: budget.remaining },
      outcomes,
    };
  },
});
