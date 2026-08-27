import { query } from "./_generated/server";
import { v } from "convex/values";
import { buildRecap } from "./recapSummary.js";

// Recap — the diary as something a person wants to post.
//
// This is deliberately a QUERY and not a screen-only helper: the member's own
// agent reads it through the `generate_recap` MCP tool, and the share card on
// Profile renders the identical object. One source, so an agent that says "you
// went to 31 shows" and a card that says 29 cannot both exist.
//
// Nothing here decides anything — the counting and the copy live in the pure
// `recapSummary.js` so they are testable without a deployment.

const MAX_PHOTOS = 6;

export const build = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const logs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const summary = buildRecap(logs, { limit: args.limit });

    // Empty-room rule, enforced at the source rather than in each caller: a
    // member with no logs gets a recap that says so and carries nothing else.
    if (summary.empty) {
      return { handle: user.handle, avatarColor: user.avatarColor, ...summary, photos: [] };
    }

    // The member's OWN photos, best nights first. A recap card illustrated with
    // catalog press shots is a poster; illustrated with their photos it is
    // theirs. Falls back to the show artwork in the renderer when a diary has
    // no uploaded media at all, which is the common case today.
    const ratingByLog = new Map(logs.map((log) => [log._id, log.rating ?? 0]));
    const dateByLog = new Map(logs.map((log) => [log._id, log.showDate ?? ""]));
    const media = await ctx.db
      .query("media")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const photos = await Promise.all(
      media
        .filter((item) => item.kind === "photo" && ratingByLog.has(item.logId))
        .sort(
          (left, right) =>
            (ratingByLog.get(right.logId) ?? 0) - (ratingByLog.get(left.logId) ?? 0) ||
            (dateByLog.get(right.logId) ?? "").localeCompare(dateByLog.get(left.logId) ?? ""),
        )
        .slice(0, MAX_PHOTOS)
        .map(async (item) => ({
          url: await ctx.storage.getUrl(item.storageId),
          caption: item.caption ?? null,
          date: dateByLog.get(item.logId) ?? "",
        })),
    );

    return {
      handle: user.handle,
      avatarColor: user.avatarColor,
      ...summary,
      photos: photos.filter((photo) => photo.url),
    };
  },
});
