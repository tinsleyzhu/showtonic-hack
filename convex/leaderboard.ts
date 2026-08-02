import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    scope: v.union(v.literal("city"), v.literal("artist"), v.literal("venue")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [users, logs] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("logs").collect(),
    ]);
    const targetCity = logs.find((log) => log.userId === args.userId)?.city ?? "San Francisco";

    const rows = users
      .map((user) => {
        const userLogs = logs.filter((log) => log.userId === user._id);
        if (args.scope === "artist") {
          const score = new Set(userLogs.flatMap((log) => log.artistNames)).size;
          return {
            userId: user._id,
            handle: user.handle,
            avatarColor: user.avatarColor,
            score,
            value: `${score} artists`,
            note: `${userLogs.length} verified shows`,
          };
        }
        if (args.scope === "venue") {
          const score = new Set(userLogs.map((log) => log.venueName).filter(Boolean)).size;
          return {
            userId: user._id,
            handle: user.handle,
            avatarColor: user.avatarColor,
            score,
            value: `${score} venues`,
            note: `${userLogs.length} verified shows`,
          };
        }
        const score = userLogs.filter((log) => (log.city ?? "San Francisco") === targetCity).length;
        return {
          userId: user._id,
          handle: user.handle,
          avatarColor: user.avatarColor,
          score,
          value: `${score} shows`,
          note: targetCity,
        };
      })
      .filter((row) => row.score > 0 || row.userId === args.userId)
      .sort((left, right) => right.score - left.score || left.handle.localeCompare(right.handle));

    return {
      scope: args.scope,
      label: args.scope === "city" ? targetCity : `All seeded ${args.scope} activity`,
      rows,
    };
  },
});
