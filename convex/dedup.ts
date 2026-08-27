// Catalog deduplication — the half that writes.
//
// Every judgement lives in dedupUtils.js and is proved against a snapshot
// export by scripts/dedup-plan.mjs before anything here runs. What is left is
// mechanical and dangerous in exactly one way: a merge deletes rows, and a row
// that still has references pointing at it leaves orphans behind. So the order
// is fixed and never varies — ABSORB, REPOINT, THEN DELETE — and the repoint
// step covers every reference in the schema, not the ones that came to mind.
//
// The reference map, read off schema.ts rather than remembered:
//   shows   <- logs.showId, attendance.showId, favorites.showId,
//              backfillCandidates.showId, catalogProposals.showId,
//              squadPlans.showId, media.showId, watchlist(targetType "show")
//   artists <- shows.artistIds, users.tasteArtistIds, artistFollows.artistId,
//              watchlist(targetType "artist")
//   venues  <- shows.venueId, venueFollows.venueId, watchlist(targetType "venue")
//
// The last four of those (favorites, catalogProposals, squadPlans,
// users.tasteArtistIds) are not in the worklist this lane was handed. An
// orphaned favorite is a crash on someone's profile, so the map is derived,
// not trusted.

import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  showKey,
  showAliasKey,
  artistKey,
  venueKey,
  planVenueAliasDeduplication,
  planShowMerge,
  planArtistMerge,
  planVenueMerge,
  planDeduplication,
} from "./dedupUtils.js";

const TABLE = v.union(v.literal("shows"), v.literal("artists"), v.literal("venues"));

// Rows are read a page at a time from an action rather than collected in one
// query: 11,580 shows is past what a single query should hold, and this is the
// same read-ceiling lesson that already bit the identity backlog query.
const PAGE_SIZE = 1000;

export const pageRows = internalQuery({
  args: { table: TABLE, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.table)
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    return { rows: page.page, cursor: page.continueCursor, isDone: page.isDone };
  },
});

type AnyRow = Doc<"shows"> | Doc<"artists"> | Doc<"venues">;

async function collectTable(ctx: ActionCtx, table: "shows" | "artists" | "venues") {
  const rows: AnyRow[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { rows: AnyRow[]; cursor: string; isDone: boolean } = await ctx.runQuery(
      internal.dedup.pageRows,
      { table, cursor },
    );
    rows.push(...page.rows);
    if (page.isDone) break;
    cursor = page.cursor;
  }
  return rows;
}

const PLANNERS = {
  shows: { keyFn: showKey, mergeFn: planShowMerge },
  artists: { keyFn: artistKey, mergeFn: planArtistMerge },
  venues: { keyFn: venueKey, mergeFn: planVenueMerge },
} as const;

/**
 * The plan, and nothing but the plan. Same functions the live run uses, so a
 * dry run is evidence rather than a rehearsal.
 */
export const planTable = action({
  args: { table: TABLE, samples: v.optional(v.number()) },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    table: string;
    rows: number;
    groupCount: number;
    excessRows: number;
    rowsAfter: number;
    samples: { key: string; copies: number; gains: string[] }[];
  }> => {
    const rows = await collectTable(ctx, args.table);
    const planner = PLANNERS[args.table];
    const plan = planDeduplication(rows as never[], planner as never);
    const samples = [...plan.merges]
      .sort((left, right) => right.duplicateIds.length - left.duplicateIds.length)
      .slice(0, Math.min(Math.max(args.samples ?? 20, 0), 100))
      .map((merge) => ({
        key: merge.key,
        copies: merge.duplicateIds.length + 1,
        gains: Object.keys(merge.patch),
      }));
    return {
      table: args.table,
      rows: rows.length,
      groupCount: plan.groupCount,
      excessRows: plan.excessRows,
      rowsAfter: rows.length - plan.excessRows,
      samples,
    };
  },
});

// ---------------------------------------------------------------------------
// Applying — absorb, repoint, delete, in that order
// ---------------------------------------------------------------------------

