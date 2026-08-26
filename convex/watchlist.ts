import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const targetType = v.union(v.literal("show"), v.literal("artist"), v.literal("venue"));

export const toggle = mutation({
  args: {
    userId: v.id("users"),
    targetType,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_target", (q) =>
        q.eq("userId", args.userId).eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { watchlisted: false };
    }
    await ctx.db.insert("watchlist", {
      userId: args.userId,
      targetType: args.targetType,
      targetId: args.targetId,
      createdAt: Date.now(),
    });
    return { watchlisted: true };
  },
});

export const forUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
