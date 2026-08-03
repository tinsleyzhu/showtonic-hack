import { query } from "./_generated/server";
import { v } from "convex/values";
import { summarizeRatings } from "./showtonicUtils.js";

export const get = query({
  args: {
    venueId: v.id("venues"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const venue = await ctx.db.get(args.venueId);
    if (!venue) {
      return null;
    }

    const allShows = await ctx.db.query("shows").collect();
    const shows = allShows.filter((show) => show.venueId === args.venueId);
    const showIds = new Set(shows.map((show) => show._id));
    const [allLogs, allMedia, followers, currentFollow] = await Promise.all([
      ctx.db.query("logs").collect(),
      ctx.db.query("media").collect(),
      ctx.db
        .query("venueFollows")
        .withIndex("by_venue", (q) => q.eq("venueId", args.venueId))
        .collect(),
      args.userId
        ? ctx.db
            .query("venueFollows")
            .withIndex("by_user_venue", (q) =>
              q.eq("userId", args.userId!).eq("venueId", args.venueId),
            )
            .unique()
        : null,
    ]);
    const logs = allLogs.filter((log) => showIds.has(log.showId));
    const media = allMedia.filter((item) => showIds.has(item.showId));
    const [users, mediaWithUrls] = await Promise.all([
      Promise.all(logs.map((log) => ctx.db.get(log.userId))),
      Promise.all(
        media.map(async (item) => ({ ...item, url: await ctx.storage.getUrl(item.storageId) })),
      ),
    ]);

    return {
      venue,
      shows: shows.sort((left, right) => left.date.localeCompare(right.date)),
      followerCount: followers.length,
      isFollowing: Boolean(currentFollow),
      ...summarizeRatings(logs),
      reviews: logs
        .map((log, index) => ({ ...log, user: users[index] }))
        .sort((left, right) => right.createdAt - left.createdAt),
      media: mediaWithUrls,
    };
  },
});
