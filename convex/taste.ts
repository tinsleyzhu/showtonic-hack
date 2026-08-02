import { query } from "./_generated/server";
import { v } from "convex/values";
import { tasteScore } from "./tasteMath.js";

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildProfile(logs: Array<{ showId: string; showTitle: string; artistNames: string[] }>) {
  const artistNames = unique(logs.flatMap((log) => log.artistNames));
  const showIds = unique(logs.map((log) => log.showId));
  const showTitles = unique(logs.map((log) => log.showTitle));

  return {
    artistNames,
    showIds,
    showTitles,
  };
}

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
          score: tasteScore(targetProfile.artistNames, profile.artistNames, sharedShows.length),
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
