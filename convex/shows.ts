import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

export const importUpcoming = mutation({
  args: {
    events: v.array(upcomingEvent),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const event of args.events) {
      if (!event.jambaseId || !event.title || !event.date) continue;

      const artistIds = [];
      for (const artistName of event.artistNames.length ? event.artistNames : [event.title]) {
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
            jambaseUrl: undefined,
          }));
        artistIds.push(artistId);
      }

      if (event.venueName) {
        const venueJambaseId = `venue-${slug(`${event.venueName}-${event.city}`)}`;
        const existingVenue = await ctx.db
          .query("venues")
          .withIndex("by_jambase", (q) => q.eq("jambaseId", venueJambaseId))
          .unique();
        if (!existingVenue) {
          await ctx.db.insert("venues", {
            jambaseId: venueJambaseId,
            name: event.venueName,
            city: event.city,
            region: event.region,
            image: event.image,
          });
        }
      }

      const payload = {
        title: event.title,
        date: event.date,
        venueName: event.venueName,
        city: event.city,
        image: event.image,
        festivalId: event.festivalId,
        stage: event.stage,
        isHeadliner: event.isHeadliner,
        artistIds,
        artistNames: event.artistNames.length ? event.artistNames : [event.title],
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
