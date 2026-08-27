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
    // Where `genres` came from: "spotify" | "musicbrainz" | "ticketmaster" |
    // "context" (venue/title inference) | "web-search". Nothing reads this
    // today; it exists so a tag's confidence can be judged later, since a
    // web-searched genre is weaker evidence than a Spotify one.
    genreSource: v.optional(v.string()),
  }).index("by_jambase", ["jambaseId"]),

  venues: defineTable({
    jambaseId: v.string(),
    name: v.string(),
    city: v.string(),
    region: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    image: v.optional(v.string()),
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    jambaseUrl: v.optional(v.string()),
  }).index("by_jambase", ["jambaseId"]),

  shows: defineTable({
    jambaseId: v.string(),
    title: v.string(),
    date: v.string(), // ISO date
    day: v.optional(v.string()),
    time: v.optional(v.string()),
    startTime: v.optional(v.string()), // local HH:mm from JamBase
    memoryPrompt: v.optional(v.string()),
    ticketUrl: v.optional(v.string()),
    venueId: v.optional(v.id("venues")),
    venueName: v.string(),
    city: v.string(),
    region: v.optional(v.string()),
    image: v.optional(v.string()),
    festivalId: v.optional(v.string()), // "outside-lands-2026" groups the lineup
    stage: v.optional(v.string()),
    isHeadliner: v.optional(v.boolean()),
    artistIds: v.array(v.id("artists")),
    artistNames: v.array(v.string()), // denormalized
    artistJambaseIds: v.optional(v.array(v.string())),
    jambaseUrl: v.optional(v.string()),
  })
    .index("by_festival", ["festivalId"])
    .index("by_date", ["date"])
    .index("by_city_date", ["city", "date"])
    .index("by_jambase", ["jambaseId"]),

  users: defineTable({
    handle: v.string(),
    avatarColor: v.string(),
    isFake: v.boolean(), // seeded demo users for taste matching
    homeCity: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    claimed: v.optional(v.boolean()), // account claimed with email/Apple (v1.5 stub)
    tasteArtistIds: v.optional(v.array(v.id("artists"))), // onboarding taste seed
  }).index("by_handle", ["handle"]),

  logs: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    rating: v.number(), // 0.5 - 5.0, half steps
    vibes: v.array(v.string()),
    note: v.optional(v.string()),
    caption: v.optional(v.string()),
    song: v.optional(v.string()),
    // denormalized so the diary grid and taste matching need no lookups
    showTitle: v.string(),
    showDate: v.string(),
    showImage: v.optional(v.string()),
    artistNames: v.array(v.string()),
    venueName: v.optional(v.string()),
    city: v.optional(v.string()),
    artistGenres: v.optional(v.array(v.string())),
    // how this log entered the diary — powers backfill/reclaim receipts
    source: v.optional(
      v.union(
        v.literal("live"),
        v.literal("backfill"),
        v.literal("reclaim"),
        v.literal("morning_after"),
      ),
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_show", ["showId"]),

  attendance: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    status: v.union(v.literal("interested"), v.literal("going"), v.literal("logged")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_show", ["showId"])
    .index("by_user_show", ["userId", "showId"]),

  artistFollows: defineTable({
    userId: v.id("users"),
    artistId: v.id("artists"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_artist", ["artistId"])
    .index("by_user_artist", ["userId", "artistId"]),

  venueFollows: defineTable({
    userId: v.id("users"),
    venueId: v.id("venues"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_venue", ["venueId"])
    .index("by_user_venue", ["userId", "venueId"]),

  // Pin up to 4 all-time favorite shows atop the diary (design 19).
  favorites: defineTable({
    userId: v.id("users"),
    showId: v.id("shows"),
    logId: v.id("logs"),
    rank: v.number(), // 1–4
  }).index("by_user", ["userId"]),

  // Saved shows/artists/venues; upcoming ones surface in Discover.
  watchlist: defineTable({
    userId: v.id("users"),
    targetType: v.union(v.literal("show"), v.literal("artist"), v.literal("venue")),
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_target", ["userId", "targetType", "targetId"]),

  // Client-computed photo-scan matches awaiting confirmation (designs 08–11).
  // Only metadata lands here — original photos never upload.
  backfillCandidates: defineTable({
    userId: v.id("users"),
    showId: v.optional(v.id("shows")),
    clusterDate: v.string(), // ISO date of the night
    photoCount: v.number(),
    captureWindow: v.optional(v.string()), // "10:22 PM–12:14 AM"
    confidence: v.number(), // 0–1
    // Why the matcher believes this — rendered as the evidence card's rows.
    // Derived strings only: raw photo coordinates stay on the device.
    evidence: v.optional(
      v.array(
        v.object({
          kind: v.string(), // date | gps | volume | taste | venue | vision | web
          detail: v.string(),
          delta: v.number(),
        }),
      ),
    ),
    // Draft-writer output (phase 3) — pre-fills the accept sheet.
    draft: v.optional(
      v.object({
        caption: v.optional(v.string()),
        vibes: v.optional(v.array(v.string())),
      }),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("reassigned"),
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  // Nights the catalog could not explain, as answered by the catalog-gap agent
  // (`convex/catalogGap.ts`). A row here is a CLAIM, not a fact: it carries the
  // URL it came from and stays `pending` until a human approves it, at which
  // point it becomes a real show. Nothing in the app treats a proposal as
  // catalog data — that separation is the whole reason it is its own table.
  catalogProposals: defineTable({
    clusterDate: v.string(), // ISO date of the night that had no match
    venueName: v.optional(v.string()), // absent when the night carried no GPS
    city: v.optional(v.string()),
    artistNames: v.array(v.string()),
    sourceUrl: v.string(), // the receipt — always shown next to the claim
    sourceTitle: v.optional(v.string()),
    corroboratingUrls: v.optional(v.array(v.string())),
    confidence: v.number(), // 0–1, from catalogGapUtils.proposeFromResults
    evidence: v.optional(
      v.array(v.object({ kind: v.string(), detail: v.string(), delta: v.number() })),
    ),
    proposedBy: v.string(), // "catalog-gap-agent"
    requestedByUserId: v.optional(v.id("users")), // whose night raised the gap
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    showId: v.optional(v.id("shows")), // set when approved
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_date", ["clusterDate"])
    .index("by_date_status", ["clusterDate", "status"]),

  // Per-user agent tokens — the machine-auth story. Humans still sign in with
  // nothing but a localStorage handle; agents get a scoped, revocable
  // credential. Only the SHA-256 is stored: the plaintext is shown to the human
  // once at mint time and is unrecoverable after, so a leaked database row
  // cannot be replayed against the API.
  agentTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(), // SHA-256 hex of the bearer string
    label: v.string(), // what the human named this agent
    scopes: v.array(v.string()), // read:taste read:shows write:attendance write:logs write:candidates pay
    revoked: v.boolean(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_hash", ["tokenHash"])
    .index("by_user", ["userId"]),

  // A night three agents agreed on. The transcript is denormalized onto the row
  // because it IS the artefact: a human with no agent of their own needs to be
  // able to read how the decision got made.
  squadPlans: defineTable({
    userIds: v.array(v.id("users")),
    showId: v.id("shows"),
    showTitle: v.string(),
    showDate: v.string(),
    venueName: v.optional(v.string()),
    status: v.union(v.literal("proposed"), v.literal("confirmed"), v.literal("paid")),
    // What actually settled. "simulated" is a first-class value, not a failure:
    // no ticketing API here sells to agents, and saying so beats implying it.
    settlement: v.optional(v.union(v.literal("aisa"), v.literal("simulated"))),
    paymentRef: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    payerUserId: v.optional(v.id("users")),
    transcript: v.array(
      v.object({
        agent: v.string(), // the token's label — the agent's identity, not the human's
        handle: v.string(),
        message: v.string(),
        at: v.number(),
      }),
    ),
    createdAt: v.number(),
  }).index("by_show", ["showId"]),

  // v1.5 — likes on show logs/reviews in the activity feed (design 21).
  reviewLikes: defineTable({
    userId: v.id("users"),
    logId: v.id("logs"),
  })
    .index("by_log", ["logId"])
    .index("by_user_log", ["userId", "logId"]),

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

  // Metered third-party search credits, counted so a budget is enforced rather
  // than merely intended. Tavily credits are shared between consumers and
  // expire with the event, so a run that overspends takes them from another
  // lane. Keyed per consumer ("tavily:artists"), never shared.
  searchBudget: defineTable({
    key: v.string(),
    spent: v.number(),
    limit: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
