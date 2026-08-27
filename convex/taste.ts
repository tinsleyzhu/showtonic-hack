import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { genreWeights, LOW_SIGNAL_SHOWS, rankCompatiblePeers, tasteScore } from "./tasteMath.js";
import { rankOnboardingGenres } from "./onboardingGenres.js";

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildProfile(
  logs: Array<{
    showId: string;
    showTitle: string;
    artistNames: string[];
    artistGenres?: string[];
    venueName?: string;
  }>,
) {
  const artistNames = unique(logs.flatMap((log) => log.artistNames));
  const showIds = unique(logs.map((log) => log.showId));
  const showTitles = unique(logs.map((log) => log.showTitle));
  // Taste v2 signals: sparse until L1 enrichment lands, so tasteScore only
  // leans on these when both sides in a comparison actually have them.
  const genres = unique(logs.flatMap((log) => log.artistGenres ?? []));
  const venueNames = unique(logs.map((log) => log.venueName ?? "").filter(Boolean));

  return {
    artistNames,
    showIds,
    showTitles,
    genres,
    venueNames,
  };
}

// Taste match detail (design 22): the receipts behind a match percentage —
// shared artists with counts, both-there shows with each rating, and their
// top-rated logs for artists you haven't seen yet.
export const matchDetail = query({
  args: {
    userId: v.id("users"),
    otherUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [me, other, myLogs, otherLogs, allLogs] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.otherUserId),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.otherUserId))
        .collect(),
      // Genre rarity has to be measured against the same population `similar`
      // uses, or the list and this page would show two different percentages
      // for one pair of people, which reads as broken.
      ctx.db.query("logs").collect(),
    ]);
    if (!me || !other) return null;

    const myProfile = buildProfile(myLogs);
    const otherProfile = buildProfile(otherLogs);
    const genresByUser = new Map<string, string[]>();
    for (const log of allLogs) {
      const bucket = genresByUser.get(log.userId) ?? [];
      bucket.push(...(log.artistGenres ?? []));
      genresByUser.set(log.userId, bucket);
    }
    const weights = genreWeights([...genresByUser.values()]);
    const sharedShowIds = new Set(
      myProfile.showIds.filter((showId) => otherProfile.showIds.includes(showId)),
    );

    // Shared artists with how many of their shows the other person logged.
    const otherArtistCounts = new Map<string, number>();
    for (const log of otherLogs) {
      for (const name of new Set(log.artistNames)) {
        otherArtistCounts.set(name, (otherArtistCounts.get(name) ?? 0) + 1);
      }
    }
    const sharedArtists = myProfile.artistNames
      .filter((name) => otherProfile.artistNames.includes(name))
      .map((name) => ({ name, showCount: otherArtistCounts.get(name) ?? 1 }))
      .sort((left, right) => right.showCount - left.showCount);

    const myRatingByShow = new Map(myLogs.map((log) => [log.showId, log.rating]));
    const bothThere = otherLogs
      .filter((log) => sharedShowIds.has(log.showId))
      .map((log) => ({
        showId: log.showId,
        title: log.showTitle,
        artistNames: log.artistNames,
        venueName: log.venueName,
        date: log.showDate,
        image: log.showImage,
        theirRating: log.rating,
        yourRating: myRatingByShow.get(log.showId) ?? 0,
      }))
      .sort((left, right) => right.date.localeCompare(left.date));

    const myArtists = new Set(myProfile.artistNames.map((name) => name.toLowerCase()));
    const recommendations = otherLogs
      .filter(
        (log) =>
          log.rating >= 4.5 &&
          !log.artistNames.some((name) => myArtists.has(name.toLowerCase())),
      )
      .sort((left, right) => right.rating - left.rating)
      .slice(0, 4)
      .map((log) => ({
        showId: log.showId,
        artistName: log.artistNames[0] ?? log.showTitle,
        venueName: log.venueName,
        rating: log.rating,
      }));

    return {
      user: { _id: other._id, handle: other.handle, avatarColor: other.avatarColor, homeCity: other.homeCity ?? null },
      showCount: otherLogs.length,
      // tasteScore can exceed 1.0 (jaccard + shared-show bonus); a percentage
      // over 99 reads as broken, so clamp for display.
      matchPercent: Math.min(
        Math.round(
          tasteScore(myProfile.artistNames, otherProfile.artistNames, bothThere.length, {
            genresA: myProfile.genres,
            genresB: otherProfile.genres,
            venuesA: myProfile.venueNames,
            venuesB: otherProfile.venueNames,
            genreWeights: weights,
          }) * 100,
        ),
        99,
      ),
      sharedArtists,
      sharedArtistCount: sharedArtists.length,
      bothThereCount: bothThere.length,
      bothThere: bothThere.slice(0, 5),
      recommendations,
    };
  },
});

