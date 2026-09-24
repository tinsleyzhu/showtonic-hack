import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { planFestivalDayCollapse } from "./festivalDaysUtils.js";

// Festival-day collapse — the I/O half. All judgement lives in
// `festivalDaysUtils.js`; this file only reads, stores, and reports.
//
// The premise: festivals entered the catalog as one row per set, and the
// matcher's ambiguity guard — correctly — declines a night with sixty equally
// good options. The catalog fix is one festival-day row per date. The gap
// agent already proposes that shape for festivals it recovers from the web
// (`convex/catalogGap.ts`, `sweepFestival`); this action collapses the LEGACY
// festivals already in the catalog, the ones no sweep will ever revisit.
//
// What it writes, and what it never writes:
//
//   · one day row per (festival, date) that lacks one — inserted through
//     `shows.importUpcoming`, the same sink JamBase and the gap agent use, so
//     an agent proposal, an import and a collapse are indistinguishable in
//     shape downstream;
//   · a `nonMatchable` flag on each per-set row of a collapsed date. The row
//     STAYS — diary entries point at its id and must keep resolving — it is
//     just no longer offered to the matcher. Nothing in this action deletes.
//
// Inserting the day rows happens BEFORE the demotions, so a run interrupted
// halfway leaves sets matchable next to their new day row, never demoted with
// no day row to match instead.

// The festival rows, with venue coordinates resolved. The planner works on
// plain rows; this is where the join to `venues` happens — the same ride-along
// `listShowSummaries` does for the on-device scan.
export const festivalShows = query({
  args: { festivalId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = args.festivalId
      ? await ctx.db
          .query("shows")
          .withIndex("by_festival", (q) => q.eq("festivalId", args.festivalId as string))
          .collect()
      : await ctx.db.query("shows").collect();

    const venuesById = new Map((await ctx.db.query("venues").collect()).map((v) => [v._id, v]));

    return rows
      .filter((show) => show.festivalId !== undefined)
      .map((show: Doc<"shows">) => {
        const venue = show.venueId ? venuesById.get(show.venueId) : undefined;
        return {
          id: show._id,
          jambaseId: show.jambaseId,
          title: show.title,
          date: show.date,
          festivalId: show.festivalId as string,
          isFestivalDay: show.isFestivalDay,
          nonMatchable: show.nonMatchable,
          isHeadliner: show.isHeadliner,
          startTime: show.startTime,
          artistNames: show.artistNames,
          venueName: show.venueName,
          city: show.city,
          venueLatitude: venue?.latitude,
          venueLongitude: venue?.longitude,
        };
      });
  },
});

// Demotion is its own mutation so the action's two write kinds are each
// idempotent on their own: re-running either after a partial failure is a
// no-op, and neither ever deletes.
export const demotePerSetRows = mutation({
  args: { showIds: v.array(v.id("shows")) },
  handler: async (ctx, args) => {
    let demoted = 0;
    for (const showId of args.showIds) {
      const show = await ctx.db.get(showId);
      if (!show || show.nonMatchable === true) continue;
      await ctx.db.patch(showId, { nonMatchable: true });
      demoted += 1;
    }
    return { demoted };
  },
});

export const collapseLegacyFestivals = action({
  args: { festivalId: v.optional(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    festivalCount: number;
    daysConsidered: number;
    dayRowsInserted: number;
    dayRowsExisting: number;
    setsDemoted: number;
    setsAlreadyDemoted: number;
    days: {
      festivalId: string;
      festivalName: string;
      date: string;
      title: string;
      jambaseId: string;
      dayRowExisted: boolean;
      acts: number;
      demoted: number;
      alreadyDemoted: number;
    }[];
    dryRun: boolean;
    note: string;
  }> => {
    const shows = await ctx.runQuery(api.festivalDays.festivalShows, {
      festivalId: args.festivalId,
    });
    const plan = planFestivalDayCollapse(shows, { festivalId: args.festivalId });

    const report = {
      festivalCount: plan.festivalCount,
      daysConsidered: plan.days.length,
      dayRowsInserted: plan.dayRows.length,
      dayRowsExisting: plan.days.filter((day) => day.dayRowExisted).length,
      setsDemoted: plan.demotions.length,
      setsAlreadyDemoted: plan.days.reduce((total, day) => total + day.alreadyDemoted, 0),
      days: plan.days,
      dryRun: args.dryRun === true,
    };

    if (args.dryRun) {
      return {
        ...report,
        note: "Dry run — nothing written. Re-run without dryRun to collapse.",
      };
    }

    // Day rows first: between the two writes the catalog briefly holds both
    // shapes for a festival, and matchable-with-a-day-row is the safe half of
    // that — demoted-with-no-day-row would be a festival the matcher cannot
    // see at all.
    if (plan.dayRows.length) {
      await ctx.runMutation(api.shows.importUpcoming, { events: plan.dayRows });
    }
    let demoted = 0;
    if (plan.demotions.length) {
      const outcome = await ctx.runMutation(api.festivalDays.demotePerSetRows, {
        showIds: plan.demotions as never,
      });
      demoted = outcome.demoted;
    }

    return {
      ...report,
      setsDemoted: demoted,
      note:
        "One festival-day row per date, that day's bill in artistNames. Per-set rows are marked " +
        "nonMatchable, not deleted — diary history keeps resolving through them.",
    };
  },
});