const MERGE = v.object({
  canonicalId: v.string(),
  duplicateIds: v.array(v.string()),
  patch: v.any(),
});

// Small tables are scanned; the ones with a by_show index are queried through
// it. Both are correct — the difference is only cost, and the tables without an
// index hold tens of rows.
async function repointShowRefs(
  ctx: MutationCtx,
  from: Id<"shows">,
  to: Id<"shows">,
): Promise<number> {
  let moved = 0;

  for (const table of ["logs", "attendance", "media", "squadPlans"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_show", (q) => q.eq("showId", from))
      .collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, { showId: to });
      moved += 1;
    }
  }

  for (const table of ["favorites", "backfillCandidates", "catalogProposals"] as const) {
    const rows = await ctx.db.query(table).collect();
    for (const row of rows) {
      if (row.showId !== from) continue;
      await ctx.db.patch(row._id, { showId: to });
      moved += 1;
    }
  }

  moved += await repointWatchlist(ctx, "show", from, to);
  return moved;
}

// watchlist stores its target as a bare string across all three entity types,
// so it cannot be found by index and must be matched by value.
async function repointWatchlist(
  ctx: MutationCtx,
  targetType: "show" | "artist" | "venue",
  from: string,
  to: string,
): Promise<number> {
  const rows = await ctx.db.query("watchlist").collect();
  let moved = 0;
  for (const row of rows) {
    if (row.targetType !== targetType || row.targetId !== from) continue;
    await ctx.db.patch(row._id, { targetId: to });
    moved += 1;
  }
  return moved;
}

export const applyShowMerges = internalMutation({
  args: { merges: v.array(MERGE) },
  handler: async (ctx, args) => {
    let patched = 0;
    let repointed = 0;
    let deleted = 0;

    for (const merge of args.merges) {
      const canonicalId = merge.canonicalId as Id<"shows">;
      const canonical = await ctx.db.get(canonicalId);
      if (!canonical) continue; // already merged by an earlier batch — idempotent

      if (merge.patch && Object.keys(merge.patch).length > 0) {
        await ctx.db.patch(canonicalId, merge.patch);
        patched += 1;
      }

      for (const rawId of merge.duplicateIds) {
        const duplicateId = rawId as Id<"shows">;
        if (duplicateId === canonicalId) continue;
        const duplicate = await ctx.db.get(duplicateId);
        if (!duplicate) continue;
        repointed += await repointShowRefs(ctx, duplicateId, canonicalId);
        await ctx.db.delete(duplicateId);
        deleted += 1;
      }
    }

    return { patched, repointed, deleted };
  },
});

export const applyArtistMerges = internalMutation({
  args: { merges: v.array(MERGE) },
  handler: async (ctx, args) => {
    let patched = 0;
    let repointed = 0;
    let deleted = 0;

    for (const merge of args.merges) {
      const canonicalId = merge.canonicalId as Id<"artists">;
      const canonical = await ctx.db.get(canonicalId);
      if (!canonical) continue;

      if (merge.patch && Object.keys(merge.patch).length > 0) {
        await ctx.db.patch(canonicalId, merge.patch);
        patched += 1;
      }

      for (const rawId of merge.duplicateIds) {
        const duplicateId = rawId as Id<"artists">;
        if (duplicateId === canonicalId) continue;
        const duplicate = await ctx.db.get(duplicateId);
        if (!duplicate) continue;

        const follows = await ctx.db
          .query("artistFollows")
          .withIndex("by_artist", (q) => q.eq("artistId", duplicateId))
          .collect();
        for (const follow of follows) {
          // A member may already follow the survivor; two follow rows for one
          // artist would show the same act twice on their profile.
          const existing = await ctx.db
            .query("artistFollows")
            .withIndex("by_user_artist", (q) =>
              q.eq("userId", follow.userId).eq("artistId", canonicalId),
            )
            .unique();
          if (existing) await ctx.db.delete(follow._id);
          else await ctx.db.patch(follow._id, { artistId: canonicalId });
          repointed += 1;
        }

        const users = await ctx.db.query("users").collect();
        for (const user of users) {
          const taste = user.tasteArtistIds ?? [];
          if (!taste.some((id) => id === duplicateId)) continue;
          const next: Id<"artists">[] = [];
          for (const id of taste) {
            const mapped = id === duplicateId ? canonicalId : id;
            if (!next.includes(mapped)) next.push(mapped);
          }
          await ctx.db.patch(user._id, { tasteArtistIds: next });
          repointed += 1;
        }

        repointed += await repointWatchlist(ctx, "artist", duplicateId, canonicalId);
        await ctx.db.delete(duplicateId);
        deleted += 1;
      }
    }

    return { patched, repointed, deleted };
  },
});