export const similar = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [targetUser, targetLogs, allUsers, allLogs] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("logs").collect(),
    ]);

    if (!targetUser) {
      return [];
    }

    const targetProfile = buildProfile(targetLogs);
    const logsByUser = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      const bucket = logsByUser.get(log.userId) ?? [];
      bucket.push(log);
      logsByUser.set(log.userId, bucket);
    }

    const otherProfiles = new Map(
      allUsers
        .filter((user) => user._id !== args.userId)
        .map((user) => [user._id, buildProfile(logsByUser.get(user._id) ?? [])]),
    );
    // The SF catalog is jazz-heavy, so "you both like jazz" is close to "you
    // both like music". Weight each shared genre by how rare it is in this
    // population instead of counting them all the same.
    const weights = genreWeights([
      targetProfile.genres,
      ...[...otherProfiles.values()].map((profile) => profile.genres),
    ]);

    const matches = allUsers
      .filter((user) => user._id !== args.userId)
      .map((user) => {
        const profile = otherProfiles.get(user._id)!;
        const sharedArtists = targetProfile.artistNames.filter((artist) =>
          profile.artistNames.includes(artist),
        );
        const sharedShows = targetProfile.showIds.filter((showId) => profile.showIds.includes(showId));

        return {
          userId: user._id,
          handle: user.handle,
          avatarColor: user.avatarColor,
          score: tasteScore(targetProfile.artistNames, profile.artistNames, sharedShows.length, {
            genresA: targetProfile.genres,
            genresB: profile.genres,
            venuesA: targetProfile.venueNames,
            venuesB: profile.venueNames,
            genreWeights: weights,
          }),
          sharedArtistNames: sharedArtists,
          sharedShowCount: sharedShows.length,
          sharedShowTitles: targetProfile.showTitles.filter((title) =>
            profile.showTitles.includes(title),
          ),
        };
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return matches;
  },
});

// Peer-to-peer discovery for the MCP surface (find_compatible_humans): an
// agent asks this on its own human's behalf to find compatible humans without
// either side needing to be online. Same scoring as `similar`, but shaped for
// an agent to act on (top shared artists to open a conversation with) and
// gated by the same low-N promise as `agents.tasteProfile` — ranking humans
// by affinity from a handful of logs is exactly the "implying a pattern" the
// app already refuses to do.
export const compatiblePeers = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const [targetUser, targetLogs] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db
        .query("logs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);
    if (!targetUser) return { lowSignal: false, matches: [] };

    if (targetLogs.length < LOW_SIGNAL_SHOWS) {
      return { lowSignal: true, matches: [] };
    }

    const [allUsers, allLogs] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("logs").collect(),
    ]);

    const logsByUser = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      const bucket = logsByUser.get(log.userId) ?? [];
      bucket.push(log);
      logsByUser.set(log.userId, bucket);
    }

    return rankCompatiblePeers(
      { ...buildProfile(targetLogs), logCount: targetLogs.length },
      allUsers
        .filter((user) => user._id !== args.userId)
        .map((user) => ({
          handle: user.handle,
          avatarColor: user.avatarColor,
          homeCity: user.homeCity ?? null,
          ...buildProfile(logsByUser.get(user._id) ?? []),
        })),
      args.limit,
    );
  },
});

// Genre-first onboarding (design 04's taste step, genre variant).
//
// Ranking by raw catalog counts would offer a San Franciscan twelve flavours
// of jazz, which is a fact about the city rather than a question about them.
// This asks the narrower, more useful question — what could you go and see
// soon, near you — and caps how many slots one genre family may take. The
// ranking itself is pure and tested in convex/onboardingGenres.js.
export const genresForOnboarding = query({
  args: {
    homeCity: v.optional(v.string()),
    today: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const upcoming = await ctx.db
      .query("shows")
      .withIndex("by_date", (q) => q.gte("date", args.today))
      .take(4000);

    // Shows denormalize artist names but not genres, so join once per artist
    // rather than once per show.
    const artistIds = [...new Set(upcoming.flatMap((show) => show.artistIds))];
    const artists = await Promise.all(artistIds.map((artistId) => ctx.db.get(artistId)));
    const genresByArtist = new Map(
      artists.filter(Boolean).map((artist) => [artist!._id, artist!.genres ?? []]),
    );

    return rankOnboardingGenres(
      upcoming.map((show) => ({
        date: show.date,
        city: show.city,
        genres: show.artistIds.flatMap((artistId) => genresByArtist.get(artistId) ?? []),
      })),
      {
        homeCity: args.homeCity ?? "",
        today: args.today,
        limit: args.limit ?? 12,
      },
    );
  },
});

// The other half of genre-first onboarding: you tap "house", you get house
// artists you could actually go and see. Ranked by upcoming appearances rather
// than catalog totals, for the same reason the genre list is.
export const artistsForGenre = query({
  args: {
    genre: v.string(),
    today: v.string(),
    homeCity: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const genre = args.genre.trim().toLowerCase();
    if (!genre) return [];

    const upcoming = await ctx.db
      .query("shows")
      .withIndex("by_date", (q) => q.gte("date", args.today))
      .take(4000);

    const city = (args.homeCity ?? "").trim().toLowerCase();
    const weightByArtist = new Map<Id<"artists">, number>();
    for (const show of upcoming) {
      const weight = city && show.city.toLowerCase() === city ? 4 : 1;
      for (const artistId of show.artistIds) {
        weightByArtist.set(artistId, (weightByArtist.get(artistId) ?? 0) + weight);
      }
    }

    const artists = await Promise.all(
      [...weightByArtist.keys()].map((artistId) => ctx.db.get(artistId)),
    );

    return artists
      .filter(
        (artist): artist is NonNullable<typeof artist> =>
          artist !== null &&
          (artist.genres ?? []).some((value) => value.trim().toLowerCase() === genre),
      )
      .map((artist) => ({
        _id: artist._id,
        name: artist.name,
        image: artist.image,
        genres: artist.genres ?? [],
        upcomingWeight: weightByArtist.get(artist._id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.upcomingWeight - left.upcomingWeight || left.name.localeCompare(right.name),
      )
      .slice(0, Math.min(args.limit ?? 18, 48));
  },
});
