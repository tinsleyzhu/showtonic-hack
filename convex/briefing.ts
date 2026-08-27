import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { deriveActivity, narrateBeliefs, scoreFinds } from "./briefingLogic.js";
// Type-only, so it is erased before anything is bundled for Convex: the
// coordinator-owned contract checks this query's shape at compile time. If
// app/briefing.ts changes, this file stops compiling — which is the point.
import type { Briefing } from "../app/briefing";
import { rankCompatiblePeers } from "./tasteMath.js";

// A thin query over pure logic. Everything that decides anything lives in
// convex/briefingLogic.js, where it is tested on fixtures; this file only
// fetches and shapes, so the briefing the app renders and the briefing an
// agent reads over MCP cannot disagree.
//
// Read budget is a first-class concern here, not an afterthought: the
// onboarding queries were measured at 3,798 document reads against Convex's
// 4,096 limit, and this screen is the new home surface. Every read below is
// either indexed or explicitly capped.
const SHOW_READ_CAP = 1500;
const SQUAD_PLAN_READ_CAP = 200;
const CANDIDATE_READ_CAP = 20;
// Friend-going evidence is the most expensive row on a card, so it is bounded
// on three axes rather than left to the size of the catalog.
const PEER_SHOW_LOOKUPS = 6;
const PEER_ATTENDEES_PER_SHOW = 20;
const PEER_PROFILE_CAP = 8;
const PEER_LOG_CAP = 40;

async function upcomingInCity(ctx: QueryCtx, city: string, today: string) {
  if (city) {
    const inCity = await ctx.db
      .query("shows")
      .withIndex("by_city_date", (q) => q.eq("city", city).gte("date", today))
      .take(SHOW_READ_CAP);
    if (inCity.length > 0) return inCity;
  }
  // Same fallback discipline as taste.ts: an empty indexed read may mean a
  // quiet city or a city spelled differently by the feeds, and those two must
  // not be indistinguishable.
  return ctx.db
    .query("shows")
    .withIndex("by_date", (q) => q.gte("date", today))
    .take(SHOW_READ_CAP);
}

function mostLoggedCity(logs: { city?: string }[]) {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const city = (log.city ?? "").trim();
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return top ? top[0] : "";
}

export const forUser = query({
  args: { userId: v.id("users"), today: v.string() },
  handler: async (ctx, args): Promise<Briefing> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      return { decisionsOwed: 0, finds: [], beliefs: [], activity: [] };
    }

    const [logs, attendance, candidates, follows] = await Promise.all([
      ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect(),
      ctx.db.query("attendance").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect(),
      ctx.db
        .query("backfillCandidates")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("artistFollows")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);

    // backfillCandidates does not denormalize the show, so the nights that
    // have one are joined here — capped, newest first, because the feed shows
    // ten items and a long-lived account can hold hundreds of resolved rows.
    const recentCandidates = [...candidates]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, CANDIDATE_READ_CAP);
    const candidateShows = new Map(
      (
        await Promise.all(
          [...new Set(recentCandidates.map((candidate) => candidate.showId).filter(Boolean))].map(
            (showId) => ctx.db.get(showId as Id<"shows">),
          ),
        )
      )
        .filter((show): show is NonNullable<typeof show> => show !== null)
        .map((show) => [show._id, show]),
    );

    const squadPlans = (await ctx.db.query("squadPlans").take(SQUAD_PLAN_READ_CAP)).filter((plan) =>
      plan.userIds.some((id) => id === args.userId),
    );

    const followedArtists = await Promise.all(follows.map((follow) => ctx.db.get(follow.artistId)));
    const followedArtistNames = followedArtists
      .filter((artist): artist is NonNullable<typeof artist> => artist !== null)
      .map((artist) => artist.name);

    // A member who never finished onboarding still has a city: the one their
    // diary is in. Live, maya has no homeCity and was offered Lily Allen at
    // Madison Square Garden — the global fallback is honest for someone we
    // know nothing about, and wrong for someone with six San Francisco
    // nights on file.
    const city = (user.homeCity ?? "").trim() || mostLoggedCity(logs);
    const upcoming = await upcomingInCity(ctx, city, args.today);

    // Shows denormalize artist names but not genres, so join once per artist.
    const artistIds = [...new Set(upcoming.flatMap((show) => show.artistIds))];
    const artists = await Promise.all(artistIds.map((artistId) => ctx.db.get(artistId)));
    const genresByArtist = new Map(
      artists
        .filter((artist): artist is NonNullable<typeof artist> => artist !== null)
        .map((artist) => [artist._id, artist.genres ?? []]),
    );

    const shows = upcoming.map((show) => ({
      showId: show._id as string,
      title: show.title,
      date: show.date,
      venueName: show.venueName,
      city: show.city,
      image: show.image,
      artistNames: show.artistNames,
      genres: [...new Set(show.artistIds.flatMap((artistId) => genresByArtist.get(artistId) ?? []))],
    }));

    const briefingLogs = logs.map((entry) => ({
      showId: entry.showId as string,
      showTitle: entry.showTitle,
      showDate: entry.showDate,
      artistNames: entry.artistNames,
      artistGenres: entry.artistGenres,
      venueName: entry.venueName,
      rating: entry.rating,
      source: entry.source,
      createdAt: entry.createdAt,
    }));

    // Already logged, already going, already interested: a show the member has
    // decided about is not something the agent found.
    const excludeShowIds = [
      ...logs.map((entry) => entry.showId as string),
      ...attendance.map((entry) => entry.showId as string),
    ];

    const shortlist = scoreFinds(shows, {
      logs: briefingLogs,
      followedArtistNames,
      excludeShowIds,
      today: args.today,
    });

    const peersGoing = await peersGoingTo(ctx, {
      userId: args.userId,
      showIds: shortlist.slice(0, PEER_SHOW_LOOKUPS).map((find) => find.showId as Id<"shows">),
      myLogs: briefingLogs,
    });

    // Scored twice on purpose: who else is going can only be looked up for a
    // shortlist, and a card must be scored WITH all of its evidence rather
    // than have one stapled on afterwards.
    const finds =
      Object.keys(peersGoing).length > 0
        ? scoreFinds(shows, {
            logs: briefingLogs,
            followedArtistNames,
            excludeShowIds,
            peersGoing,
            today: args.today,
          })
        : shortlist;

    const openInvites = squadPlans.filter((plan) => plan.status === "proposed").length;
    const pendingCandidates = candidates.filter((candidate) => candidate.status === "pending").length;

    return {
      decisionsOwed: pendingCandidates + openInvites,
      finds,
      beliefs: narrateBeliefs(briefingLogs, shows),
      activity: deriveActivity(
        recentCandidates.map((candidate) => ({
          clusterDate: candidate.clusterDate,
          showTitle: candidate.showId ? candidateShows.get(candidate.showId)?.title : undefined,
          venueName: candidate.showId ? candidateShows.get(candidate.showId)?.venueName : undefined,
          photoCount: candidate.photoCount,
          confidence: candidate.confidence,
          evidence: candidate.evidence,
          status: candidate.status,
          createdAt: candidate.createdAt,
        })),
        squadPlans.map((plan) => ({
          userIds: plan.userIds as unknown as string[],
          showTitle: plan.showTitle,
          showDate: plan.showDate,
          settlement: plan.settlement,
          createdAt: plan.createdAt,
          transcript: plan.transcript,
        })),
        briefingLogs,
        { userId: args.userId as string },
      ),
    };
  },
});

