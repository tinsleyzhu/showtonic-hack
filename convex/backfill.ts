import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { insertVerifiedLog } from "./logs";
import { completeDraft, writeDraft } from "./backfillDraft.js";

// Backfill candidates (designs 08–11): the client scans photos on-device and
// sends only match metadata here. Nothing enters the diary until the user
// confirms a candidate.
//
// Genres live on the show's ARTISTS (`shows` carries none), so a draft's vibe
// suggestions are assembled server-side from the same lookup the diary log
// uses (`logs.artistGenres`); the pure `writeDraft` never sees a query.
async function showWithGenres(
  ctx: MutationCtx,
  showId: string | null,
  showCache: Map<string, Doc<"shows"> | null>,
  genresByShow: Map<string, string[]>,
): Promise<{ show: Doc<"shows"> | null; genres: string[] }> {
  if (!showId) return { show: null, genres: [] };
  let show = showCache.get(showId);
  if (show === undefined) {
    show = (await ctx.db.get(showId as Id<"shows">)) ?? null;
    showCache.set(showId, show);
  }
  if (!show) return { show: null, genres: [] };
  let genres = genresByShow.get(showId);
  if (!genres) {
    const artists = await Promise.all(show.artistIds.map((artistId) => ctx.db.get(artistId)));
    genres = [...new Set(artists.flatMap((artist) => artist?.genres ?? []))];
    genresByShow.set(showId, genres);
  }
  return { show, genres };
}

