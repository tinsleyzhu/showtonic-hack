import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const toggleArtist = mutation({
  args: {
    userId: v.id("users"),
    artistId: v.id("artists"),
  },
  handler: async (ctx, args) => {
    const [user, artist, existing] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.artistId),
      ctx.db
        .query("artistFollows")
        .withIndex("by_user_artist", (q) =>
          q.eq("userId", args.userId).eq("artistId", args.artistId),
        )
        .unique(),
    ]);
    if (!user || !artist) throw new Error("Missing user or artist");
    if (existing) {
      await ctx.db.delete(existing._id);
      return { following: false };
    }
    await ctx.db.insert("artistFollows", { ...args, createdAt: Date.now() });
    return { following: true };
  },
});

export const toggleVenue = mutation({
  args: {
    userId: v.id("users"),
    venueId: v.id("venues"),
  },
  handler: async (ctx, args) => {
    const [user, venue, existing] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.venueId),
      ctx.db
        .query("venueFollows")
        .withIndex("by_user_venue", (q) =>
          q.eq("userId", args.userId).eq("venueId", args.venueId),
        )
        .unique(),
    ]);
    if (!user || !venue) throw new Error("Missing user or venue");
    if (existing) {
      await ctx.db.delete(existing._id);
      return { following: false };
    }
    await ctx.db.insert("venueFollows", { ...args, createdAt: Date.now() });
    return { following: true };
  },
});
