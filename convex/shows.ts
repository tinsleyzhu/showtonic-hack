import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { listShowSummaries } from "./discovery";
import { summarizeRatings } from "./showtonicUtils.js";
import { artistKey, venueKey, showKey } from "./dedupUtils.js";

const upcomingEvent = v.object({
  jambaseId: v.string(),
  title: v.string(),
  date: v.string(),
  startTime: v.optional(v.string()),
  venueName: v.string(),
  city: v.string(),
  region: v.optional(v.string()),
  // Venue geo when JamBase supplies it — powers the backfill GPS signal.
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  image: v.optional(v.string()),
  festivalId: v.optional(v.string()),
  stage: v.optional(v.string()),
  isHeadliner: v.boolean(),
  artistNames: v.array(v.string()),
  artistJambaseIds: v.optional(v.array(v.string())),
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

export const listCatalog = query({
  args: {
    city: v.string(),
    from: v.string(),
    to: v.optional(v.string()),
    direction: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 250);
    return ctx.db
      .query("shows")
      .withIndex("by_city_date", (q) => {
        const cityRange = q.eq("city", args.city).gte("date", args.from);
        return args.to ? cityRange.lte("date", args.to) : cityRange;
      })
      .order(args.direction ?? "asc")
      // cap-safe: city and date range are both in the index and the caller
      // chooses the direction, so the cap keeps exactly the end of the range
      // the caller asked to start from.
      .take(limit);
  },
});

export const catalogStats = query({
  args: {
    city: v.string(),
    since: v.string(),
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const [historical, upcoming] = await Promise.all([
      ctx.db
        .query("shows")
        .withIndex("by_city_date", (q) => q.eq("city", args.city).gte("date", args.since).lt("date", args.today))
        .collect(),
      ctx.db
        .query("shows")
        .withIndex("by_city_date", (q) => q.eq("city", args.city).gte("date", args.today))
        .collect(),
    ]);
    const importedHistorical = historical.filter((show) => show.jambaseId.startsWith("jambase:"));
    const importedUpcoming = upcoming.filter((show) => show.jambaseId.startsWith("jambase:"));

    return {
      historical: importedHistorical.length,
      upcoming: importedUpcoming.length,
      total: importedHistorical.length + importedUpcoming.length,
      demo: historical.length + upcoming.length - importedHistorical.length - importedUpcoming.length,
    };
  },
});

export const reconcileImportedRange = mutation({
  args: {
    city: v.string(),
    from: v.string(),
    to: v.string(),
    keepJambaseIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const keep = new Set(args.keepJambaseIds);
    const shows = await ctx.db
      .query("shows")
      .withIndex("by_city_date", (q) => q.eq("city", args.city).gte("date", args.from).lte("date", args.to))
      .collect();
    let removed = 0;
    let preservedWithLogs = 0;

    for (const show of shows) {
      if (!show.jambaseId.startsWith("jambase:") || keep.has(show.jambaseId)) continue;
      const log = await ctx.db
        .query("logs")
        .withIndex("by_show", (q) => q.eq("showId", show._id))
        .first();
      if (log) {
        preservedWithLogs += 1;
        continue;
      }
      await ctx.db.delete(show._id);
      removed += 1;
    }

    return { removed, preservedWithLogs };
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
        day: show.day ?? weekday(show.date),
        time: show.time ?? displayTime(show.startTime) ?? "Time TBA",
        stage: show.stage ?? show.venueName,
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
      // Venue signal (design 15): verified rating + the freshest one-liner
      // from logs written at this venue.
      venueSignal: venue
        ? await (async () => {
            const venueLogs = (await ctx.db.query("logs").collect()).filter(
              (log) => log.venueName === venue.name,
            );
            const summary = summarizeRatings(venueLogs);
            const note = venueLogs
              .filter((log) => log.note)
              .sort((left, right) => right.createdAt - left.createdAt)[0]?.note;
            return { ...summary, note: note ?? null };
          })()
        : null,
      isWatchlisted: args.userId
        ? Boolean(
            await ctx.db
              .query("watchlist")
              .withIndex("by_user_target", (q) =>
                q
                  .eq("userId", args.userId!)
                  .eq("targetType", "show")
                  .eq("targetId", String(args.showId)),
              )
              .unique(),
          )
        : false,
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
      for (const [index, artistName] of artistNames.entries()) {
        const syntheticJambaseId = `artist-${slug(artistName)}`;
        const jambaseId = event.artistJambaseIds?.[index] ?? syntheticJambaseId;
        let existingArtist = await ctx.db
          .query("artists")
          .withIndex("by_jambase", (q) => q.eq("jambaseId", jambaseId))
          .unique();
        if (!existingArtist && jambaseId !== syntheticJambaseId) {
          existingArtist = await ctx.db
            .query("artists")
            .withIndex("by_jambase", (q) => q.eq("jambaseId", syntheticJambaseId))
            .unique();
          if (existingArtist) await ctx.db.patch(existingArtist._id, { jambaseId });
        }
        // The id-based lookups above only ever recognise a row this same source
        // wrote. The normalized name is what recognises the SAME ACT arriving
        // from a different sync — which is how one artist became three rows.
        const nameKey = artistKey({ name: artistName });
        if (!existingArtist && nameKey) {
          existingArtist = await ctx.db
            .query("artists")
            .withIndex("by_name_key", (q) => q.eq("nameKey", nameKey))
            .first();
        }
        const artistId =
          existingArtist?._id ??
          (await ctx.db.insert("artists", {
            jambaseId,
            name: artistName,
            image: event.image,
            genres: [],
            nameKey,
          }));
        // Key rows written before the sweep, so the next sync can find them.
        if (existingArtist && existingArtist.nameKey !== nameKey) {
          await ctx.db.patch(existingArtist._id, { nameKey });
        }
        artistIds.push(artistId);
      }

      const venueJambaseId = `venue-${slug(`${event.venueName}-${event.city}`)}`;
      const venueDedupKey = venueKey({ name: event.venueName, city: event.city });
      let existingVenue = await ctx.db
        .query("venues")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", venueJambaseId))
        .unique();
      // "Golden Gate Theatre" and "Golden Gate Theater" slug differently and so
      // miss each other by id. Normalized name + city does not.
      if (!existingVenue && venueDedupKey) {
        existingVenue = await ctx.db
          .query("venues")
          .withIndex("by_dedup_key", (q) => q.eq("dedupKey", venueDedupKey))
          .first();
      }
      const venueId =
        existingVenue?._id ??
        (await ctx.db.insert("venues", {
          jambaseId: venueJambaseId,
          name: event.venueName,
          city: event.city,
          region: event.region,
          image: event.image,
          latitude: event.latitude,
          longitude: event.longitude,
          dedupKey: venueDedupKey,
        }));
      if (existingVenue && existingVenue.dedupKey !== venueDedupKey) {
        await ctx.db.patch(existingVenue._id, { dedupKey: venueDedupKey });
      }

      // Backfill coordinates onto venues stored before geo was mapped. Never
      // overwrite a coordinate we already have — the geocoder may have filled it.
      if (
        existingVenue &&
        existingVenue.latitude === undefined &&
        event.latitude !== undefined &&
        event.longitude !== undefined
      ) {
        await ctx.db.patch(existingVenue._id, {
          latitude: event.latitude,
          longitude: event.longitude,
        });
      }

      const payload = {
        title: event.title,
        date: event.date,
        day: weekday(event.date),
        time: displayTime(event.startTime),
        startTime: event.startTime,
        venueId,
        venueName: event.venueName,
        city: event.city,
        region: event.region,
        image: event.image,
        festivalId: event.festivalId,
        stage: event.stage ?? event.venueName,
        isHeadliner: event.isHeadliner,
        artistIds,
        artistNames,
        artistJambaseIds: event.artistJambaseIds,
        jambaseUrl: event.jambaseUrl,
      };
      const dedupKey = showKey(payload);
      let existingShow = await ctx.db
        .query("shows")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", event.jambaseId))
        .unique();
      // Same night, same room, same headliner, same start time — one show,
      // however many sources announce it. Without this the next Ticketmaster
      // sync re-inserts everything the sweep just merged.
      if (!existingShow && dedupKey) {
        existingShow = await ctx.db
          .query("shows")
          .withIndex("by_dedup_key", (q) => q.eq("dedupKey", dedupKey))
          .first();
      }

      if (existingShow) {
        // Patch WITHOUT the identity fields: the surviving row keeps the
        // jambaseId it was found by, and a thinner bill from a second source
        // must not overwrite a fuller one already stored.
        const merged = {
          ...payload,
          dedupKey,
          artistIds: payload.artistIds.length >= (existingShow.artistIds?.length ?? 0)
            ? payload.artistIds
            : existingShow.artistIds,
          artistNames: payload.artistNames.length >= (existingShow.artistNames?.length ?? 0)
            ? payload.artistNames
            : existingShow.artistNames,
          image: payload.image ?? existingShow.image,
          ticketUrl: existingShow.ticketUrl,
        };
        await ctx.db.patch(existingShow._id, merged);
        updated += 1;
      } else {
        await ctx.db.insert("shows", { jambaseId: event.jambaseId, ...payload, dedupKey });
        inserted += 1;
      }
    }

    return { inserted, updated, total: args.events.length };
  },
});