export const applyVenueMerges = internalMutation({
  args: { merges: v.array(MERGE) },
  handler: async (ctx, args) => {
    let patched = 0;
    let repointed = 0;
    let deleted = 0;

    for (const merge of args.merges) {
      const canonicalId = merge.canonicalId as Id<"venues">;
      const canonical = await ctx.db.get(canonicalId);
      if (!canonical) continue;

      if (merge.patch && Object.keys(merge.patch).length > 0) {
        await ctx.db.patch(canonicalId, merge.patch);
        patched += 1;
      }

      for (const rawId of merge.duplicateIds) {
        const duplicateId = rawId as Id<"venues">;
        if (duplicateId === canonicalId) continue;
        const duplicate = await ctx.db.get(duplicateId);
        if (!duplicate) continue;

        const follows = await ctx.db
          .query("venueFollows")
          .withIndex("by_venue", (q) => q.eq("venueId", duplicateId))
          .collect();
        for (const follow of follows) {
          const existing = await ctx.db
            .query("venueFollows")
            .withIndex("by_user_venue", (q) =>
              q.eq("userId", follow.userId).eq("venueId", canonicalId),
            )
            .unique();
          if (existing) await ctx.db.delete(follow._id);
          else await ctx.db.patch(follow._id, { venueId: canonicalId });
          repointed += 1;
        }

        repointed += await repointWatchlist(ctx, "venue", duplicateId, canonicalId);
        await ctx.db.delete(duplicateId);
        deleted += 1;
      }
    }

    return { patched, repointed, deleted };
  },
});

// shows.artistIds / shows.venueId are the two references that live on a big
// table, so they are repointed in one paged pass after the merges rather than
// scanned once per group.
export const repointShowsToCanonicalPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    // Pairs, not a map: Convex caps any object argument at 1,024 fields, and
    // the artist sweep alone carries 1,321 duplicate ids. Arrays cap at 8,192
    // items, which is room to spare.
    artistPairs: v.optional(v.array(v.array(v.string()))),
    venuePairs: v.optional(v.array(v.array(v.string()))),
  },
  handler: async (ctx, args) => {
    const artistMap: Record<string, string> = Object.fromEntries(args.artistPairs ?? []);
    const venueMap: Record<string, string> = Object.fromEntries(args.venuePairs ?? []);
    const page = await ctx.db.query("shows").paginate({ cursor: args.cursor, numItems: 200 });

    let patched = 0;
    for (const show of page.page) {
      const patch: Record<string, unknown> = {};

      const ids = show.artistIds ?? [];
      if (ids.some((id) => artistMap[id])) {
        const next: Id<"artists">[] = [];
        const names: string[] = [];
        const seen = new Set<string>();
        ids.forEach((id, index) => {
          const mapped = (artistMap[id] ?? id) as Id<"artists">;
          if (seen.has(mapped)) return; // the twin was already on this bill
          seen.add(mapped);
          next.push(mapped);
          const name = show.artistNames?.[index];
          if (name !== undefined) names.push(name);
        });
        patch.artistIds = next;
        if (names.length === next.length) patch.artistNames = names;
      }

      if (show.venueId && venueMap[show.venueId]) {
        patch.venueId = venueMap[show.venueId] as Id<"venues">;
      }

      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(show._id, patch);
        patched += 1;
      }
    }

    return { patched, cursor: page.continueCursor, isDone: page.isDone };
  },
});

