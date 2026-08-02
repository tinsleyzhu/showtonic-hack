/* eslint-disable @typescript-eslint/no-explicit-any */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function getLogByUserAndShow(ctx: any, userId: string, showId: string) {
  return ctx.db
    .query("logs")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .filter((q: any) => q.eq(q.field("showId"), showId))
    .unique();
}

async function hydrateUser(ctx: any, userId: string) {
  return ctx.db.get(userId);
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
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const show = await ctx.db.get(args.showId);
    if (!user || !show) {
      throw new Error("Missing user or show");
    }

    const existing = await getLogByUserAndShow(ctx, args.userId, args.showId);
    const payload = {
      userId: args.userId,
      showId: args.showId,
      rating: args.rating,
      vibes: [...args.vibes],
      note: args.note,
      caption: args.caption,
      song: args.song,
      showTitle: show.title,
      showDate: show.date,
      showImage: show.image,
      artistNames: [...show.artistNames],
      createdAt: args.createdAt ?? Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return ctx.db.insert("logs", payload);
  },
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
