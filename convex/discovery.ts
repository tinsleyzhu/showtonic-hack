import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  buildDiscoveryShelves,
  matchesSearch,
  summarizeRatings,
} from "./showtonicUtils.js";

export async function listShowSummaries(ctx: QueryCtx, userId?: Id<"users">) {
  const [shows, logs, attendance] = await Promise.all([
    ctx.db.query("shows").collect(),
    ctx.db.query("logs").collect(),
    ctx.db.query("attendance").collect(),
  ]);

  const logsByShow = new Map<string, Doc<"logs">[]>();
  for (const log of logs) {
    const bucket = logsByShow.get(log.showId) ?? [];
    bucket.push(log);
    logsByShow.set(log.showId, bucket);
  }

  const attendanceByShow = new Map<string, Doc<"attendance">[]>();
  for (const item of attendance) {
    const bucket = attendanceByShow.get(item.showId) ?? [];
    bucket.push(item);
    attendanceByShow.set(item.showId, bucket);
  }

  return shows
    .map((show) => {
      const showLogs = logsByShow.get(show._id) ?? [];
      const showAttendance = attendanceByShow.get(show._id) ?? [];
      const currentAttendance = userId
        ? showAttendance.find((item) => item.userId === userId)?.status
        : undefined;

      return {
        id: show._id,
        title: show.title,
        artistIds: show.artistIds,
        artistNames: show.artistNames,
        image: show.image,
        date: show.date,
        day: show.day ?? "Date TBA",
        time: show.time ?? "Time TBA",
        stage: show.stage,
        venueId: show.venueId,
        venueName: show.venueName,
        city: show.city,
        jambaseUrl: show.jambaseUrl,
        ticketUrl: show.ticketUrl,
        memoryPrompt: show.memoryPrompt ?? "What moment will you remember?",
        ...summarizeRatings(showLogs),
        interestedCount: showAttendance.filter((item) => item.status === "interested").length,
        goingCount: showAttendance.filter((item) => item.status === "going").length,
        loggedCount: showAttendance.filter((item) => item.status === "logged").length,
        attendanceStatus: currentAttendance,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
}

export const home = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const shows = await listShowSummaries(ctx, args.userId);
    return {
      shows,
      shelves: buildDiscoveryShelves(shows),
    };
  },
});

export const search = query({
  args: {
    userId: v.id("users"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const shows = await listShowSummaries(ctx, args.userId);
    return shows.filter((show) => matchesSearch(show, args.query));
  },
});
