import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import {
  normalizeTicketmasterEvents,
  normalizeSetlistFmSetlists,
  normalizeBandsintownEvents,
  spotifyArtistFields,
  musicbrainzArtistFields,
  inferGenresFromContext,
  artistGenreUpdatesFromEvents,
  dateWindows,
  splitDateWindow,
  toImportEvents,
} from "./freeEventsUtils.js";
import type { NormalizedFreeEvent } from "./freeEventsUtils.js";

// Free replacement for convex/jambaseUtils + jambase.ts. Same normalized event
// shape, same `shows.importUpcoming` sink — sourced from public APIs instead of
// JamBase's paid catalog. See docs/FREE_DATA.md for the full mapping.

const TICKETMASTER_ORIGIN = "https://app.ticketmaster.com/discovery/v2";
const SETLISTFM_ORIGIN = "https://api.setlist.fm/rest/1.0";
const MUSICBRAINZ_ORIGIN = "https://musicbrainz.org/ws/2";
const BANDSINTOWN_ORIGIN = "https://rest.bandsintown.com";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ORIGIN = "https://api.spotify.com/v1";

const USER_AGENT = "ShowtonicHack/1.0 (https://showtonic.app; contact@showtonic.app)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

type ImportSummary = {
  available: number;
  fetched: number;
  inserted: number;
  updated: number;
  pages: number;
  truncated: boolean;
  // Artists that got genres from the source's event classifications.
  genreArtists: number;
};

function emptySummary(): ImportSummary {
  return {
    available: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    pages: 0,
    truncated: false,
    genreArtists: 0,
  };
}

async function sink(
  ctx: Pick<ActionCtx, "runMutation">,
  events: NormalizedFreeEvent[],
  dryRun: boolean,
): Promise<{ inserted: number; updated: number; genreArtists: number }> {
  if (dryRun || events.length === 0) return { inserted: 0, updated: 0, genreArtists: 0 };
  const importable = toImportEvents(events);
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < importable.length; i += 25) {
    const result = await ctx.runMutation(api.shows.importUpcoming, {
      events: importable.slice(i, i + 25),
    });
    inserted += result.inserted;
    updated += result.updated;
  }

  // Harvest the genre/subGenre the events already carried. Runs after the
  // import so the artist rows it keys off exist. Sourced, free, and it never
  // clobbers a richer Spotify/MusicBrainz tag.
  let genreArtists = 0;
  const updates = artistGenreUpdatesFromEvents(events);
  for (let i = 0; i < updates.length; i += 50) {
    const result = await ctx.runMutation(api.artists.applyEventGenres, {
      updates: updates.slice(i, i + 50),
    });
    genreArtists += result.patched;
  }
  return { inserted, updated, genreArtists };
}

// ---------------------------------------------------------------------------
// Ticketmaster Discovery — future shows for a city (the "upcoming" sync).
// ---------------------------------------------------------------------------

// Ticketmaster's own docs disagree on the per-second limit: Getting Started
// says 5 req/s, the FAQ says 2 req/s. Both agree on 5,000/day. We pace to the
// conservative bound — a 429 here costs us the way the JamBase quota did.
const TICKETMASTER_PACING_MS = 500;

// Officially documented: "we only support retrieving the 1000th item.
// i.e. ( size * page < 1000 )". A city with more upcoming shows than this
// cannot be paged through — it has to be sliced into narrower date windows.
const TICKETMASTER_ITEM_CAP = 1000;
const TICKETMASTER_PAGE_SIZE = 100;

// A 429 is not a transient error to retry through — the daily quota may be
// gone. Distinguish it so callers can stop cleanly and report partial work.
class TicketmasterRateLimited extends Error {
  resetAt?: string;
  constructor(resetAt?: string) {
    super("Ticketmaster returned 429 (rate limit or daily quota reached)");
    this.name = "TicketmasterRateLimited";
    this.resetAt = resetAt;
  }
}

