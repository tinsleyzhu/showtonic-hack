/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as jambase from "../jambase.js";
import type * as jambaseUtils from "../jambaseUtils.js";
import type * as logs from "../logs.js";
import type * as media from "../media.js";
import type * as mediaUtils from "../mediaUtils.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as shows from "../shows.js";
import type * as taste from "../taste.js";
import type * as tasteMath from "../tasteMath.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  jambase: typeof jambase;
  jambaseUtils: typeof jambaseUtils;
  logs: typeof logs;
  media: typeof media;
  mediaUtils: typeof mediaUtils;
  seed: typeof seed;
  seedData: typeof seedData;
  shows: typeof shows;
  taste: typeof taste;
  tasteMath: typeof tasteMath;
  users: typeof users;
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