// Who else with a diary like yours is going, bounded so one card cannot cost
// the query its read budget: a handful of shows, a page of attendees each, and
// a capped slice of each peer's diary. Match strength is `rankCompatiblePeers`
// — the same function peer discovery and the MCP tool use.
async function peersGoingTo(
  ctx: QueryCtx,
  {
    userId,
    showIds,
    myLogs,
  }: {
    userId: Id<"users">;
    showIds: Id<"shows">[];
    myLogs: { artistNames?: readonly string[]; artistGenres?: readonly string[]; venueName?: string; showId?: string }[];
  },
) {
  if (showIds.length === 0 || myLogs.length === 0) return {};

  const attendanceByShow = await Promise.all(
    showIds.map((showId) =>
      ctx.db
        .query("attendance")
        .withIndex("by_show", (q) => q.eq("showId", showId))
        .take(PEER_ATTENDEES_PER_SHOW),
    ),
  );

  const goingByUser = new Map<Id<"users">, Id<"shows">[]>();
  attendanceByShow.forEach((rows, index) => {
    for (const row of rows) {
      if (row.userId === userId || row.status === "logged") continue;
      const shows = goingByUser.get(row.userId) ?? [];
      shows.push(showIds[index]);
      goingByUser.set(row.userId, shows);
    }
  });

  const peerIds = [...goingByUser.keys()].slice(0, PEER_PROFILE_CAP);
  if (peerIds.length === 0) return {};

  const peers = await Promise.all(
    peerIds.map(async (peerId) => {
      const [peer, peerLogs] = await Promise.all([
        ctx.db.get(peerId),
        ctx.db.query("logs").withIndex("by_user", (q) => q.eq("userId", peerId)).take(PEER_LOG_CAP),
      ]);
      if (!peer || peer.visibility === "private") return null;
      return {
        handle: peer.handle,
        avatarColor: peer.avatarColor,
        homeCity: peer.homeCity ?? null,
        artistNames: [...new Set(peerLogs.flatMap((entry) => entry.artistNames))],
        showIds: [...new Set(peerLogs.map((entry) => entry.showId as string))],
        genres: [...new Set(peerLogs.flatMap((entry) => entry.artistGenres ?? []))],
        venueNames: [...new Set(peerLogs.map((entry) => entry.venueName ?? "").filter(Boolean))],
        going: goingByUser.get(peerId) ?? [],
      };
    }),
  );

  const present = peers.filter((peer): peer is NonNullable<typeof peer> => peer !== null);
  const me = {
    artistNames: [...new Set(myLogs.flatMap((entry) => entry.artistNames ?? []))],
    showIds: [...new Set(myLogs.map((entry) => String(entry.showId ?? "")).filter(Boolean))],
    genres: [...new Set(myLogs.flatMap((entry) => entry.artistGenres ?? []))],
    venueNames: [...new Set(myLogs.map((entry) => entry.venueName ?? "").filter(Boolean))],
    logCount: myLogs.length,
  };

  // The low-signal gate lives inside rankCompatiblePeers, so a member with a
  // thin diary gets no friend-going rows rather than a made-up percentage.
  const ranked = rankCompatiblePeers(me, present, PEER_PROFILE_CAP);
  if (ranked.lowSignal) return {};

  // tasteMath.js is plain JS with no declarations, so the percentage is
  // narrowed here rather than trusted from inference.
  const matchByHandle = new Map<string, number>(
    (ranked.matches as { handle: string; matchPercent: number }[]).map((match) => [
      match.handle,
      Number(match.matchPercent),
    ]),
  );
  const peersGoing: Record<string, { handle: string; matchPercent: number }[]> = {};
  for (const peer of present) {
    const matchPercent = matchByHandle.get(peer.handle);
    if (matchPercent === undefined) continue;
    for (const showId of peer.going) {
      const key = String(showId);
      peersGoing[key] = [...(peersGoing[key] ?? []), { handle: peer.handle, matchPercent }];
    }
  }
  return peersGoing;
}
