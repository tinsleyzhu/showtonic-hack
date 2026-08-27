import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { summarizeRatings } from "./showtonicUtils.js";
import { looksLikeDroppedVenueInference } from "./freeEventsUtils.js";

// Artists that importUpcoming created as stubs (no image or no genres) and that
// the free-source enricher (convex/freeEvents.ts) should fill from Spotify /
// MusicBrainz. Cheap scan — the hackathon catalog is small.
export const listNeedingEnrichment = query({
  args: { limit: v.optional(v.number()), upcomingOnly: v.optional(v.boolean()), today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const [artists, shows] = await Promise.all([
      ctx.db.query("artists").collect(),
      ctx.db.query("shows").collect(),
    ]);

    // Enrichment is rate-limited upstream (MusicBrainz allows one request a
    // second), so the order matters more than the batch size: spend it on the
    // artists a member will actually be shown. Rank by how many catalog shows
    // an artist appears on, counting upcoming ones double.
    const today = args.today ?? new Date(Date.now()).toISOString().slice(0, 10);
    const weight = new Map<string, number>();
    // Venue names + show titles per artist, for the genre-inference fallback
    // (convex/freeEventsUtils.js:inferGenresFromContext) when neither Spotify
    // nor MusicBrainz has heard of the act. Collected here since `shows` is
    // already in memory for the weight pass.
    const venueNames = new Map<string, Set<string>>();
    const titles = new Map<string, Set<string>>();
    for (const show of shows) {
      const bump = show.date >= today ? 2 : 1;
      for (const artistId of show.artistIds) {
        weight.set(artistId, (weight.get(artistId) ?? 0) + bump);
        if (!venueNames.has(artistId)) venueNames.set(artistId, new Set());
        if (!titles.has(artistId)) titles.set(artistId, new Set());
        if (show.venueName) venueNames.get(artistId)!.add(show.venueName);
        if (show.title) titles.get(artistId)!.add(show.title);
      }
    }

    return artists
      .filter((artist) => !artist.image || artist.genres.length === 0)
      .filter((artist) => (args.upcomingOnly ? (weight.get(artist._id) ?? 0) > 0 : true))
      .sort((left, right) => (weight.get(right._id) ?? 0) - (weight.get(left._id) ?? 0))
      .slice(0, limit)
      .map((artist) => ({
        _id: artist._id,
        name: artist.name,
        venueNames: [...(venueNames.get(artist._id) ?? [])],
        titles: [...(titles.get(artist._id) ?? [])],
      }));
  },
});


// One-shot cleanup of the low-precision venue tags written before 6ea0240,
// when inference still tagged artists from broad rooms that book every genre
// (a support act at the Fillmore recorded as rock/pop on no evidence). A wrong
// genre is worse than no genre, and those rows skew every consumer.
//
// Idempotent and re-runnable: a cleared artist has no genres, so it no longer
// matches the predicate, and re-running is a no-op. It also goes straight back
// onto listNeedingEnrichment, so a false positive costs one re-lookup rather
// than losing real data. Run with dryRun first to see the count and samples.
export const clearInferredGenres = mutation({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 500, 1), 2000);
    const [artists, shows] = await Promise.all([
      ctx.db.query("artists").collect(),
      ctx.db.query("shows").collect(),
    ]);

    const venueNames = new Map<string, Set<string>>();
    const titles = new Map<string, Set<string>>();
    for (const show of shows) {
      for (const artistId of show.artistIds) {
        if (!venueNames.has(artistId)) venueNames.set(artistId, new Set());
        if (!titles.has(artistId)) titles.set(artistId, new Set());
        if (show.venueName) venueNames.get(artistId)!.add(show.venueName);
        if (show.title) titles.get(artistId)!.add(show.title);
      }
    }

    const withGenresBefore = artists.filter((artist) => (artist.genres ?? []).length > 0).length;
    const suspect = artists.filter((artist) =>
      looksLikeDroppedVenueInference({
        genres: artist.genres ?? [],
        venueNames: [...(venueNames.get(artist._id) ?? [])],
        titles: [...(titles.get(artist._id) ?? [])],
      }),
    );

    const batch = suspect.slice(0, limit);
    if (!args.dryRun) {
      for (const artist of batch) await ctx.db.patch(artist._id, { genres: [] });
    }

    return {
      dryRun: args.dryRun ?? false,
      total: artists.length,
      withGenresBefore,
      matched: suspect.length,
      cleared: args.dryRun ? 0 : batch.length,
      remaining: suspect.length - batch.length, // re-run to finish
      withGenresAfter: args.dryRun ? withGenresBefore : withGenresBefore - batch.length,
      samples: batch.slice(0, 10).map((artist) => ({
        name: artist.name,
        genres: artist.genres,
        venues: [...(venueNames.get(artist._id) ?? [])].slice(0, 3),
      })),
    };
  },
});

// Patch enrichment fields without clobbering anything already present.
export const enrich = mutation({
  args: {
    artistId: v.id("artists"),
    image: v.optional(v.string()),
    genres: v.optional(v.array(v.string())),
    hometown: v.optional(v.string()),
    bio: v.optional(v.string()),
    topTrack: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artist = await ctx.db.get(args.artistId);
    if (!artist) return { patched: false };
    const patch: Record<string, unknown> = {};
    if (args.image && !artist.image) patch.image = args.image;
    if (args.genres && args.genres.length && artist.genres.length === 0) patch.genres = args.genres;
    if (args.hometown && !artist.hometown) patch.hometown = args.hometown;
    if (args.bio && !artist.bio) patch.bio = args.bio;
    if (args.topTrack && !artist.topTrack) patch.topTrack = args.topTrack;
    if (Object.keys(patch).length === 0) return { patched: false };
    await ctx.db.patch(args.artistId, patch);
    return { patched: true };
  },
});