export const saveCandidates = mutation({
  args: {
    userId: v.id("users"),
    candidates: v.array(
      v.object({
        showId: v.optional(v.id("shows")),
        clusterDate: v.string(),
        photoCount: v.number(),
        captureWindow: v.optional(v.string()),
        confidence: v.number(),
        // Derived evidence strings only — never raw photo coordinates.
        evidence: v.optional(
          v.array(
            v.object({
              kind: v.string(),
              detail: v.string(),
              delta: v.number(),
            }),
          ),
        ),
        draft: v.optional(
          v.object({
            caption: v.optional(v.string()),
            vibes: v.optional(v.array(v.string())),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Re-scan replaces any still-pending candidates; resolved ones are history.
    const pending = await ctx.db
      .query("backfillCandidates")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .collect();
    await Promise.all(pending.map((candidate) => ctx.db.delete(candidate._id)));

    const now = Date.now();
    // Skip nights the user already logged — never re-ask about a diary entry.
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const loggedShowIds = new Set(logs.map((log) => log.showId));

    const rows: { _id: string; clusterDate: string; showId: string | null; draft: { caption: string; vibes: string[] } }[] = [];
    const showCache = new Map<string, Doc<"shows"> | null>();
    const genresByShow = new Map<string, string[]>();
    for (const candidate of args.candidates) {
      if (candidate.showId && loggedShowIds.has(candidate.showId)) continue;
      // Every insert leaves with a complete draft: the client's fills its own
      // gaps, and writeDraft fills the rest from evidence + the show's genres.
      const { show, genres } = await showWithGenres(ctx, candidate.showId ?? null, showCache, genresByShow);
      const draft = completeDraft(
        candidate.draft,
        writeDraft({
          clusterDate: candidate.clusterDate,
          photoCount: candidate.photoCount,
          captureWindow: candidate.captureWindow,
          show: show ? { venueName: show.venueName, genres } : null,
        }),
      );
      const _id = await ctx.db.insert("backfillCandidates", {
        userId: args.userId,
        showId: candidate.showId,
        clusterDate: candidate.clusterDate,
        photoCount: candidate.photoCount,
        captureWindow: candidate.captureWindow,
        confidence: Math.max(0, Math.min(candidate.confidence, 0.99)),
        evidence: candidate.evidence,
        draft,
        status: "pending",
        createdAt: now,
      });
      rows.push({ _id, clusterDate: candidate.clusterDate, showId: candidate.showId ?? null, draft });
    }
    return { saved: rows.length, rows };
  },
});

export const pending = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("backfillCandidates")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .collect();

    // A candidate with no show is a REFUSAL — a night the matcher declined to
    // place. It belongs in the activity feed, where it reads as restraint, not
    // in the decisions queue: there is nothing for the human to confirm, and
    // rendering it as a card would ask them to approve an absence.
    const candidates = rows.filter((candidate) => candidate.showId);

    const joined = await Promise.all(
      candidates.map(async (candidate) => {
        const show = candidate.showId ? await ctx.db.get(candidate.showId) : null;
        return {
          _id: candidate._id,
          clusterDate: candidate.clusterDate,
          photoCount: candidate.photoCount,
          captureWindow: candidate.captureWindow,
          confidence: candidate.confidence,
          evidence: candidate.evidence ?? [],
          draft: candidate.draft ?? null,
          show: show
            ? {
                _id: show._id,
                title: show.title,
                date: show.date,
                artistNames: show.artistNames,
                venueName: show.venueName,
                city: show.city,
                image: show.image,
                // Festival-day rows are self-describing for agent clients:
                // the flag says the names are a bill to choose from, and the
                // festival id groups the day rows — no new tooling needed.
                festivalId: show.festivalId,
                isFestivalDay: show.isFestivalDay === true,
              }
            : null,
        };
      }),
    );
    return joined.sort(
      (left, right) =>
        right.confidence - left.confidence || right.clusterDate.localeCompare(left.clusterDate),
    );
  },
});

export const resolve = mutation({
  args: {
    candidateId: v.id("backfillCandidates"),
    userId: v.id("users"),
    action: v.union(v.literal("accept"), v.literal("reject"), v.literal("reassign")),
    // accept: optional immediate rating (0 = logged unrated, design 10)
    rating: v.optional(v.number()),
    // reassign ("right night, wrong show"): the corrected show
    showId: v.optional(v.id("shows")),
    // Festival-day accepts carry exactly the acts the human confirmed — the
    // multi-select's choices, seeded from the day's bill. Validated against
    // the target show's bill at insert time; absent means the whole bill.
    lineup: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.userId !== args.userId) {
      throw new Error("Candidate not found");
    }
    if (candidate.status !== "pending") {
      return { status: candidate.status, logId: null };
    }

    if (args.action === "reject") {
      await ctx.db.patch(candidate._id, { status: "rejected" });
      return { status: "rejected", logId: null };
    }

    const showId = args.action === "reassign" ? args.showId : candidate.showId;
    if (!showId) {
      throw new Error("A show is required to confirm this night");
    }

    // Never clobber an existing diary entry with an unrated backfill accept.
    const existing = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("showId"), showId))
      .unique();

    let logId = existing?._id ?? null;
    if (!existing) {
      logId = await insertVerifiedLog(ctx, {
        userId: args.userId,
        showId,
        rating: args.rating ?? 0,
        vibes: [],
        source: "backfill",
        ...(args.lineup !== undefined ? { artistNames: args.lineup } : {}),
      });
    } else if (args.rating && existing.rating === 0) {
      await ctx.db.patch(existing._id, { rating: args.rating });
    }

    const status = args.action === "reassign" ? "reassigned" : "accepted";
    await ctx.db.patch(candidate._id, { status, showId });
    return { status, logId };
  },
});

// Quick-rating step (design 10): rate the log created by an accept.
export const rateLog = mutation({
  args: {
    userId: v.id("users"),
    logId: v.id("logs"),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== args.userId) {
      throw new Error("Log not found");
    }
    if (args.rating < 0.5 || args.rating > 5 || !Number.isInteger(args.rating * 2)) {
      throw new Error("Rating must be 0.5–5 in half-star steps");
    }
    await ctx.db.patch(args.logId, { rating: args.rating });
    return { ok: true };
  },
});
