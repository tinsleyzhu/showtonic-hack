import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function colorFromHandle(handle: string) {
  let hash = 0;
  for (const char of handle) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}

export const getOrCreate = mutation({
  args: {
    handle: v.string(),
    avatarColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique();

    if (existing) {
      return existing;
    }

    const userId = await ctx.db.insert("users", {
      handle: args.handle,
      avatarColor: args.avatarColor ?? colorFromHandle(args.handle),
      isFake: false,
    });

    return ctx.db.get(userId);
  },
});

export const getByHandle = query({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique();
  },
});

export const login = mutation({
  args: {
    handle: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique();
  },
});

export const listFake = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isFake"), true))
      .collect();
  },
});
