/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agents from "../agents.js";
import type * as artistSearch from "../artistSearch.js";
import type * as artistSearchUtils from "../artistSearchUtils.js";
import type * as artists from "../artists.js";
import type * as attendance from "../attendance.js";
import type * as backfill from "../backfill.js";
import type * as backfillMatch from "../backfillMatch.js";
import type * as briefing from "../briefing.js";
import type * as briefingLogic from "../briefingLogic.js";
import type * as catalogGap from "../catalogGap.js";
import type * as catalogGapUtils from "../catalogGapUtils.js";
import type * as dedup from "../dedup.js";
import type * as dedupUtils from "../dedupUtils.js";
import type * as diary from "../diary.js";
import type * as discovery from "../discovery.js";
import type * as favorites from "../favorites.js";
import type * as follows from "../follows.js";
import type * as freeEvents from "../freeEvents.js";
import type * as freeEventsUtils from "../freeEventsUtils.js";
import type * as jambase from "../jambase.js";
import type * as jambaseUtils from "../jambaseUtils.js";
import type * as leaderboard from "../leaderboard.js";
import type * as logs from "../logs.js";
import type * as media from "../media.js";
import type * as mediaUtils from "../mediaUtils.js";
import type * as onboardingArtists from "../onboardingArtists.js";
import type * as onboardingGenres from "../onboardingGenres.js";
import type * as recap from "../recap.js";
import type * as recapSummary from "../recapSummary.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as shows from "../shows.js";
import type * as showtonicUtils from "../showtonicUtils.js";
import type * as squad from "../squad.js";
import type * as taste from "../taste.js";
import type * as tasteMath from "../tasteMath.js";
import type * as users from "../users.js";
import type * as venues from "../venues.js";
import type * as watchlist from "../watchlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  agents: typeof agents;
  artistSearch: typeof artistSearch;
  artistSearchUtils: typeof artistSearchUtils;
  artists: typeof artists;
  attendance: typeof attendance;
  backfill: typeof backfill;
  backfillMatch: typeof backfillMatch;
  briefing: typeof briefing;
  briefingLogic: typeof briefingLogic;
  catalogGap: typeof catalogGap;
  catalogGapUtils: typeof catalogGapUtils;
  dedup: typeof dedup;
  dedupUtils: typeof dedupUtils;
  diary: typeof diary;
  discovery: typeof discovery;
  favorites: typeof favorites;
  follows: typeof follows;
  freeEvents: typeof freeEvents;
  freeEventsUtils: typeof freeEventsUtils;
  jambase: typeof jambase;
  jambaseUtils: typeof jambaseUtils;
  leaderboard: typeof leaderboard;
  logs: typeof logs;
  media: typeof media;
  mediaUtils: typeof mediaUtils;
  onboardingArtists: typeof onboardingArtists;
  onboardingGenres: typeof onboardingGenres;
  recap: typeof recap;
  recapSummary: typeof recapSummary;
  seed: typeof seed;
  seedData: typeof seedData;
  shows: typeof shows;
  showtonicUtils: typeof showtonicUtils;
  squad: typeof squad;
  taste: typeof taste;
  tasteMath: typeof tasteMath;
  users: typeof users;
  venues: typeof venues;
  watchlist: typeof watchlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
