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
    homeCity: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", args.handle))
      .unique();

    if (existing) {
      // Backfill onboarding choices onto an existing row without overwriting
      // anything the user already set.
      const patch: Partial<{ homeCity: string; visibility: "public" | "private" }> = {};
      if (args.homeCity && !existing.homeCity) patch.homeCity = args.homeCity;
      if (args.visibility && !existing.visibility) patch.visibility = args.visibility;
      if (Object.keys(patch).length) {
        await ctx.db.patch(existing._id, patch);
        return ctx.db.get(existing._id);
      }
      return existing;
    }

    const userId = await ctx.db.insert("users", {
      handle: args.handle,
      avatarColor: args.avatarColor ?? colorFromHandle(args.handle),
      isFake: false,
      homeCity: args.homeCity,
      visibility: args.visibility ?? "public",
      claimed: false,
    });

    return ctx.db.get(userId);
  },
});

// Live availability check for the identity step (design 03).
export const checkHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const handle = args.handle.trim().toLowerCase();
    if (!handle) return { available: false, suggestion: null };
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique();
    if (!existing) return { available: true, suggestion: null };

    for (const suffix of ["_nyc", "_sf", String((handle.length * 7) % 90 + 10)]) {
      const candidate = `${handle}${suffix}`.slice(0, 20);
      const taken = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", candidate))
        .unique();
      if (!taken) return { available: false, suggestion: candidate };
    }
    return { available: false, suggestion: null };
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

// Resolve handles to ids so an agent can name its squad in human terms rather
// than juggling opaque document ids across three separate token holders.
export const idsByHandles = query({
  args: { handles: v.array(v.string()) },
  handler: async (ctx, args) => {
    const wanted = args.handles.map((handle) => handle.trim().replace(/^@+/, "").toLowerCase());
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => wanted.includes(user.handle.toLowerCase()))
      .map((user) => user._id);
  },
});
