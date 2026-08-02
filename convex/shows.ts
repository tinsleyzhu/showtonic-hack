import { query } from "./_generated/server";
import { v } from "convex/values";

export const listByFestival = query({
  args: {
    festivalId: v.string(),
  },
  handler: async (ctx, args) => {
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_festival", (q) => q.eq("festivalId", args.festivalId))
      .collect();

    return shows.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) {
        return byDate;
      }

      return a.title.localeCompare(b.title);
    });
  },
});

export const get = query({
  args: {
    showId: v.id("shows"),
  },
  handler: async (ctx, args) => {
    const show = await ctx.db.get(args.showId);
    if (!show) {
      return null;
    }

    const artists = await Promise.all(show.artistIds.map((artistId) => ctx.db.get(artistId)));

    return {
      ...show,
      artists: artists.filter(Boolean),
    };
  },
});