async function fetchTicketmaster(params: URLSearchParams) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("Missing TICKETMASTER_API_KEY environment variable");
  params.set("apikey", apiKey);
  const response = await fetch(`${TICKETMASTER_ORIGIN}/events.json?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (response.status === 429) {
    // No Retry-After is documented; Rate-Limit-Reset is a UTC timestamp.
    throw new TicketmasterRateLimited(response.headers.get("Rate-Limit-Reset") ?? undefined);
  }
  if (!response.ok) {
    throw new Error(`Ticketmaster fetch failed with status ${response.status}`);
  }
  return response.json();
}

async function importTicketmasterUpcoming(
  ctx: Pick<ActionCtx, "runMutation">,
  city: string,
  today: string,
  maxPages: number,
  dryRun: boolean,
  seen: Set<string>,
): Promise<ImportSummary> {
  const summary = emptySummary();
  let page = 0;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      city,
      classificationName: "Music",
      startDateTime: `${today}T00:00:00Z`,
      size: "100",
      page: String(page),
      sort: "date,asc",
    });
    const payload = await fetchTicketmaster(params);
    summary.available = Number(payload?.page?.totalElements ?? 0);
    totalPages = Number(payload?.page?.totalPages ?? 1);
    const events = normalizeTicketmasterEvents(payload).filter((event) => {
      if (seen.has(event.jambaseId)) return false;
      seen.add(event.jambaseId);
      return true;
    });
    summary.fetched += events.length;
    const { inserted, updated, genreArtists } = await sink(ctx, events, dryRun);
    summary.inserted += inserted;
    summary.updated += updated;
    summary.genreArtists += genreArtists;
    summary.pages += 1;
    if (dryRun) break;
    page += 1;
    await sleep(TICKETMASTER_PACING_MS);
  } while (page < totalPages && page < maxPages);

  summary.truncated = totalPages > maxPages;
  return summary;
}

// ---------------------------------------------------------------------------
// Windowed catalog expansion.
//
// `importTicketmasterUpcoming` above pages one open-ended query, which tops out
// at the documented 1000-item cap — fine for a city with 807 upcoming shows,
// silently lossy for one with 2,011. This walks a date horizon in windows
// instead, splitting any window that reports more items than can be paged, so
// the whole catalog is reachable. Nothing here writes past `shows.importUpcoming`
// and every id stays namespaced `tm:`.
// ---------------------------------------------------------------------------

type WindowedResult = ImportSummary & {
  windows: number;
  requests: number;
  splits: number;
  rateLimited: boolean;
  budgetExhausted: boolean;
};

async function importTicketmasterWindow(
  ctx: Pick<ActionCtx, "runMutation">,
  city: string,
  horizonStart: string,
  horizonEnd: string,
  windowDays: number,
  maxRequests: number,
  dryRun: boolean,
  seen: Set<string>,
): Promise<WindowedResult> {
  const result: WindowedResult = {
    ...emptySummary(),
    windows: 0,
    requests: 0,
    splits: 0,
    rateLimited: false,
    budgetExhausted: false,
  };
  const maxPages = Math.floor(TICKETMASTER_ITEM_CAP / TICKETMASTER_PAGE_SIZE);

  // Queue of [start, end) date windows; a window too dense to page is split.
  const queue: [string, string][] = dateWindows(horizonStart, horizonEnd, windowDays);

  const query = (start: string, end: string, page: number) =>
    new URLSearchParams({
      city,
      classificationName: "Music",
      startDateTime: `${start}T00:00:00Z`,
      endDateTime: `${end}T00:00:00Z`,
      size: String(TICKETMASTER_PAGE_SIZE),
      page: String(page),
      sort: "date,asc",
    });

  try {
    while (queue.length > 0) {
      if (result.requests >= maxRequests) {
        result.budgetExhausted = true;
        break;
      }
      const [start, end] = queue.shift()!;

      const first = await fetchTicketmaster(query(start, end, 0));
      result.requests += 1;
      const total = Number(first?.page?.totalElements ?? 0);

      // Too dense to page through: halve the window and try each half. A
      // single-day window that still overflows is genuinely unreachable, so
      // take what we can page and record the truncation honestly.
      const halves = total > TICKETMASTER_ITEM_CAP ? splitDateWindow([start, end]) : null;
      if (halves) {
        queue.unshift(...halves);
        result.splits += 1;
        await sleep(TICKETMASTER_PACING_MS);
        continue;
      }
      if (total > TICKETMASTER_ITEM_CAP) result.truncated = true;

      result.windows += 1;
      result.available += total;
      const totalPages = Number(first?.page?.totalPages ?? 1);

      let payload = first;
      for (let page = 0; page < Math.min(totalPages, maxPages); page += 1) {
        if (page > 0) {
          if (result.requests >= maxRequests) {
            result.budgetExhausted = true;
            break;
          }
          await sleep(TICKETMASTER_PACING_MS);
          payload = await fetchTicketmaster(query(start, end, page));
          result.requests += 1;
        }
        const events = normalizeTicketmasterEvents(payload).filter((event) => {
          if (seen.has(event.jambaseId)) return false;
          seen.add(event.jambaseId);
          return true;
        });
        result.fetched += events.length;
        const { inserted, updated, genreArtists } = await sink(ctx, events, dryRun);
        result.inserted += inserted;
        result.updated += updated;
        result.genreArtists += genreArtists;
        result.pages += 1;
      }
      await sleep(TICKETMASTER_PACING_MS);
    }
  } catch (error) {
    if (!(error instanceof TicketmasterRateLimited)) throw error;
    // Stop cleanly and keep everything already imported — the run is resumable
    // because importUpcoming upserts by id.
    result.rateLimited = true;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Setlist.fm — historical shows (+ setlists) for named artists.
// ---------------------------------------------------------------------------

async function fetchSetlistFm(path: string) {
  const apiKey = process.env.SETLISTFM_API_KEY;
  if (!apiKey) throw new Error("Missing SETLISTFM_API_KEY environment variable");
  const response = await fetch(`${SETLISTFM_ORIGIN}${path}`, {
    headers: { Accept: "application/json", "x-api-key": apiKey, "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return { setlist: [] }; // no setlists for this artist
  if (!response.ok) {
    throw new Error(`Setlist.fm fetch failed with status ${response.status}`);
  }
  return response.json();
}

async function resolveMbid(name: string): Promise<string | undefined> {
  const params = new URLSearchParams({
    query: `artist:"${name}"`,
    fmt: "json",
    limit: "1",
  });
  const response = await fetch(`${MUSICBRAINZ_ORIGIN}/artist?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  await sleep(1100); // MusicBrainz asks for <= 1 req/s
  if (!response.ok) return undefined;
  const payload = await response.json();
  return musicbrainzArtistFields(payload).mbid;
}

