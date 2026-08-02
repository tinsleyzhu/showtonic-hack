import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { listShowSummaries } from "./discovery";
import { summarizeRatings } from "./showtonicUtils.js";

const upcomingEvent = v.object({
  jambaseId: v.string(),
  title: v.string(),
  date: v.string(),
  venueName: v.string(),
  city: v.string(),
  region: v.optional(v.string()),
  image: v.optional(v.string()),
  festivalId: v.optional(v.string()),
  stage: v.optional(v.string()),
  isHeadliner: v.boolean(),
  artistNames: v.array(v.string()),
  jambaseUrl: v.optional(v.string()),
});

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

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

export const importUpcoming = mutation({
  args: {
    events: v.array(upcomingEvent),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const event of args.events) {
      if (!event.jambaseId || !event.title || !event.date) continue;

      const artistIds: Id<"artists">[] = [];
      const artistNames = event.artistNames.length ? event.artistNames : [event.title];
      for (const artistName of artistNames) {
        const jambaseId = `artist-${slug(artistName)}`;
        const existingArtist = await ctx.db
          .query("artists")
          .withIndex("by_jambase", (q) => q.eq("jambaseId", jambaseId))
          .unique();
        const artistId =
          existingArtist?._id ??
          (await ctx.db.insert("artists", {
            jambaseId,
            name: artistName,
            image: event.image,
            genres: [],
          }));
        artistIds.push(artistId);
      }

      const venueJambaseId = `venue-${slug(`${event.venueName}-${event.city}`)}`;
      const existingVenue = await ctx.db
        .query("venues")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", venueJambaseId))
        .unique();
      const venueId =
        existingVenue?._id ??
        (await ctx.db.insert("venues", {
          jambaseId: venueJambaseId,
          name: event.venueName,
          city: event.city,
          region: event.region,
          image: event.image,
        }));

      const payload = {
        title: event.title,
        date: event.date,
        venueId,
        venueName: event.venueName,
        city: event.city,
        image: event.image,
        festivalId: event.festivalId,
        stage: event.stage,
        isHeadliner: event.isHeadliner,
        artistIds,
        artistNames,
        jambaseUrl: event.jambaseUrl,
      };
      const existingShow = await ctx.db
        .query("shows")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", event.jambaseId))
        .unique();

      if (existingShow) {
        await ctx.db.patch(existingShow._id, payload);
        updated += 1;
      } else {
        await ctx.db.insert("shows", { jambaseId: event.jambaseId, ...payload });
        inserted += 1;
      }
    }

    return { inserted, updated, total: args.events.length };
  },
});
