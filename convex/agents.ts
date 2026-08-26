import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Agent identity for Showtonic's MCP surface.
//
// Humans here still sign in with nothing but a localStorage handle — that was a
// deliberate hackathon choice and it stays. Agents are the opposite: every call
// carries a scoped, revocable bearer token bound to one user.
//
// Only the SHA-256 of the token is stored. Hashing happens at the edge (browser
// at mint time, Worker at verify time) because Convex mutations are
// deterministic and Web Crypto belongs outside them. A leaked row cannot be
// replayed: there is no plaintext to steal.

export const SCOPES = [
  "read:shows",
  "read:taste",
  "write:attendance",
  "write:logs",
  "write:candidates",
  "pay",
] as const;

// `pay` is never granted implicitly. An agent that can plan a night is not
// thereby an agent that can spend money on one.
const DEFAULT_SCOPES = ["read:shows", "read:taste", "write:attendance", "write:candidates"];

function assertScopes(scopes: string[]) {
  const allowed = new Set<string>(SCOPES);
  const unknown = scopes.filter((scope) => !allowed.has(scope));
  if (unknown.length) throw new Error(`Unknown scope(s): ${unknown.join(", ")}`);
  if (!scopes.length) throw new Error("A token with no scopes can do nothing — pick at least one");
}

export const mint = mutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(), // caller hashes; plaintext never reaches the server
    label: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Unknown user");
    if (!/^[0-9a-f]{64}$/.test(args.tokenHash)) throw new Error("tokenHash must be SHA-256 hex");
    const label = args.label.trim().slice(0, 60) || "agent";
    const scopes = args.scopes?.length ? args.scopes : DEFAULT_SCOPES;
    assertScopes(scopes);

    const tokenId = await ctx.db.insert("agentTokens", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      label,
      scopes,
      revoked: false,
      createdAt: Date.now(),
    });
    return { tokenId, label, scopes };
  },
});

// The Worker's auth check. Returns the bearer's identity and scopes, or null —
// never an error, so a bad token is indistinguishable in timing from an unknown
// one and callers cannot probe for valid hashes.
export const verifyByHash = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agentTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row || row.revoked) return null;
    const user = await ctx.db.get(row.userId);
    if (!user) return null;
    return {
      tokenId: row._id,
      userId: row.userId,
      handle: user.handle,
      label: row.label,
      scopes: row.scopes,
    };
  },
});

// Separate from verifyByHash so the read path stays a query (cacheable, no
// write amplification on every tool call).
export const touch = mutation({
  args: { tokenId: v.id("agentTokens") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (!row || row.revoked) return { ok: false };
    await ctx.db.patch(args.tokenId, { lastUsedAt: Date.now() });
    return { ok: true };
  },
});

export const listMine = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Never returns tokenHash — nothing about the credential leaves the server.
    return rows
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((row) => ({
        _id: row._id,
        label: row.label,
        scopes: row.scopes,
        revoked: row.revoked,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? null,
      }));
  },
});

export const revoke = mutation({
  args: { userId: v.id("users"), tokenId: v.id("agentTokens") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.tokenId);
    if (!row || row.userId !== args.userId) throw new Error("Token not found");
    await ctx.db.patch(args.tokenId, { revoked: true });
    return { ok: true };
  },
});

// The taste profile an agent reads before it can argue for a show on your
// behalf. Derived from real logs, not a self-declared preference list.
export const tasteProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Unknown user");
    const logs = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const tally = (values: string[]) => {
      const counts = new Map<string, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
      return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([name, count]) => ({ name, count }));
    };

    const rated = logs.filter((log) => log.rating > 0);
    const loved = logs.filter((log) => log.rating >= 4);

    return {
      handle: user.handle,
      homeCity: user.homeCity ?? null,
      showsLogged: logs.length,
      // Under five logged shows the app hides averages rather than implying a
      // pattern from three data points; the agent surface keeps that promise.
      averageRating:
        rated.length >= 5
          ? Number((rated.reduce((sum, log) => sum + log.rating, 0) / rated.length).toFixed(2))
          : null,
      lowSignal: logs.length < 5,
      topGenres: tally(logs.flatMap((log) => log.artistGenres ?? [])).slice(0, 8),
      topArtists: tally(logs.flatMap((log) => log.artistNames ?? [])).slice(0, 12),
      topVenues: tally(logs.map((log) => log.venueName ?? "").filter(Boolean)).slice(0, 8),
      lovedArtists: [...new Set(loved.flatMap((log) => log.artistNames ?? []))].slice(0, 12),
      recent: logs
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 5)
        .map((log) => ({
          show: log.showTitle,
          date: log.showDate,
          venue: log.venueName ?? null,
          rating: log.rating || null,
        })),
    };
  },
});

