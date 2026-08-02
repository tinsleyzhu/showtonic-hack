import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";

type AttendanceStatus = "interested" | "going" | "logged";

export async function upsertAttendance(
  ctx: MutationCtx,
  userId: Id<"users">,
  showId: Id<"shows">,
  status: AttendanceStatus,
  updatedAt = Date.now(),
) {
  const [user, show] = await Promise.all([ctx.db.get(userId), ctx.db.get(showId)]);
  if (!user || !show) {
    throw new Error("Missing user or show");
  }

  const existing = await ctx.db
    .query("attendance")
    .withIndex("by_user_show", (q) => q.eq("userId", userId).eq("showId", showId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { status, updatedAt });
    return existing._id;
  }

  return ctx.db.insert("attendance", { userId, showId, status, updatedAt });
}

export const set = mutation({
  args: {
    userId: v.id("users"),
    showId: v.id("shows"),
    status: v.union(v.literal("interested"), v.literal("going"), v.literal("logged")),
  },
  handler: async (ctx, args) => {
    return upsertAttendance(ctx, args.userId, args.showId, args.status);
  },
});
