import { mutation, query } from "./_generated/server";
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

    // "Your history here" receipt (design 24): visit count, rank among the
    // user's venues, and the last show they caught in this room.
    let yourHistory = null;
    let isWatchlisted = false;
    if (args.userId) {
      const userLogs = await ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect();
      const hereLogs = userLogs.filter((log) => log.venueName === venue.name);
      if (hereLogs.length) {
        const venueCounts = new Map<string, number>();
        for (const log of userLogs) {
          if (!log.venueName) continue;
          venueCounts.set(log.venueName, (venueCounts.get(log.venueName) ?? 0) + 1);
        }
        const rank =
          [...venueCounts.values()].filter((count) => count > hereLogs.length).length + 1;
        const lastLog = [...hereLogs].sort((left, right) =>
          right.showDate.localeCompare(left.showDate),
        )[0];
        yourHistory = {
          showCount: hereLogs.length,
          rank,
          lastSeen: { artistName: lastLog.artistNames[0] ?? lastLog.showTitle, date: lastLog.showDate },
        };
      }
      isWatchlisted = Boolean(
        await ctx.db
          .query("watchlist")
          .withIndex("by_user_target", (q) =>
            q
              .eq("userId", args.userId!)
              .eq("targetType", "venue")
              .eq("targetId", String(args.venueId)),
          )
          .unique(),
      );
    }

    // Attendance flags for vivid-vs-ghost past shows (design 24).
    const attendanceByShow = new Map<string, string>();
    if (args.userId) {
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect();
      for (const row of attendance) attendanceByShow.set(row.showId, row.status);
    }

    return {
      venue,
      shows: shows
        .map((show) => ({ ...show, attendanceStatus: attendanceByShow.get(show._id) }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      followerCount: followers.length,
      isFollowing: Boolean(currentFollow),
      ...summarizeRatings(logs),
      yourHistory,
      isWatchlisted,
      reviews: logs
        .map((log, index) => ({ ...log, user: users[index] }))
        .sort((left, right) => right.createdAt - left.createdAt),
      media: mediaWithUrls,
    };
  },
});

// --- Geocoding support ------------------------------------------------------
// Venue coordinates drive the backfill GPS signal (convex/backfillMatch.js).
// JamBase does not always supply them, so `npm run geocode:venues` fills the
// gaps from OpenStreetMap's Nominatim — free, no API key, no maps SDK.

export const missingCoordinates = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const venues = await ctx.db.query("venues").collect();
    return venues
      .filter((venue) => venue.latitude === undefined || venue.longitude === undefined)
      .slice(0, args.limit ?? 500)
      .map((venue) => ({
        _id: venue._id,
        name: venue.name,
        city: venue.city,
        region: venue.region,
      }));
  },
});

export const coordinateCoverage = query({
  args: {},
  handler: async (ctx) => {
    const venues = await ctx.db.query("venues").collect();
    const located = venues.filter(
      (venue) => venue.latitude !== undefined && venue.longitude !== undefined,
    ).length;
    return { total: venues.length, located, missing: venues.length - located };
  },
});

export const setCoordinates = mutation({
  args: {
    venueId: v.id("venues"),
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args) => {
    if (Math.abs(args.latitude) > 90 || Math.abs(args.longitude) > 180) {
      throw new Error("Coordinates out of range");
    }
    await ctx.db.patch(args.venueId, { latitude: args.latitude, longitude: args.longitude });
    return { ok: true };
  },
});
