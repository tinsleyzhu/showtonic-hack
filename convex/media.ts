import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { inferMediaKind } from "./mediaUtils.js";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const attach = mutation({
  args: {
    logId: v.id("logs"),
    userId: v.id("users"),
    showId: v.id("shows"),
    storageId: v.id("_storage"),
    contentType: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("photo"), v.literal("video"))),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log) {
      throw new Error("Log not found");
    }

    if (log.userId !== args.userId || log.showId !== args.showId) {
      throw new Error("Media must match the target log");
    }

    const show = await ctx.db.get(args.showId);
    const user = await ctx.db.get(args.userId);
    if (!show || !user) {
      throw new Error("Missing user or show");
    }

    return ctx.db.insert("media", {
      logId: args.logId,
      userId: args.userId,
      showId: args.showId,
      storageId: args.storageId,
      kind: args.kind ?? inferMediaKind(args.contentType),
      caption: args.caption,
    });
  },
});

export const listByLog = query({
  args: {
    logId: v.id("logs"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db
      .query("media")
      .withIndex("by_log", (q) => q.eq("logId", args.logId))
      .collect();

    return Promise.all(
      media.map(async (item) => ({
        ...item,
        url: await ctx.storage.getUrl(item.storageId),
      })),
    );
  },
});
