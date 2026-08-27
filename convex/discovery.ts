import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  buildDiscoveryShelves,
  matchesSearch,
  scopeToCity,
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
  const [shows, logs, attendance, venues] = await Promise.all([
    ctx.db.query("shows").collect(),
    ctx.db.query("logs").collect(),
    ctx.db.query("attendance").collect(),
    ctx.db.query("venues").collect(),
  ]);

  // Venue coordinates ride along so the on-device backfill scan can score
  // photo GPS against the room without a maps API. See docs/agent-hack/SPEC.md.
  const venuesById = new Map(venues.map((venue) => [venue._id, venue]));

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
        venueLatitude: show.venueId ? venuesById.get(show.venueId)?.latitude : undefined,
        venueLongitude: show.venueId ? venuesById.get(show.venueId)?.longitude : undefined,
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

// Public, pre-identity payoff numbers for the onboarding home-base step
// (designs 05/06): upcoming show counts per city, plus per-artist counts so the
// step can say "including N artists you selected".
export const cityStats = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const shows = await ctx.db.query("shows").collect();
    const upcoming = shows.filter((show) => show.date >= args.today);
    const byCity = new Map<string, { city: string; upcomingCount: number; artistNames: Set<string> }>();
    for (const show of upcoming) {
      if (!show.city) continue;
      const entry = byCity.get(show.city) ?? {
        city: show.city,
        upcomingCount: 0,
        artistNames: new Set<string>(),
      };
      entry.upcomingCount += 1;
      for (const name of show.artistNames) entry.artistNames.add(name);
      byCity.set(show.city, entry);
    }
    return [...byCity.values()]
      .sort((left, right) => right.upcomingCount - left.upcomingCount)
      .map((entry) => ({
        city: entry.city,
        upcomingCount: entry.upcomingCount,
        artistNames: [...entry.artistNames],
      }));
  },
});

// Discover is scoped to the member's home base. Two cities of catalog with a
// year of history is ~9k shows, which blows Convex's 8,192-element return cap —
// and shipping the whole planet to a phone was never right anyway. Scope to the
// city, keep a generous window around today, and cap what crosses the wire.
const HOME_WINDOW_DAYS_BACK = 400;
const HOME_WINDOW_DAYS_FORWARD = 210;
const HOME_MAX_SHOWS = 4000;

function shiftDate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const home = query({
  args: { userId: v.id("users"), today: v.string() },
  handler: async (ctx, args) => {
    const all = await listShowSummaries(ctx, args.userId);
    const user = await ctx.db.get(args.userId);
    const homeCity = user?.homeCity;

    const earliest = shiftDate(args.today, -HOME_WINDOW_DAYS_BACK);
    const latest = shiftDate(args.today, HOME_WINDOW_DAYS_FORWARD);
    const inScope = all.filter(
      (show) =>
        (!homeCity || show.city === homeCity) && show.date >= earliest && show.date <= latest,
    );

    // If the cap still bites, keep what is most useful: everything upcoming
    // first, then the most recent past, because a diary reclaims backwards.
    const upcoming = inScope.filter((show) => show.date >= args.today);
    const past = inScope
      .filter((show) => show.date < args.today)
      .sort((left, right) => right.date.localeCompare(left.date));
    const shows = [...upcoming, ...past]
      .slice(0, HOME_MAX_SHOWS)
      .sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));

    const cityShows = shows.filter((show) => show.isJamBase);
    const watchlist = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const watchedShowIds = new Set(
      watchlist.filter((row) => row.targetType === "show").map((row) => row.targetId),
    );
    return {
      shows,
      shelves: {
        ...buildDiscoveryShelves(shows, args.today),
        fromYourWatchlist: shows
          .filter((show) => show.date >= args.today && watchedShowIds.has(show.id))
          .slice(0, 6),
      },
      catalogStats: {
        historical: cityShows.filter((show) => show.date < args.today).length,
        upcoming: cityShows.filter((show) => show.date >= args.today).length,
        total: cityShows.length,
        demo: shows.filter((show) => !show.isJamBase).length,
        city: homeCity ?? null,
        truncated: inScope.length > HOME_MAX_SHOWS,
      },
    };
  },
});

// `city` is optional and ADDITIVE. Omitting it searches the whole catalog,
// exactly as before — this query backs the published `search_shows` agent
// tool, and an outside agent that has already read the manifest must keep
// getting what it was promised. Narrowing the default would be the same silent
// drift we fixed in the manifest itself.
//
// It exists because the catalog is lopsided: ~1,567 upcoming New York shows
// against ~746 in San Francisco. A broad query ("jazz", "orchestra") fills its
// 500-result cap from the larger city, so a caller who wants results near a
// human has to be able to say so.
export const search = query({
  args: {
    userId: v.id("users"),
    query: v.string(),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const shows = await listShowSummaries(ctx, args.userId);
    // Scope BEFORE the cap, or the cap would already have spent itself on the
    // bigger city before the filter ever ran.
    const scoped = scopeToCity(shows, args.city);
    // Capped for the same reason as home: a two-letter query matches thousands.
    return scoped.filter((show) => matchesSearch(show, args.query)).slice(0, 500);
  },
});
