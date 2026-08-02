import { query } from "./_generated/server";
import { v } from "convex/values";
import { listShowSummaries } from "./discovery";
import { summarizeRatings } from "./showtonicUtils.js";

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

export const detail = query({
  args: {
    showId: v.id("shows"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const show = await ctx.db.get(args.showId);
    if (!show) {
      return null;
    }

    const [artists, venue, logs, attendance, media, summaries] = await Promise.all([
      Promise.all(show.artistIds.map((artistId) => ctx.db.get(artistId))),
      show.venueId ? ctx.db.get(show.venueId) : null,
      ctx.db.query("logs").withIndex("by_show", (q) => q.eq("showId", args.showId)).collect(),
      ctx.db
        .query("attendance")
        .withIndex("by_show", (q) => q.eq("showId", args.showId))
        .collect(),
      ctx.db.query("media").withIndex("by_show", (q) => q.eq("showId", args.showId)).collect(),
      listShowSummaries(ctx, args.userId),
    ]);

    const mediaWithUrls = await Promise.all(
      media.map(async (item) => ({
        ...item,
        url: await ctx.storage.getUrl(item.storageId),
      })),
    );
    const users = await Promise.all(logs.map((log) => ctx.db.get(log.userId)));
    const hydratedLogs = logs
      .map((log, index) => ({
        ...log,
        user: users[index],
        media: mediaWithUrls.filter((item) => item.logId === log._id),
      }))
      .sort((left, right) => right.createdAt - left.createdAt);
    const attendanceUsers = await Promise.all(attendance.map((item) => ctx.db.get(item.userId)));

    return {
      show: {
        ...show,
        day: show.day ?? "Date TBA",
        time: show.time ?? "Time TBA",
        memoryPrompt: show.memoryPrompt ?? "What moment will you remember?",
      },
      artists: artists.filter((artist) => artist !== null),
      venue,
      ...summarizeRatings(logs),
      attendanceStatus: args.userId
        ? attendance.find((item) => item.userId === args.userId)?.status
        : undefined,
      attendanceCounts: {
        interested: attendance.filter((item) => item.status === "interested").length,
        going: attendance.filter((item) => item.status === "going").length,
        logged: attendance.filter((item) => item.status === "logged").length,
      },
      attendees: attendance.map((item, index) => ({ ...item, user: attendanceUsers[index] })),
      logs: hydratedLogs,
      media: mediaWithUrls,
      recommendedShows: summaries.filter((item) => item.id !== show._id).slice(0, 4),
    };
  },
});