async function importSetlistFmHistory(
  ctx: Pick<ActionCtx, "runMutation">,
  artistNames: string[],
  historyStart: string,
  historyEnd: string,
  maxPagesPerArtist: number,
  dryRun: boolean,
  seen: Set<string>,
): Promise<ImportSummary & { artists: number }> {
  const summary: ImportSummary & { artists: number } = { ...emptySummary(), artists: 0 };

  for (const name of artistNames) {
    const mbid = await resolveMbid(name);
    let page = 1;
    let totalPages = 1;
    summary.artists += 1;

    do {
      const query = new URLSearchParams({ p: String(page) });
      if (mbid) query.set("artistMbid", mbid);
      else query.set("artistName", name);
      const payload = await fetchSetlistFm(`/search/setlists?${query.toString()}`);
      const total = Number(payload?.total ?? 0);
      const perPage = Number(payload?.itemsPerPage ?? 20) || 20;
      totalPages = Math.max(1, Math.ceil(total / perPage));
      summary.available += total;

      const events = normalizeSetlistFmSetlists(payload)
        .filter((event) => event.date >= historyStart && event.date <= historyEnd)
        .filter((event) => {
          if (seen.has(event.jambaseId)) return false;
          seen.add(event.jambaseId);
          return true;
        });
      summary.fetched += events.length;
      const { inserted, updated, genreArtists } = await sink(ctx, events, dryRun);
      summary.inserted += inserted;
      summary.updated += updated;
      summary.genreArtists += genreArtists;
      summary.pages += 1;

      // Setlists are newest-first; once a page is entirely older than the
      // window there is no point paging further back.
      const pageDates = normalizeSetlistFmSetlists(payload).map((e) => e.date);
      const allOlder = pageDates.length > 0 && pageDates.every((d) => d < historyStart);
      if (dryRun || allOlder) break;
      page += 1;
      await sleep(600); // Setlist.fm allows ~2 req/s
    } while (page <= totalPages && page <= maxPagesPerArtist);
  }

  summary.truncated = false;
  return summary;
}

// ---------------------------------------------------------------------------
// Bandsintown — per-artist future dates, to catch non-Ticketmaster inventory.
// Global results, filtered to the target city. Opt-in (BANDSINTOWN_APP_ID).
// ---------------------------------------------------------------------------

