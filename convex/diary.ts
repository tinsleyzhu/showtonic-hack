import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { summarizeRatings } from "./showtonicUtils.js";

async function loadDiary(ctx: QueryCtx, userId: Id<"users">) {
  const [user, logs, media] = await Promise.all([
    ctx.db.get(userId),
    ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("media").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  if (!user) {
    return null;
  }

  const mediaWithUrls = await Promise.all(
    media.map(async (item) => ({ ...item, url: await ctx.storage.getUrl(item.storageId) })),
  );
  const hydratedLogs = logs
    .map((log) => ({
      ...log,
      media: mediaWithUrls.filter((item) => item.logId === log._id),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
  const ratingSummary = summarizeRatings(logs);

  return {
    user,
    logs: hydratedLogs,
    stats: {
      shows: logs.length,
      artists: new Set(logs.flatMap((log) => log.artistNames)).size,
      venues: new Set(logs.map((log) => log.venueName).filter(Boolean)).size,
      cities: new Set(logs.map((log) => log.city).filter(Boolean)).size,
      averageRating: ratingSummary.rating,
    },
  };
}

export const forUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => loadDiary(ctx, args.userId),
});

export const profile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const diary = await loadDiary(ctx, args.userId);
    if (!diary) {
      return null;
    }
    return {
      ...diary,
      favoriteShows: [...diary.logs]
        .sort(
          (left, right) =>
            right.rating - left.rating || right.createdAt - left.createdAt,
        )
        .slice(0, 4),
    };
  },
});
