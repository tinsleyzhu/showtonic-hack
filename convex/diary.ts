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
  const shows = await Promise.all(logs.map((log) => ctx.db.get(log.showId)));
  const hydratedLogs = logs
    .map((log, index) => ({
      ...log,
      showTitle: shows[index]?.title ?? log.showTitle,
      showImage: shows[index]?.image ?? log.showImage,
      showDate: shows[index]?.date ?? log.showDate,
      artistNames: shows[index]?.artistNames ?? log.artistNames,
      venueName: shows[index]?.venueName ?? log.venueName,
      city: shows[index]?.city ?? log.city,
      media: mediaWithUrls.filter((item) => item.logId === log._id),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
  const ratingSummary = summarizeRatings(logs);

  return {
    user,
    logs: hydratedLogs,
    stats: {
      shows: logs.length,
      artists: new Set(hydratedLogs.flatMap((log) => log.artistNames)).size,
      venues: new Set(hydratedLogs.map((log) => log.venueName).filter(Boolean)).size,
      cities: new Set(hydratedLogs.map((log) => log.city).filter(Boolean)).size,
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
    const [artistFollows, venueFollows, artists, venues] = await Promise.all([
      ctx.db
        .query("artistFollows")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("venueFollows")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db.query("artists").collect(),
      ctx.db.query("venues").collect(),
    ]);
    const artistByName = new Map(artists.map((artist) => [artist.name, artist]));
    const venueByName = new Map(venues.map((venue) => [venue.name, venue]));
    const artistActivity = new Map<string, { count: number; latestDate: string }>();
    const venueActivity = new Map<string, { count: number; latestDate: string }>();
    for (const log of diary.logs) {
      for (const artistName of new Set(log.artistNames)) {
        const current = artistActivity.get(artistName) ?? { count: 0, latestDate: "" };
        artistActivity.set(artistName, {
          count: current.count + 1,
          latestDate: current.latestDate > log.showDate ? current.latestDate : log.showDate,
        });
      }
      if (log.venueName) {
        const current = venueActivity.get(log.venueName) ?? { count: 0, latestDate: "" };
        venueActivity.set(log.venueName, {
          count: current.count + 1,
          latestDate: current.latestDate > log.showDate ? current.latestDate : log.showDate,
        });
      }
    }
    const activitySort = (
      left: { count: number; latestDate: string },
      right: { count: number; latestDate: string },
    ) => right.count - left.count || right.latestDate.localeCompare(left.latestDate);

    return {
      ...diary,
      followedArtists: artistFollows
        .map((follow) => artists.find((artist) => artist._id === follow.artistId))
        .filter((artist) => artist !== undefined),
      followedVenues: venueFollows
        .map((follow) => venues.find((venue) => venue._id === follow.venueId))
        .filter((venue) => venue !== undefined),
      topArtists: [...artistActivity.entries()]
        .map(([name, activity]) => ({ artist: artistByName.get(name), name, ...activity }))
        .filter((item) => item.artist !== undefined)
        .sort(activitySort)
        .slice(0, 5),
      topVenues: [...venueActivity.entries()]
        .map(([name, activity]) => ({ venue: venueByName.get(name), name, ...activity }))
        .filter((item) => item.venue !== undefined)
        .sort(activitySort)
        .slice(0, 5),
      favoriteShows: [...diary.logs]
        .sort(
          (left, right) =>
            right.rating - left.rating || right.createdAt - left.createdAt,
        )
        .slice(0, 4),
    };
  },
});