async function importBandsintownUpcoming(
  ctx: Pick<ActionCtx, "runMutation">,
  artistNames: string[],
  city: string,
  today: string,
  dryRun: boolean,
  seen: Set<string>,
): Promise<ImportSummary> {
  const appId = process.env.BANDSINTOWN_APP_ID;
  const summary = emptySummary();
  if (!appId) return summary; // silently skip when not configured
  const cityNeedle = city.toLowerCase();

  for (const name of artistNames) {
    const url = `${BANDSINTOWN_ORIGIN}/artists/${encodeURIComponent(name)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`;
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
    summary.pages += 1;
    if (response.ok) {
      const payload = await response.json();
      const events = normalizeBandsintownEvents(payload, name)
        .filter((event) => event.date >= today && event.city.toLowerCase().includes(cityNeedle))
        .filter((event) => {
          if (seen.has(event.jambaseId)) return false;
          seen.add(event.jambaseId);
          return true;
        });
      summary.available += events.length;
      summary.fetched += events.length;
      const { inserted, updated, genreArtists } = await sink(ctx, events, dryRun);
      summary.inserted += inserted;
      summary.updated += updated;
      summary.genreArtists += genreArtists;
    }
    await sleep(300);
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

export const syncFreeCatalog = action({
  args: {
    city: v.string(), // e.g. "San Francisco"
    today: v.optional(v.string()),
    historyDays: v.optional(v.number()),
    maxPagesPerRange: v.optional(v.number()),
    historicalArtistNames: v.optional(v.array(v.string())),
    includeHistory: v.optional(v.boolean()),
    includeBandsintown: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    upcoming: ImportSummary;
    historical: ImportSummary;
    historicalArtists: number;
    sources: { upcoming: string[]; historical: string };
  }> => {
    const today = args.today ?? isoDate(new Date());
    const historyStart = isoDate(
      addDays(new Date(`${today}T12:00:00Z`), -(args.historyDays ?? 365) + 1),
    );
    const historyEnd = isoDate(addDays(new Date(`${today}T12:00:00Z`), -1));
    const maxPages = Math.min(Math.max(args.maxPagesPerRange ?? 10, 1), 50);
    const dryRun = args.dryRun ?? false;

    const upcomingSeen = new Set<string>();
    const upcoming = await importTicketmasterUpcoming(
      ctx,
      args.city,
      today,
      maxPages,
      dryRun,
      upcomingSeen,
    );
    const upcomingSources = ["ticketmaster"];

    // Historical (and Bandsintown) need an artist scope (like JamBase's trial),
    // so default to the seeded Outside Lands lineup when no names are passed.
    let lineupNames = args.historicalArtistNames ?? [];
    if (lineupNames.length === 0) {
      const festivalShows = await ctx.runQuery(api.shows.listByFestival, {
        festivalId: "outside-lands-2026",
      });
      lineupNames = [...new Set(festivalShows.flatMap((show) => show.artistNames))];
    }

    // Optional Bandsintown pass folds non-Ticketmaster future dates into the
    // same upcoming summary and dedup set.
    if (args.includeBandsintown && lineupNames.length > 0) {
      const bit = await importBandsintownUpcoming(
        ctx,
        lineupNames,
        args.city,
        today,
        dryRun,
        upcomingSeen,
      );
      upcoming.available += bit.available;
      upcoming.fetched += bit.fetched;
      upcoming.inserted += bit.inserted;
      upcoming.updated += bit.updated;
      upcoming.pages += bit.pages;
      upcoming.genreArtists += bit.genreArtists;
      upcomingSources.push("bandsintown");
    }

    let historical: ImportSummary = emptySummary();
    let historicalArtists = 0;
    if ((args.includeHistory ?? true) && lineupNames.length > 0) {
      const result = await importSetlistFmHistory(
        ctx,
        lineupNames,
        historyStart,
        historyEnd,
        maxPages,
        dryRun,
        new Set<string>(),
      );
      historicalArtists = result.artists;
      historical = {
        available: result.available,
        fetched: result.fetched,
        inserted: result.inserted,
        updated: result.updated,
        pages: result.pages,
        truncated: result.truncated,
        genreArtists: result.genreArtists,
      };
    }

    return {
      upcoming,
      historical,
      historicalArtists,
      sources: { upcoming: upcomingSources, historical: "setlist.fm" },
    };
  },
});

// Catalog expansion: import every upcoming music event across one or more
// cities, walking a date horizon in windows so the documented 1000-item paging
// cap cannot silently truncate a dense city.
//
// Resumable and idempotent — `shows.importUpcoming` upserts by id, so a run cut
// short by the rate limit or the request budget can simply be run again.
// `maxRequests` is a guard against the 5,000/day quota, not a target.
export const syncUpcomingCatalog = action({
  args: {
    cities: v.array(v.string()),
    today: v.optional(v.string()),
    horizonDays: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    maxRequests: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    totals: WindowedResult;
    byCity: (WindowedResult & { city: string })[];
    horizon: { start: string; end: string; windowDays: number };
  }> => {
    const today = args.today ?? isoDate(new Date());
    const horizonDays = Math.min(Math.max(args.horizonDays ?? 180, 1), 730);
    const windowDays = Math.min(Math.max(args.windowDays ?? 30, 1), 180);
    const maxRequests = Math.min(Math.max(args.maxRequests ?? 400, 1), 4000);
    const dryRun = args.dryRun ?? false;
    const horizonEnd = isoDate(addDays(new Date(`${today}T12:00:00Z`), horizonDays));

    const seen = new Set<string>();
    const byCity: (WindowedResult & { city: string })[] = [];
    const totals: WindowedResult = {
      ...emptySummary(),
      windows: 0,
      requests: 0,
      splits: 0,
      rateLimited: false,
      budgetExhausted: false,
    };

    for (const city of args.cities) {
      // Share the request budget across cities so one dense city cannot spend
      // the whole daily quota before the others are touched.
      const remaining = maxRequests - totals.requests;
      if (remaining <= 0) {
        totals.budgetExhausted = true;
        break;
      }
      const result = await importTicketmasterWindow(
        ctx,
        city,
        today,
        horizonEnd,
        windowDays,
        remaining,
        dryRun,
        seen,
      );
      byCity.push({ city, ...result });
      totals.available += result.available;
      totals.fetched += result.fetched;
      totals.inserted += result.inserted;
      totals.updated += result.updated;
      totals.pages += result.pages;
      totals.genreArtists += result.genreArtists;
      totals.windows += result.windows;
      totals.requests += result.requests;
      totals.splits += result.splits;
      totals.truncated ||= result.truncated;
      totals.rateLimited ||= result.rateLimited;
      totals.budgetExhausted ||= result.budgetExhausted;
      if (result.rateLimited) break; // quota is shared; stop touching the API
    }

    return { totals, byCity, horizon: { start: today, end: horizonEnd, windowDays } };
  },
});

// Preview a single source without writing, for demos / debugging.
export const previewFreeUpcoming = action({
  args: { city: v.string(), today: v.optional(v.string()) },
  handler: async (_ctx, args): Promise<NormalizedFreeEvent[]> => {
    const today = args.today ?? isoDate(new Date());
    const payload = await fetchTicketmaster(
      new URLSearchParams({
        city: args.city,
        classificationName: "Music",
        startDateTime: `${today}T00:00:00Z`,
        size: "20",
        sort: "date,asc",
      }),
    );
    return normalizeTicketmasterEvents(payload);
  },
});

// ---------------------------------------------------------------------------
// Artist enrichment — image / genres / hometown / preview, from Spotify + MB.
// Fills the empty artist rows that importUpcoming creates.
// ---------------------------------------------------------------------------

// Enrichment drains thousands of artists against third-party APIs, so a 429, a
// 5xx, or a dropped connection is routine rather than exceptional. Letting one
// throw would abort the whole batch and — worse — break the self-scheduling
// chain in enrichArtistsContinuously, silently stalling the drain. A failed
// lookup degrades to "no data for this artist"; the next pass retries it,
// because listNeedingEnrichment still reports it as missing.
async function fetchJsonOrNull(
  url: string,
  headers: Record<string, string>,
): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function spotifyToken(): Promise<string | undefined> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return undefined;
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) return undefined;
  const payload = await response.json();
  return typeof payload?.access_token === "string" ? payload.access_token : undefined;
}