// --- The flagship agent tool -------------------------------------------------
// reclaim_camera_roll: a visitor's own agent hands Showtonic's fleet the
// METADATA from a camera roll — timestamps and, where the photo kept them,
// coordinates. Pixels never cross the boundary. We cluster the nights, score
// them against the catalog, and leave candidates for the human to approve.
//
// This runs the same scorer as the browser scan (convex/backfillMatch.js), so a
// night matched by an agent and a night matched in the UI get identical
// evidence and identical confidence.
import { clusterPhotosIntoNights, matchClustersToShows, unmatchedClusters } from "./backfillMatch.js";
import { insertVerifiedLog } from "./logs";

export const reclaimCameraRoll = mutation({
  args: {
    userId: v.id("users"),
    photos: v.array(
      v.object({
        takenAt: v.string(), // local wall-clock ISO, no timezone suffix
        name: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
      }),
    ),
    today: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.photos.length) throw new Error("No photo metadata supplied");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Unknown user");

    const [shows, venues, logs] = await Promise.all([
      ctx.db.query("shows").collect(),
      ctx.db.query("venues").collect(),
      ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect(),
    ]);
    const venuesById = new Map(venues.map((venue) => [venue._id, venue]));

    const catalog = shows.map((show) => {
      const venue = show.venueId ? venuesById.get(show.venueId) : undefined;
      return {
        id: show._id,
        date: show.date,
        title: show.title,
        artistNames: show.artistNames,
        venueId: show.venueId,
        venueName: show.venueName,
        venueLatitude: venue?.latitude,
        venueLongitude: venue?.longitude,
        city: show.city,
        image: show.image,
      };
    });

    const clusters = clusterPhotosIntoNights(args.photos);
    const candidates = matchClustersToShows(clusters, catalog, {
      today: args.today ?? new Date(Date.now()).toISOString().slice(0, 10),
      // The agent's owner still gets their own taste and venue history applied.
      tasteArtists: [...new Set(logs.flatMap((log) => log.artistNames ?? []))],
      visitedVenueIds: [...new Set(logs.map((log) => log.showId))],
    });

    // Replace still-pending candidates; resolved ones are history.
    const pending = await ctx.db
      .query("backfillCandidates")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId).eq("status", "pending"))
      .collect();
    await Promise.all(pending.map((row) => ctx.db.delete(row._id)));

    const loggedShowIds = new Set(logs.map((log) => log.showId));
    const now = Date.now();
    const saved = [];
    for (const candidate of candidates) {
      if (loggedShowIds.has(candidate.showId as never)) continue; // already in the diary
      const _id = await ctx.db.insert("backfillCandidates", {
        userId: args.userId,
        showId: candidate.showId as never,
        clusterDate: candidate.clusterDate,
        photoCount: candidate.photoCount,
        captureWindow: candidate.captureWindow,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        status: "pending",
        createdAt: now,
      });
      saved.push({
        candidateId: _id,
        clusterDate: candidate.clusterDate,
        show: candidate.showTitle,
        venue: candidate.venueName ?? null,
        confidence: candidate.confidence,
        evidence: candidate.evidence.map((row: { detail: string }) => row.detail),
      });
    }

    // Nights we could not place are not a failure — they are the catalog-gap
    // agent's queue, and we say so rather than silently dropping them.
    const gaps = unmatchedClusters(clusters, candidates).map((cluster: { clusterDate: string; photoCount: number; gps: unknown }) => ({
      clusterDate: cluster.clusterDate,
      photoCount: cluster.photoCount,
      hasLocation: Boolean(cluster.gps),
    }));

    return {
      photosRead: args.photos.length,
      nightsFound: clusters.length,
      candidates: saved,
      unmatchedNights: gaps,
      note: "Nothing enters the diary until the human approves it. Call get_pending_candidates then resolve_candidate.",
    };
  },
});

// Approve or reject one candidate. The write that turns archaeology into a diary
// entry — and the reason this surface is not read-only.
export const resolveCandidate = mutation({
  args: {
    userId: v.id("users"),
    candidateId: v.id("backfillCandidates"),
    action: v.union(v.literal("accept"), v.literal("reject")),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate || candidate.userId !== args.userId) throw new Error("Candidate not found");
    if (candidate.status !== "pending") return { status: candidate.status, logId: null };

    if (args.action === "reject") {
      await ctx.db.patch(candidate._id, { status: "rejected" });
      return { status: "rejected", logId: null };
    }
    if (!candidate.showId) throw new Error("This candidate has no show to accept");
    if (args.rating !== undefined && (args.rating < 0.5 || args.rating > 5 || !Number.isInteger(args.rating * 2))) {
      throw new Error("Rating must be 0.5-5 in half-star steps");
    }

    const existing = await ctx.db
      .query("logs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("showId"), candidate.showId))
      .unique();

    const logId =
      existing?._id ??
      (await insertVerifiedLog(ctx, {
        userId: args.userId,
        showId: candidate.showId,
        rating: args.rating ?? 0,
        vibes: [],
        source: "reclaim",
      }));

    await ctx.db.patch(candidate._id, { status: "accepted" });
    return { status: "accepted", logId };
  },
});
