import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { upsertAttendance } from "./attendance";
import { validateLogInput } from "./showtonicUtils.js";

async function getLogByUserAndShow(
  ctx: MutationCtx,
  userId: Id<"users">,
  showId: Id<"shows">,
) {
  return ctx.db
    .query("logs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("showId"), showId))
    .unique();
}

async function hydrateUser(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db.get(userId);
}

type LogSource = "live" | "backfill" | "reclaim" | "morning_after";

// Shared insert/upsert used by the live log flow and the backfill accept path.
// A rating of 0 means "logged but unrated" (design 10's "Skip rating") and is
// excluded from averages by summarizeRatings.
export async function insertVerifiedLog(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    showId: Id<"shows">;
    rating: number;
    vibes: string[];
    note?: string;
    caption?: string;
    song?: string;
    source?: LogSource;
    createdAt?: number;
  },
) {
  if (args.rating !== 0) {
    validateLogInput({ rating: args.rating, vibes: args.vibes });
  }
  const user = await ctx.db.get(args.userId);
  const show = await ctx.db.get(args.showId);
  if (!user || !show) {
    throw new Error("Missing user or show");
  }
  if (show.date >= new Date().toISOString().slice(0, 10)) {
    throw new Error("Shows can only be logged after they happen");
  }

  const existing = await getLogByUserAndShow(ctx, args.userId, args.showId);
  const artists = await Promise.all(show.artistIds.map((artistId) => ctx.db.get(artistId)));
  const createdAt = args.createdAt ?? Date.now();
  const payload = {
    userId: args.userId,
    showId: args.showId,
    rating: args.rating,
    vibes: [...args.vibes],
    note: args.note,
    caption: args.caption,
    song: args.song,
    source: args.source ?? "live",
    showTitle: show.title,
    showDate: show.date,
    showImage: show.image,
    artistNames: [...show.artistNames],
    venueName: show.venueName,
    city: show.city,
    artistGenres: [...new Set(artists.flatMap((artist) => artist?.genres ?? []))],
    createdAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    await upsertAttendance(ctx, args.userId, args.showId, "logged", createdAt);
    return existing._id;
  }

  const logId = await ctx.db.insert("logs", payload);
  await upsertAttendance(ctx, args.userId, args.showId, "logged", createdAt);
  return logId;
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    showId: v.id("shows"),
    rating: v.number(),
    vibes: v.array(v.string()),
    note: v.optional(v.string()),
    caption: v.optional(v.string()),
    song: v.optional(v.string()),
    source: v.optional(
      v.union(
        v.literal("live"),
        v.literal("backfill"),
        v.literal("reclaim"),
        v.literal("morning_after"),
      ),
    ),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => insertVerifiedLog(ctx, args),
});

export const listByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return logs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listByShow = query({
  args: {
    showId: v.id("shows"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_show", (q) => q.eq("showId", args.showId))
      .collect();

    const hydrated = await Promise.all(
      logs.map(async (log) => {
        const user = await hydrateUser(ctx, log.userId);
        return {
          ...log,
          user,
        };
      }),
    );

    return hydrated.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db.query("logs").order("desc").take(Math.min(args.limit ?? 30, 100));

    return Promise.all(
      logs.map(async (log) => {
        const [user, media] = await Promise.all([
          ctx.db.get(log.userId),
          ctx.db.query("media").withIndex("by_log", (q) => q.eq("logId", log._id)).first(),
        ]);

        return {
          ...log,
          user,
          mediaUrl: media ? await ctx.storage.getUrl(media.storageId) : null,
        };
      }),
    );
  },
});