export const enrichArtists = action({
  args: { limit: v.optional(v.number()), dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ scanned: number; enriched: number; skipped: number; fromContext: number }> => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const artists = await ctx.runQuery(api.artists.listNeedingEnrichment, { limit });
    const token = await spotifyToken();

    let enriched = 0;
    let skipped = 0;
    let fromContext = 0;

    for (const artist of artists) {
      const patch: {
        image?: string;
        genres?: string[];
        hometown?: string;
        topTrack?: string;
        genreSource?: string;
      } = {};

      if (token) {
        const payload = await fetchJsonOrNull(
          `${SPOTIFY_ORIGIN}/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`,
          { Authorization: `Bearer ${token}`, Accept: "application/json" },
        );
        if (payload) {
          const fields = spotifyArtistFields(payload);
          if (fields.image) patch.image = fields.image;
          if (fields.genres && fields.genres.length) {
            patch.genres = fields.genres;
            patch.genreSource = "spotify";
          }
          if (fields.spotifyUrl) patch.topTrack = fields.spotifyUrl;
        }
        await sleep(120);
      }

      // MusicBrainz fills hometown and a genre fallback when Spotify is quiet.
      if (!patch.genres || !patch.hometown) {
        const payload = await fetchJsonOrNull(
          `${MUSICBRAINZ_ORIGIN}/artist?${new URLSearchParams({
            query: `artist:"${artist.name}"`,
            fmt: "json",
            limit: "1",
          }).toString()}`,
          { Accept: "application/json", "User-Agent": USER_AGENT },
        );
        await sleep(1100);
        if (payload) {
          const fields = musicbrainzArtistFields(payload);
          if (!patch.hometown && fields.hometown) patch.hometown = fields.hometown;
          if ((!patch.genres || !patch.genres.length) && fields.genres?.length) {
            patch.genres = fields.genres;
            patch.genreSource = "musicbrainz";
          }
        }
      }

      // Last resort: neither Spotify nor MusicBrainz knows this act (a local
      // support slot, a DJ, a community-hall booking). Infer from the rooms
      // and titles it's actually booked under — a Public Works listing is not
      // a Davies Symphony Hall listing.
      if (!patch.genres || !patch.genres.length) {
        const inferred = inferGenresFromContext({
          venueNames: artist.venueNames,
          titles: artist.titles,
        });
        if (inferred.length) {
          patch.genres = inferred;
          patch.genreSource = "context";
          fromContext += 1;
        }
      }

      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }
      if (!args.dryRun) {
        await ctx.runMutation(api.artists.enrich, { artistId: artist._id, ...patch });
      }
      enriched += 1;
    }

    return { scanned: artists.length, enriched, skipped, fromContext };
  },
});

