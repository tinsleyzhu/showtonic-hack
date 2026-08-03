import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import {
  normalizeUpcomingEvents,
  validateJamBaseSourceUrl,
} from "./jambaseUtils.js";

const JAMBASE_API_ORIGIN = "https://api.data.jambase.com/v3";

async function fetchJamBase(path: string) {
  const apiKey = process.env.JAMBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing JAMBASE_API_KEY environment variable");
  }

  const response = await fetch(`${JAMBASE_API_ORIGIN}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "ShowtonicHack/1.0",
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`JamBase fetch failed with status ${response.status}: ${detail}`);
  }

  return response.json();
}

export const searchCities = action({
  args: {
    cityName: v.string(),
  },
  handler: async (_ctx, args) => {
    const payload = await fetchJamBase(`/geographies/cities?geoCityName=${encodeURIComponent(args.cityName)}&perPage=20`);
    return payload;
  },
});

type ImportSummary = {
  available: number;
  fetched: number;
  inserted: number;
  updated: number;
  pages: number;
  truncated: boolean;
};

type NormalizedEvent = {
  jambaseId: string;
  title: string;
  date: string;
  startTime?: string;
  venueName: string;
  city: string;
  region?: string;
  image?: string;
  festivalId?: string;
  stage?: string;
  isHeadliner: boolean;
  artistNames: string[];
  artistJambaseIds?: string[];
  jambaseUrl?: string;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function importRange(
  ctx: Pick<ActionCtx, "runMutation">,
  params: URLSearchParams,
  maxPages: number,
  dryRun: boolean,
  seenIds: Set<string>,
): Promise<ImportSummary> {
  let page = 1;
  let available = 0;
  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let totalPages = 1;

  do {
    params.set("page", String(page));
    const payload = await fetchJamBase(`/events?${params.toString()}`);
    available = Number(payload?.pagination?.totalItems ?? 0);
    totalPages = Number(payload?.pagination?.totalPages ?? 1);
    const events = (normalizeUpcomingEvents(payload) as NormalizedEvent[]).filter((event) => {
      if (!event.jambaseId || seenIds.has(event.jambaseId)) return false;
      seenIds.add(event.jambaseId);
      return true;
    });
    fetched += events.length;

    if (!dryRun) {
      for (let index = 0; index < events.length; index += 25) {
        const result = await ctx.runMutation(api.shows.importUpcoming, { events: events.slice(index, index + 25) });
        inserted += result.inserted;
        updated += result.updated;
      }
    }

    if (dryRun) break;
    page += 1;
  } while (page <= totalPages && page <= maxPages);

  return {
    available,
    fetched,
    inserted,
    updated,
    pages: dryRun ? 1 : Math.min(totalPages, maxPages),
    truncated: totalPages > maxPages,
  };
}

function combineSummaries(summaries: ImportSummary[]): ImportSummary {
  return summaries.reduce<ImportSummary>(
    (total, summary) => ({
      available: total.available + summary.available,
      fetched: total.fetched + summary.fetched,
      inserted: total.inserted + summary.inserted,
      updated: total.updated + summary.updated,
      pages: total.pages + summary.pages,
      truncated: total.truncated || summary.truncated,
    }),
    { available: 0, fetched: 0, inserted: 0, updated: 0, pages: 0, truncated: false },
  );
}

export const syncCatalog = action({
  args: {
    cityId: v.string(),
    cityName: v.string(),
    today: v.optional(v.string()),
    historyDays: v.optional(v.number()),
    maxPagesPerRange: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    historicalArtistNames: v.optional(v.array(v.string())),
    historicalArtistIds: v.optional(v.array(v.string())),
    reconcileHistorical: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ historical: ImportSummary; upcoming: ImportSummary; historicalArtists: number; historicalRemoved: number }> => {
    const today = args.today ?? isoDate(new Date());
    const historyStart = isoDate(addDays(new Date(`${today}T12:00:00Z`), -(args.historyDays ?? 365) + 1));
    const historyEnd = isoDate(addDays(new Date(`${today}T12:00:00Z`), -1));
    const maxPages = Math.min(Math.max(args.maxPagesPerRange ?? 30, 1), 50);
    const common = {
      geoCityId: args.cityId,
      perPage: "100",
    };

    const festivalParams = new URLSearchParams({
      name: "Outside Lands",
      geoCityId: args.cityId,
      eventDateFrom: today,
      perPage: "10",
    });
    const festivalPayload = args.historicalArtistIds?.length
      ? null
      : await fetchJamBase(`/events?${festivalParams.toString()}`);
    const festivalEvents = festivalPayload
      ? normalizeUpcomingEvents(festivalPayload) as NormalizedEvent[]
      : [];
    const historicalArtistIds = [...new Set(
      args.historicalArtistIds?.length
        ? args.historicalArtistIds
        : festivalEvents.flatMap((event) => event.artistJambaseIds ?? []),
    )];
    const festivalShows = historicalArtistIds.length || args.historicalArtistNames?.length
      ? []
      : await ctx.runQuery(api.shows.listByFestival, { festivalId: "outside-lands-2026" });
    const historicalArtistNames = [...new Set(
      args.historicalArtistNames?.length
        ? args.historicalArtistNames
        : festivalShows.flatMap((show) => show.artistNames),
    )];
    if (!historicalArtistIds.length && !historicalArtistNames.length) {
      throw new Error("No historical artists are available to satisfy the JamBase trial filter");
    }

    const historicalSummaries: ImportSummary[] = [];
    const historicalIds = new Set<string>();
    const historicalScope = historicalArtistIds.length ? historicalArtistIds : historicalArtistNames;
    for (let index = 0; index < historicalScope.length; index += 10) {
      const artistBatch = historicalScope.slice(index, index + 10);
      const historicalParams = new URLSearchParams({
        ...common,
        [historicalArtistIds.length ? "artistId" : "artistName"]: artistBatch.join("|"),
        eventDateFrom: historyStart,
        eventDateTo: historyEnd,
        expandPastEvents: "true",
        sort: "-eventDate",
      });
      historicalSummaries.push(
        await importRange(ctx, historicalParams, maxPages, args.dryRun ?? false, historicalIds),
      );
    }
    const upcomingParams = new URLSearchParams({
      ...common,
      eventDateFrom: today,
      sort: "eventDate",
    });

    const historical = combineSummaries(historicalSummaries);
    let historicalRemoved = 0;
    if (args.reconcileHistorical && !args.dryRun && !historical.truncated) {
      const result = await ctx.runMutation(api.shows.reconcileImportedRange, {
        city: args.cityName,
        from: historyStart,
        to: historyEnd,
        keepJambaseIds: [...historicalIds],
      });
      historicalRemoved = result.removed;
    }
    const upcoming = await importRange(ctx, upcomingParams, maxPages, args.dryRun ?? false, new Set());
    return { historical, upcoming, historicalArtists: historicalScope.length, historicalRemoved };
  },
});

export const fetchUpcoming = action({
  args: {
    sourceUrl: v.string(),
    festivalId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.JAMBASE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing JAMBASE_API_KEY environment variable");
    }

    const response = await fetch(validateJamBaseSourceUrl(args.sourceUrl), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "ShowtonicHack/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`JamBase fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return normalizeUpcomingEvents(payload, args.festivalId);
  },
});

export const syncUpcoming = action({
  args: {
    sourceUrl: v.string(),
    festivalId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ inserted: number; updated: number; total: number }> => {
    const apiKey = process.env.JAMBASE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing JAMBASE_API_KEY environment variable");
    }

    const response = await fetch(validateJamBaseSourceUrl(args.sourceUrl), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "ShowtonicHack/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`JamBase fetch failed with status ${response.status}`);
    }

    const events = normalizeUpcomingEvents(await response.json(), args.festivalId);
    return ctx.runMutation(api.shows.importUpcoming, { events });
  },
});
