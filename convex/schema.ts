import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Hackathon schema. Deliberately DENORMALIZED — Convex has no joins, and the
// taste-twin algorithm needs artist names on the log so it can run in one pass.
export default defineSchema({
  artists: defineTable({
    jambaseId: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    genres: v.array(v.string()),
    hometown: v.optional(v.string()),
    bio: v.optional(v.string()),
    topTrack: v.optional(v.string()), // preview/embed url
    jambaseUrl: v.optional(v.string()), // sponsor attribution
  }).index("by_jambase", ["jambaseId"]),

  venues: defineTable({
    jambaseId: v.string(),
    name: v.string(),
    city: v.string(),
    region: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    image: v.optional(v.string()),
  }).index("by_jambase", ["jambaseId"]),

  shows: defineTable({
    jambaseId: v.string(),
    title: v.string(),
    date: v.string(), // ISO date
    venueName: v.string(),
    city: v.string(),
    image: v.optional(v.string()),
    festivalId: v.optional(v.string()), // "outside-lands-2026" groups the lineup
    stage: v.optional(v.string()),
    isHeadliner: v.optional(v.boolean()),
    artistIds: v.array(v.id("artists")),
    artistNames: v.array(v.string()), // denormalized
    jambaseUrl: v.optional(v.string()),
  })
    .index("by_festival", ["festivalId"])
    .index("by_date", ["date"])
    .index("by_jambase", ["jambaseId"]),

  users: defineTable({
    handle: v.string(),
    avatarColor: v.string(),
    isFake: v.boolean(), // seeded demo users for taste matching
  }).index("by_handle", ["handle"]),

  logs: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    rating: v.number(), // 0.5 - 5.0, half steps
    vibes: v.array(v.string()),
    note: v.optional(v.string()),
    // denormalized so the diary grid and taste matching need no lookups
    showTitle: v.string(),
    showDate: v.string(),
    showImage: v.optional(v.string()),
    artistNames: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_show", ["showId"]),

  media: defineTable({
    logId: v.id("logs"),
    userId: v.id("users"),
    showId: v.id("shows"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("photo"), v.literal("video")),
    caption: v.optional(v.string()),
  })
    .index("by_log", ["logId"])
    .index("by_show", ["showId"])
    .index("by_user", ["userId"]),
});