// Drives enrichArtists across the whole backlog with one call: runs a batch,
// then reschedules itself for the next one until a batch comes back scanning
// fewer than `limit` artists (the backlog is empty) or maxBatches is hit.
// Safe to call repeatedly or interrupt — each batch is independently
// idempotent (see enrichArtists), so resuming just means calling this again.
const MAX_CONSECUTIVE_BATCH_FAILURES = 5;

export const enrichArtistsContinuously = action({
  args: {
    limit: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
    batchIndex: v.optional(v.number()),
    failures: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    batchIndex: number;
    scanned: number;
    enriched: number;
    skipped: number;
    fromContext: number;
    done: boolean;
    failed: boolean;
  }> => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const maxBatches = Math.max(args.maxBatches ?? 200, 1);
    const batchIndex = args.batchIndex ?? 0;
    const failures = args.failures ?? 0;

    // A batch can still fail as a whole (a Convex-level error, a bad Spotify
    // token). Losing the chain here would stall the drain with no signal, so
    // reschedule with a backoff and only give up after several in a row.
    let result: { scanned: number; enriched: number; skipped: number; fromContext: number } | null =
      null;
    try {
      result = await ctx.runAction(api.freeEvents.enrichArtists, { limit });
    } catch {
      result = null;
    }

    const failed = result === null;
    const nextFailures = failed ? failures + 1 : 0;
    // Fewer than a full page means the backlog is empty. A failed batch is not
    // "done" — it has to be retried, not treated as a finish line.
    const done = !failed && result!.scanned < limit;
    const exhausted = nextFailures >= MAX_CONSECUTIVE_BATCH_FAILURES;

    if (!done && !exhausted && batchIndex + 1 < maxBatches) {
      await ctx.scheduler.runAfter(
        failed ? 5_000 * nextFailures : 500,
        api.freeEvents.enrichArtistsContinuously,
        { limit, maxBatches, batchIndex: batchIndex + 1, failures: nextFailures },
      );
    }

    return {
      batchIndex,
      scanned: result?.scanned ?? 0,
      enriched: result?.enriched ?? 0,
      skipped: result?.skipped ?? 0,
      fromContext: result?.fromContext ?? 0,
      done,
      failed,
    };
  },
});
