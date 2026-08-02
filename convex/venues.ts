import { query } from "./_generated/server";
import { v } from "convex/values";
import { summarizeRatings } from "./showtonicUtils.js";

export const get = query({
  args: { venueId: v.id("venues") },
  handler: async (ctx, args) => {
    const venue = await ctx.db.get(args.venueId);
    if (!venue) {
      return null;
    }

    const allShows = await ctx.db.query("shows").collect();
    const shows = allShows.filter((show) => show.venueId === args.venueId);
    const showIds = new Set(shows.map((show) => show._id));
    const [allLogs, allMedia] = await Promise.all([
      ctx.db.query("logs").collect(),
      ctx.db.query("media").collect(),
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
      shows,
      ...summarizeRatings(logs),
      reviews: logs
        .map((log, index) => ({ ...log, user: users[index] }))
        .sort((left, right) => right.createdAt - left.createdAt),
      media: mediaWithUrls,
    };
  },
});
