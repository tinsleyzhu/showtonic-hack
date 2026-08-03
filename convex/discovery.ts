import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  buildDiscoveryShelves,
  matchesSearch,
  summarizeRatings,
} from "./showtonicUtils.js";

function weekday(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function displayTime(value?: string) {
  if (!value) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

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
        day: show.day ?? weekday(show.date),
        time: show.time ?? displayTime(show.startTime) ?? "Time TBA",
        stage: show.stage ?? show.venueName,
        venueId: show.venueId,
        venueName: show.venueName,
        city: show.city,
        region: show.region,
        festivalId: show.festivalId,
        isJamBase: show.jambaseId.startsWith("jambase:"),
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
  args: { userId: v.id("users"), today: v.string() },
  handler: async (ctx, args) => {
    const shows = await listShowSummaries(ctx, args.userId);
    const jamBaseShows = shows.filter((show) => show.isJamBase && show.city === "San Francisco");
    return {
      shows,
      shelves: buildDiscoveryShelves(shows, args.today),
      catalogStats: {
        historical: jamBaseShows.filter((show) => show.date < args.today).length,
        upcoming: jamBaseShows.filter((show) => show.date >= args.today).length,
        total: jamBaseShows.length,
        demo: shows.filter((show) => !show.isJamBase && show.city === "San Francisco").length,
      },
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
