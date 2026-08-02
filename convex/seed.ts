import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  seedArtists,
  seedLogs,
  seedShows,
  seedUsers,
  seedVenues,
} from "./seedData";

async function getByIndex(ctx: any, table: string, index: string, field: string, value: string) {
  return ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq(field, value))
    .unique();
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const artistIds = new Map<string, string>();
    const venueIds = new Map<string, string>();
    const showIds = new Map<string, string>();
    const userIds = new Map<string, string>();

    for (const artist of seedArtists) {
      const existing = await getByIndex(ctx, "artists", "by_jambase", "jambaseId", artist.jambaseId);
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
      const existing = await getByIndex(ctx, "venues", "by_jambase", "jambaseId", venue.jambaseId);
      const venueId =
        existing?._id ??
        (await ctx.db.insert("venues", {
          jambaseId: venue.jambaseId,
          name: venue.name,
          city: venue.city,
          region: venue.region,
          latitude: venue.latitude,
          longitude: venue.longitude,
          image: venue.image,
        }));

      venueIds.set(venue.jambaseId, venueId);
    }

    for (const user of seedUsers) {
      const existing = await getByIndex(ctx, "users", "by_handle", "handle", user.handle);
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
      const existing = await getByIndex(ctx, "shows", "by_jambase", "jambaseId", show.jambaseId);
      const showId =
        existing?._id ??
        (await ctx.db.insert("shows", {
          jambaseId: show.jambaseId,
          title: show.title,
          date: show.date,
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
            return artistId as any;
          }),
          artistNames: [...show.artistNames],
          jambaseUrl: show.jambaseUrl,
        }));

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
        .withIndex("by_user", (q: any) => q.eq("userId", userId))
        .filter((q: any) => q.eq(q.field("showId"), showId))
        .unique();

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
        createdAt: log.createdAt,
      };

      if (existingLog) {
        await ctx.db.patch(existingLog._id, payload);
        updatedLogs += 1;
      } else {
        await ctx.db.insert("logs", payload);
        insertedLogs += 1;
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
