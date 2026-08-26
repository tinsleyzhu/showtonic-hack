import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// v1.5 activity feed (design 21), derived from logs + attendance — no separate
// events table. "friends" = the rest of the community in this build (the
// contacts-based friend graph arrives with claimed accounts).

export const feed = query({
  args: {
    userId: v.id("users"),
    scope: v.union(v.literal("friends"), v.literal("you")),
  },
  handler: async (ctx, args) => {
    const [logs, attendance, likes] = await Promise.all([
      ctx.db.query("logs").order("desc").take(60),
      ctx.db.query("attendance").order("desc").take(60),
      ctx.db.query("reviewLikes").collect(),
    ]);

    const mine = (userId: string) => userId === args.userId;
    const inScope = (userId: string) => (args.scope === "you" ? mine(userId) : !mine(userId));

    const likeCounts = new Map<string, number>();
    const likedByMe = new Set<string>();
    for (const like of likes) {
      likeCounts.set(like.logId, (likeCounts.get(like.logId) ?? 0) + 1);
      if (like.userId === args.userId) likedByMe.add(like.logId);
    }

    const logEvents = await Promise.all(
      logs
        .filter((log) => inScope(log.userId))
        .map(async (log) => {
          const user = await ctx.db.get(log.userId);
          return {
            kind: "logged" as const,
            id: String(log._id),
            logId: log._id,
            showId: log.showId,
            user: user ? { handle: user.handle, avatarColor: user.avatarColor } : null,
            show: {
              title: log.showTitle,
              artistNames: log.artistNames,
              venueName: log.venueName,
              date: log.showDate,
              image: log.showImage,
            },
            rating: log.rating,
            reviewExcerpt: log.note ?? "",
            likeCount: likeCounts.get(log._id) ?? 0,
            likedByMe: likedByMe.has(log._id),
            createdAt: log.createdAt,
          };
        }),
    );

    const goingEvents = await Promise.all(
      attendance
        .filter((row) => inScope(row.userId) && row.status !== "logged")
        .map(async (row) => {
          const [user, show] = await Promise.all([ctx.db.get(row.userId), ctx.db.get(row.showId)]);
          if (!show) return null;
          return {
            kind: "going" as const,
            id: String(row._id),
            logId: null,
            showId: row.showId,
            user: user ? { handle: user.handle, avatarColor: user.avatarColor } : null,
            show: {
              title: show.title,
              artistNames: show.artistNames,
              venueName: show.venueName,
              date: show.date,
              image: show.image,
            },
            status: row.status,
            rating: 0,
            reviewExcerpt: "",
            likeCount: 0,
            likedByMe: false,
            createdAt: row.updatedAt ?? 0,
          };
        }),
    );

    return [...logEvents, ...goingEvents.filter((event) => event !== null)]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 20);
  },
});

export const toggleLike = mutation({
  args: {
    userId: v.id("users"),
    logId: v.id("logs"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reviewLikes")
      .withIndex("by_user_log", (q) => q.eq("userId", args.userId).eq("logId", args.logId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    }
    await ctx.db.insert("reviewLikes", { userId: args.userId, logId: args.logId });
    return { liked: true };
  },
});