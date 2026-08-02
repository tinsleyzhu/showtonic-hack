import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  seedArtists,
  seedLogs,
  seedShows,
  seedUsers,
  seedVenues,
} from "./seedData";

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const artistIds = new Map<string, string>();
    const venueIds = new Map<string, string>();
    const showIds = new Map<string, string>();
    const userIds = new Map<string, string>();

    for (const artist of seedArtists) {
      const existing = await ctx.db
        .query("artists")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", artist.jambaseId))
        .unique();
      const artistId =
        existing?._id ??
        (await ctx.db.insert("artists", {
          jambaseId: artist.jambaseId,
          name: artist.name,
          image: artist.image,
          genres: [...artist.genres],
          hometown: artist.hometown,
          bio: artist.bio,
          topTrack: artist.topTrack,
          jambaseUrl: artist.jambaseUrl,
        }));

      artistIds.set(artist.jambaseId, artistId);
    }

    for (const venue of seedVenues) {
      const existing = await ctx.db
        .query("venues")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", venue.jambaseId))
        .unique();
      const payload = {
        jambaseId: venue.jambaseId,
        name: venue.name,
        city: venue.city,
        region: venue.region,
        latitude: venue.latitude,
        longitude: venue.longitude,
        image: venue.image,
        description: venue.description,
        website: venue.website,
        jambaseUrl: venue.jambaseUrl,
      };
      let venueId: Id<"venues">;
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        venueId = existing._id;
      } else {
        venueId = await ctx.db.insert("venues", payload);
      }

      venueIds.set(venue.jambaseId, venueId);
    }

    for (const user of seedUsers) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", user.handle))
        .unique();
      const userId =
        existing?._id ??
        (await ctx.db.insert("users", {
          handle: user.handle,
          avatarColor: user.avatarColor,
          isFake: user.isFake,
        }));

      userIds.set(user.handle, userId);
    }

    for (const show of seedShows) {
      const existing = await ctx.db
        .query("shows")
        .withIndex("by_jambase", (q) => q.eq("jambaseId", show.jambaseId))
        .unique();
      const venueId = venueIds.get(show.venueJambaseId);
      if (!venueId) {
        throw new Error(`Missing venue ${show.venueJambaseId} for show ${show.jambaseId}`);
      }
      const payload = {
        jambaseId: show.jambaseId,
        title: show.title,
        date: show.date,
        day: show.day,
        time: show.time,
        memoryPrompt: show.memoryPrompt,
        ticketUrl: show.ticketUrl,
        venueId: venueId as Id<"venues">,
        venueName: show.venueName,
        city: show.city,
        image: show.image,
        festivalId: show.festivalId,
        stage: show.stage,
        isHeadliner: show.isHeadliner,
        artistIds: show.artistJambaseIds.map((jambaseId) => {
          const artistId = artistIds.get(jambaseId);
          if (!artistId) {
            throw new Error(`Missing artist ${jambaseId} for show ${show.jambaseId}`);
          }
          return artistId as Id<"artists">;
        }),
        artistNames: [...show.artistNames],
        jambaseUrl: show.jambaseUrl,
      };
      let showId: Id<"shows">;
      if (existing) {
        await ctx.db.patch(existing._id, payload);
        showId = existing._id;
      } else {
        showId = await ctx.db.insert("shows", payload);
      }

      showIds.set(show.jambaseId, showId);
    }

    let insertedLogs = 0;
    let updatedLogs = 0;

    for (const log of seedLogs) {
      const userId = userIds.get(log.userHandle) as Id<"users"> | undefined;
      const showId = showIds.get(log.showJambaseId) as Id<"shows"> | undefined;
      if (!userId || !showId) {
        throw new Error(`Missing user or show for seed log ${log.userHandle}:${log.showJambaseId}`);
      }

      const show = await ctx.db.get(showId);
      if (!show) {
        throw new Error(`Missing show row for ${log.showJambaseId}`);
      }

      const existingLog = await ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("showId"), showId))
        .unique();

      const artists = await Promise.all(show.artistIds.map((artistId) => ctx.db.get(artistId)));
      const payload = {
        userId,
        showId,
        rating: log.rating,
        vibes: [...log.vibes],
        note: log.note,
        showTitle: show.title,
        showDate: show.date,
        showImage: show.image,
        artistNames: [...show.artistNames],
        venueName: show.venueName,
        city: show.city,
        artistGenres: [...new Set(artists.flatMap((artist) => artist?.genres ?? []))],
        createdAt: log.createdAt,
      };

      if (existingLog) {
        await ctx.db.patch(existingLog._id, payload);
        updatedLogs += 1;
      } else {
        await ctx.db.insert("logs", payload);
        insertedLogs += 1;
      }

      const existingAttendance = await ctx.db
        .query("attendance")
        .withIndex("by_user_show", (q) => q.eq("userId", userId).eq("showId", showId))
        .unique();
      if (existingAttendance) {
        await ctx.db.patch(existingAttendance._id, {
          status: "logged",
          updatedAt: log.createdAt,
        });
      } else {
        await ctx.db.insert("attendance", {
          userId,
          showId,
          status: "logged",
          updatedAt: log.createdAt,
        });
      }
    }

    return {
      artists: artistIds.size,
      venues: venueIds.size,
      shows: showIds.size,
      users: userIds.size,
      insertedLogs,
      updatedLogs,
    };
  },
});
