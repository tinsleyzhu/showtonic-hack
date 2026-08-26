import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { summarizeRatings } from "./showtonicUtils.js";

// Public taste-seed grid for onboarding step 2 (design 04): the catalog's most
// booked artists, no identity required.
export const forOnboarding = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 18, 48);
    const shows = await ctx.db.query("shows").collect();
    const counts = new Map<Id<"artists">, number>();
    for (const show of shows) {
      for (const artistId of show.artistIds) {
        counts.set(artistId, (counts.get(artistId) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit);
    const artists = await Promise.all(
      ranked.map(async ([artistId, showCount]) => {
        const artist = await ctx.db.get(artistId);
        if (!artist) return null;
        return {
          _id: artist._id,
          name: artist.name,
          image: artist.image,
          genres: artist.genres,
          showCount,
        };
      }),
    );
    return artists.filter((artist) => artist !== null);
  },
});

export const get = query({
  args: {
    artistId: v.id("artists"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const artist = await ctx.db.get(args.artistId);
    if (!artist) {
      return null;
    }

    const allShows = await ctx.db.query("shows").collect();
    const shows = allShows.filter((show) => show.artistIds.includes(args.artistId));
    const showIds = new Set(shows.map((show) => show._id));
    const [allLogs, allMedia, followers, currentFollow] = await Promise.all([
      ctx.db.query("logs").collect(),
      ctx.db.query("media").collect(),
      ctx.db
        .query("artistFollows")
        .withIndex("by_artist", (q) => q.eq("artistId", args.artistId))
        .collect(),
      args.userId
        ? ctx.db
            .query("artistFollows")
            .withIndex("by_user_artist", (q) =>
              q.eq("userId", args.userId!).eq("artistId", args.artistId),
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

    // "Your artist history" receipt (design 23): the user's verified logs for
    // this artist — count, first-seen year, personal average.
    const yourLogs = args.userId ? logs.filter((log) => log.userId === args.userId) : [];
    const yourRated = yourLogs.filter((log) => log.rating > 0);
    const firstSeen = yourLogs.map((log) => log.showDate).sort()[0];

    // Attendance flags let the UI render your nights vivid and the rest as
    // reclaimable ghost tiles (design 23).
    const attendanceByShow = new Map<string, string>();
    if (args.userId) {
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect();
      for (const row of attendance) attendanceByShow.set(row.showId, row.status);
    }

    return {
      artist,
      shows: shows
        .map((show) => ({ ...show, attendanceStatus: attendanceByShow.get(show._id) }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      followerCount: followers.length,
      isFollowing: Boolean(currentFollow),
      ...summarizeRatings(logs),
      yourHistory: yourLogs.length
        ? {
            showCount: yourLogs.length,
            firstSeenYear: firstSeen ? firstSeen.slice(0, 4) : null,
            averageRating: yourRated.length
              ? Math.round((yourRated.reduce((sum, log) => sum + log.rating, 0) / yourRated.length) * 10) / 10
              : null,
          }
        : null,
      reviews: logs
        .map((log, index) => ({ ...log, user: users[index] }))
        .sort((left, right) => right.createdAt - left.createdAt),
      media: mediaWithUrls,
    };
  },
});