// The ingest lookups are index lookups, and an index cannot find a row whose
// key was never written. Every row stored before this change has none, so the
// sweep ends by keying the whole table — otherwise the first sync afterwards
// re-inserts every duplicate it just removed.
export const backfillKeysPage = internalMutation({
  args: { table: TABLE, cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.table)
      .paginate({ cursor: args.cursor, numItems: 200 });

    let patched = 0;
    for (const row of page.page) {
      if (args.table === "artists") {
        const nameKey = artistKey(row);
        if (nameKey && (row as Doc<"artists">).nameKey !== nameKey) {
          await ctx.db.patch(row._id, { nameKey });
          patched += 1;
        }
      } else if (args.table === "shows") {
        const show = row as Doc<"shows">;
        const dedupKey = showKey(show);
        const aliasKey = showAliasKey(show);
        const patch: Record<string, string> = {};
        if (dedupKey && show.dedupKey !== dedupKey) patch.dedupKey = dedupKey;
        if (aliasKey && show.aliasKey !== aliasKey) patch.aliasKey = aliasKey;
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(row._id, patch);
          patched += 1;
        }
      } else {
        const dedupKey = venueKey(row);
        if (dedupKey && (row as Doc<"venues">).dedupKey !== dedupKey) {
          await ctx.db.patch(row._id, { dedupKey });
          patched += 1;
        }
      }
    }

    return { patched, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * The whole sweep for one table. `apply` defaults to false: without it this is
 * a dry run that writes nothing, which is the only way it should ever be run
 * first.
 */
export const runDedup = action({
  args: {
    table: TABLE,
    apply: v.optional(v.boolean()),
    maxGroups: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    table: string;
    applied: boolean;
    rows: number;
    groupCount: number;
    excessRows: number;
    patched: number;
    repointed: number;
    deleted: number;
    showsRepointed: number;
    keyed: number;
  }> => {
    const rows = await collectTable(ctx, args.table);
    const planner = PLANNERS[args.table];
    const plan = planDeduplication(rows as never[], planner as never);

    const merges = plan.merges
      .slice(0, Math.max(args.maxGroups ?? plan.merges.length, 0))
      .map((merge) => ({
        canonicalId: String(merge.canonicalId),
        duplicateIds: merge.duplicateIds.map(String),
        patch: merge.patch,
      }));

    const summary = {
      table: args.table,
      applied: args.apply ?? false,
      rows: rows.length,
      groupCount: plan.groupCount,
      excessRows: plan.excessRows,
      patched: 0,
      repointed: 0,
      deleted: 0,
      showsRepointed: 0,
      keyed: 0,
    };
    if (!args.apply) return summary;

    // Repoint the big table FIRST for artists and venues: a show must never
    // point at an id that has already been deleted, not even between batches.
    if (args.table !== "shows") {
      const pairs: string[][] = [];
      for (const merge of merges) {
        for (const duplicateId of merge.duplicateIds) pairs.push([duplicateId, merge.canonicalId]);
      }
      let cursor: string | null = null;
      for (;;) {
        const page: { patched: number; cursor: string; isDone: boolean } = await ctx.runMutation(
          internal.dedup.repointShowsToCanonicalPage,
          {
            cursor,
            artistPairs: args.table === "artists" ? pairs : undefined,
            venuePairs: args.table === "venues" ? pairs : undefined,
          },
        );
        summary.showsRepointed += page.patched;
        if (page.isDone) break;
        cursor = page.cursor;
      }
    }

    const batchSize = Math.min(Math.max(args.batchSize ?? 25, 1), 100);
    const apply =
      args.table === "shows"
        ? internal.dedup.applyShowMerges
        : args.table === "artists"
          ? internal.dedup.applyArtistMerges
          : internal.dedup.applyVenueMerges;

    for (let start = 0; start < merges.length; start += batchSize) {
      const result: { patched: number; repointed: number; deleted: number } = await ctx.runMutation(
        apply,
        { merges: merges.slice(start, start + batchSize) },
      );
      summary.patched += result.patched;
      summary.repointed += result.repointed;
      summary.deleted += result.deleted;
    }

    // Key what survives, so the next sync recognises it.
    let keyCursor: string | null = null;
    for (;;) {
      const page: { patched: number; cursor: string; isDone: boolean } = await ctx.runMutation(
        internal.dedup.backfillKeysPage,
        { table: args.table, cursor: keyCursor },
      );
      summary.keyed += page.patched;
      if (page.isDone) break;
      keyCursor = page.cursor;
    }

    return summary;
  },
});

// ---------------------------------------------------------------------------
// Pass 2 — venue aliases
// ---------------------------------------------------------------------------
//
// Pass 1 keyed on the venue name, so it could not see that "Blue Note Jazz
// Club" and "The Blue Note" are one room. This pass buckets shows by the
// venue-free key and then requires a token-subset match on the names, which is
// what keeps Sofar's neighbourhood rooms — and Birdland's Jazz Club vs its
// Theater — apart. Coordinates are NOT used: several venue rows carry
// city-centroid geocodes, and rooms that share an address are real.
//
// Reuses applyShowMerges, so absorb-repoint-delete and the whole reference map
// are the same code that ran in pass 1.
export const runVenueAliasDedup = action({
  args: {
    apply: v.optional(v.boolean()),
    maxGroups: v.optional(v.number()),
    batchSize: v.optional(v.number()),
    samples: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{
    applied: boolean;
    rows: number;
    groupCount: number;
    excessRows: number;
    untimedAttached: number;
    patched: number;
    repointed: number;
    deleted: number;
    keyed: number;
    samples: { key: string; copies: number; venueNames: string[] }[];
  }> => {
    const rows = (await collectTable(ctx, "shows")) as Doc<"shows">[];
    const plan = planVenueAliasDeduplication(rows as never[]);

    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const merges = plan.merges
      .slice(0, Math.max(args.maxGroups ?? plan.merges.length, 0))
      .map((merge) => ({
        canonicalId: String(merge.canonicalId),
        duplicateIds: merge.duplicateIds.map(String),
        patch: merge.patch,
      }));

    const samples = merges.slice(0, Math.min(Math.max(args.samples ?? 20, 0), 100)).map((merge) => ({
      key: byId.get(merge.canonicalId)?.date ?? "",
      copies: merge.duplicateIds.length + 1,
      venueNames: [
        byId.get(merge.canonicalId)?.venueName ?? "",
        ...merge.duplicateIds.map((id) => byId.get(id)?.venueName ?? ""),
      ],
    }));

    const summary = {
      applied: args.apply ?? false,
      rows: rows.length,
      groupCount: plan.groupCount,
      excessRows: plan.excessRows,
      untimedAttached: plan.untimedAttached,
      patched: 0,
      repointed: 0,
      deleted: 0,
      keyed: 0,
      samples,
    };
    if (!args.apply) return summary;

    const batchSize = Math.min(Math.max(args.batchSize ?? 25, 1), 100);
    for (let start = 0; start < merges.length; start += batchSize) {
      const result: { patched: number; repointed: number; deleted: number } = await ctx.runMutation(
        internal.dedup.applyShowMerges,
        { merges: merges.slice(start, start + batchSize) },
      );
      summary.patched += result.patched;
      summary.repointed += result.repointed;
      summary.deleted += result.deleted;
    }

    let cursor: string | null = null;
    for (;;) {
      const page: { patched: number; cursor: string; isDone: boolean } = await ctx.runMutation(
        internal.dedup.backfillKeysPage,
        { table: "shows", cursor },
      );
      summary.keyed += page.patched;
      if (page.isDone) break;
      cursor = page.cursor;
    }

    return summary;
  },
});