// Public taste-seed grid for onboarding step 2 (design 04): the catalog's most
// booked artists, no identity required.
export const forOnboarding = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 18, 48);
    const shows = await ctx.db.query("shows").collect();
    const counts = new Map<Id<"artists">, number>();
    for (const show of shows) {
      for (const artistId of show.artistIds) {
        counts.set(artistId, (counts.get(artistId) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit);
    const artists = await Promise.all(
      ranked.map(async ([artistId, showCount]) => {
        const artist = await ctx.db.get(artistId);
        if (!artist) return null;
        return {
          _id: artist._id,
          name: artist.name,
          image: artist.image,
          genres: artist.genres,
          showCount,
        };
      }),
    );
    return artists.filter((artist) => artist !== null);
  },
});

export const get = query({
  args: {
    artistId: v.id("artists"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const artist = await ctx.db.get(args.artistId);
    if (!artist) {
      return null;
    }

    const allShows = await ctx.db.query("shows").collect();
    const shows = allShows.filter((show) => show.artistIds.includes(args.artistId));
    const showIds = new Set(shows.map((show) => show._id));
    const [allLogs, allMedia, followers, currentFollow] = await Promise.all([
      ctx.db.query("logs").collect(),
      ctx.db.query("media").collect(),
      ctx.db
        .query("artistFollows")
        .withIndex("by_artist", (q) => q.eq("artistId", args.artistId))
        .collect(),
      args.userId
        ? ctx.db
            .query("artistFollows")
            .withIndex("by_user_artist", (q) =>
              q.eq("userId", args.userId!).eq("artistId", args.artistId),
            )
            .unique()
        : null,
    ]);
    const logs = allLogs.filter((log) => showIds.has(log.showId));
    const media = allMedia.filter((item) => showIds.has(item.showId));
    const [users, mediaWithUrls] = await Promise.all([
      Promise.all(logs.map((log) => ctx.db.get(log.userId))),
      Promise.all(
        media.map(async (item) => ({ ...item, url: await ctx.storage.getUrl(item.storageId) })),
      ),
    ]);

    // "Your artist history" receipt (design 23): the user's verified logs for
    // this artist — count, first-seen year, personal average.
    const yourLogs = args.userId ? logs.filter((log) => log.userId === args.userId) : [];
    const yourRated = yourLogs.filter((log) => log.rating > 0);
    const firstSeen = yourLogs.map((log) => log.showDate).sort()[0];

    // Attendance flags let the UI render your nights vivid and the rest as
    // reclaimable ghost tiles (design 23).
    const attendanceByShow = new Map<string, string>();
    if (args.userId) {
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .collect();
      for (const row of attendance) attendanceByShow.set(row.showId, row.status);
    }

    return {
      artist,
      shows: shows
        .map((show) => ({ ...show, attendanceStatus: attendanceByShow.get(show._id) }))
        .sort((left, right) => left.date.localeCompare(right.date)),
      followerCount: followers.length,
      isFollowing: Boolean(currentFollow),
      ...summarizeRatings(logs),
      yourHistory: yourLogs.length
        ? {
            showCount: yourLogs.length,
            firstSeenYear: firstSeen ? firstSeen.slice(0, 4) : null,
            averageRating: yourRated.length
              ? Math.round((yourRated.reduce((sum, log) => sum + log.rating, 0) / yourRated.length) * 10) / 10
              : null,
          }
        : null,
      reviews: logs
        .map((log, index) => ({ ...log, user: users[index] }))
        .sort((left, right) => right.createdAt - left.createdAt),
      media: mediaWithUrls,
    };
  },
});

function tallyCoverage(artists: { genres?: string[] }[]) {
  const withGenres = artists.filter((artist) => (artist.genres ?? []).length > 0);
  const genreTally = new Map<string, number>();
  for (const artist of withGenres) {
    for (const genre of artist.genres ?? []) genreTally.set(genre, (genreTally.get(genre) ?? 0) + 1);
  }
  return {
    total: artists.length,
    withGenres: withGenres.length,
    missing: artists.length - withGenres.length,
    coveragePct: artists.length ? Math.round((withGenres.length / artists.length) * 1000) / 10 : 0,
    distinctGenres: genreTally.size,
    topGenres: [...genreTally.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count })),
  };
}

// Enrichment coverage. Genre-first onboarding needs genres, and the JamBase
// event sync inserts artists with an empty genres array — it only ever learns
// names and images from the events endpoint. This reports the gap so the
// enrichment pass has a target and a finish line.
//
// `upcoming` is the number that actually matters: onboarding and taste only
// ever read artists playing upcoming shows in the member's city. Global
// coverage counts a decade of historical support acts nobody will be offered,
// so it can look bad while the user-visible surface is fully covered — or look
// fine while the next month is empty.
export const enrichmentCoverage = query({
  args: { city: v.optional(v.string()), today: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const today = args.today ?? new Date(Date.now()).toISOString().slice(0, 10);
    const [artists, shows] = await Promise.all([
      ctx.db.query("artists").collect(),
      ctx.db.query("shows").collect(),
    ]);

    const cityNeedle = args.city?.trim().toLowerCase();
    const upcomingArtistIds = new Set<string>();
    for (const show of shows) {
      if (show.date < today) continue;
      if (cityNeedle && show.city.toLowerCase() !== cityNeedle) continue;
      for (const artistId of show.artistIds) upcomingArtistIds.add(artistId);
    }

    return {
      ...tallyCoverage(artists),
      upcoming: {
        city: args.city ?? null,
        since: today,
        ...tallyCoverage(artists.filter((artist) => upcomingArtistIds.has(artist._id))),
      },
    };
  },
});
