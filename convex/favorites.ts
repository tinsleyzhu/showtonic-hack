import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Pin up to 4 all-time favorite shows atop the diary (design 19).
export const set = mutation({
  args: {
    userId: v.id("users"),
    logIds: v.array(v.id("logs")),
  },
  handler: async (ctx, args) => {
    if (args.logIds.length > 4) {
      throw new Error("Pin at most 4 favorite shows");
    }

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));

    let rank = 1;
    for (const logId of args.logIds) {
      const log = await ctx.db.get(logId);
      if (!log || log.userId !== args.userId) continue;
      await ctx.db.insert("favorites", {
        userId: args.userId,
        showId: log.showId,
        logId,
        rank,
      });
      rank += 1;
    }
    return { pinned: rank - 1 };
  },
});
