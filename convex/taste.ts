import { query } from "./_generated/server";
import { v } from "convex/values";
import { tasteScore } from "./tasteMath.js";

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildProfile(
  logs: Array<{
    showId: string;
    showTitle: string;
    artistNames: string[];
    artistGenres?: string[];
    venueName?: string;
  }>,
) {
  const artistNames = unique(logs.flatMap((log) => log.artistNames));
  const showIds = unique(logs.map((log) => log.showId));
  const showTitles = unique(logs.map((log) => log.showTitle));
  // Taste v2 signals: sparse until L1 enrichment lands, so tasteScore only
  // leans on these when both sides in a comparison actually have them.
  const genres = unique(logs.flatMap((log) => log.artistGenres ?? []));
  const venueNames = unique(logs.map((log) => log.venueName ?? "").filter(Boolean));

  return {
    artistNames,
    showIds,
    showTitles,
    genres,
    venueNames,
  };
}

// Taste match detail (design 22): the receipts behind a match percentage —
// shared artists with counts, both-there shows with each rating, and their
// top-rated logs for artists you haven't seen yet.
export const matchDetail = query({
  args: {
    userId: v.id("users"),
    otherUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [me, other, myLogs, otherLogs] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.otherUserId),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.otherUserId))
        .collect(),
    ]);
    if (!me || !other) return null;

    const myProfile = buildProfile(myLogs);
    const otherProfile = buildProfile(otherLogs);
    const sharedShowIds = new Set(
      myProfile.showIds.filter((showId) => otherProfile.showIds.includes(showId)),
    );

    // Shared artists with how many of their shows the other person logged.
    const otherArtistCounts = new Map<string, number>();
    for (const log of otherLogs) {
      for (const name of new Set(log.artistNames)) {
        otherArtistCounts.set(name, (otherArtistCounts.get(name) ?? 0) + 1);
      }
    }
    const sharedArtists = myProfile.artistNames
      .filter((name) => otherProfile.artistNames.includes(name))
      .map((name) => ({ name, showCount: otherArtistCounts.get(name) ?? 1 }))
      .sort((left, right) => right.showCount - left.showCount);

    const myRatingByShow = new Map(myLogs.map((log) => [log.showId, log.rating]));
    const bothThere = otherLogs
      .filter((log) => sharedShowIds.has(log.showId))
      .map((log) => ({
        showId: log.showId,
        title: log.showTitle,
        artistNames: log.artistNames,
        venueName: log.venueName,
        date: log.showDate,
        image: log.showImage,
        theirRating: log.rating,
        yourRating: myRatingByShow.get(log.showId) ?? 0,
      }))
      .sort((left, right) => right.date.localeCompare(left.date));

    const myArtists = new Set(myProfile.artistNames.map((name) => name.toLowerCase()));
    const recommendations = otherLogs
      .filter(
        (log) =>
          log.rating >= 4.5 &&
          !log.artistNames.some((name) => myArtists.has(name.toLowerCase())),
      )
      .sort((left, right) => right.rating - left.rating)
      .slice(0, 4)
      .map((log) => ({
        showId: log.showId,
        artistName: log.artistNames[0] ?? log.showTitle,
        venueName: log.venueName,
        rating: log.rating,
      }));

    return {
      user: { _id: other._id, handle: other.handle, avatarColor: other.avatarColor, homeCity: other.homeCity ?? null },
      showCount: otherLogs.length,
      // tasteScore can exceed 1.0 (jaccard + shared-show bonus); a percentage
      // over 99 reads as broken, so clamp for display.
      matchPercent: Math.min(
        Math.round(
          tasteScore(myProfile.artistNames, otherProfile.artistNames, bothThere.length, {
            genresA: myProfile.genres,
            genresB: otherProfile.genres,
            venuesA: myProfile.venueNames,
            venuesB: otherProfile.venueNames,
          }) * 100,
        ),
        99,
      ),
      sharedArtists,
      sharedArtistCount: sharedArtists.length,
      bothThereCount: bothThere.length,
      bothThere: bothThere.slice(0, 5),
      recommendations,
    };
  },
});

export const similar = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [targetUser, targetLogs, allUsers, allLogs] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("logs").collect(),
    ]);

    if (!targetUser) {
      return [];
    }

    const targetProfile = buildProfile(targetLogs);
    const logsByUser = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      const bucket = logsByUser.get(log.userId) ?? [];
      bucket.push(log);
      logsByUser.set(log.userId, bucket);
    }

    const matches = allUsers
      .filter((user) => user._id !== args.userId)
      .map((user) => {
        const userLogs = logsByUser.get(user._id) ?? [];
        const profile = buildProfile(userLogs);
        const sharedArtists = targetProfile.artistNames.filter((artist) =>
          profile.artistNames.includes(artist),
        );
        const sharedShows = targetProfile.showIds.filter((showId) => profile.showIds.includes(showId));

        return {
          userId: user._id,
          handle: user.handle,
          avatarColor: user.avatarColor,
          score: tasteScore(targetProfile.artistNames, profile.artistNames, sharedShows.length, {
            genresA: targetProfile.genres,
            genresB: profile.genres,
            venuesA: targetProfile.venueNames,
            venuesB: profile.venueNames,
          }),
          sharedArtistNames: sharedArtists,
          sharedShowCount: sharedShows.length,
          sharedShowTitles: targetProfile.showTitles.filter((title) =>
            profile.showTitles.includes(title),
          ),
        };
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return matches;
  },
});
