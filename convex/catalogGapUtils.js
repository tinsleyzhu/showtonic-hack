// Catalog-gap agent — pure logic.
//
// A night with photos and no catalog match is not a failure; it is a hole in
// the catalog. This module turns such a night into a *proposal*: "the web says
// Peggy Gou played 1015 Folsom that night, here is the URL." Nothing here
// writes anything and nothing here enters a diary — `convex/catalogGap.ts` does
// the I/O, and a human approves the proposal before it becomes a show.
//
// Two rules shape every threshold below:
//
//   1. A proposal creates CATALOG data, which many users will then match
//      against. So its bar is higher than the matcher's, not lower.
//   2. Declining is a valid answer. A night we cannot explain stays unexplained
//      rather than becoming a plausible-looking invention.
//
// See docs/agent-hack/SPEC.md "1b. Catalog-gap agent".

import { haversineMeters } from "./backfillMatch.js";

// Confidence deltas for a proposal. Date and venue are the two facts that make
// a web result about *this* night rather than some other night at some other
// room; everything else is corroboration.
const DELTA_DATE_CONFIRMED = 0.4;
const DELTA_VENUE_CONFIRMED = 0.3;
const DELTA_TICKETING_DOMAIN = 0.15;
const DELTA_CORROBORATED = 0.15;
// No GPS means we never had a venue to anchor on and the query was city-wide:
// the result may well describe a real show that this person did not attend.
const DELTA_NO_VENUE_ANCHOR = -0.25;

const MIN_PROPOSAL_CONFIDENCE = 0.6;

// How far from the cluster's median position a venue can be and still be the
// plausible room. Wider than the matcher's 150 m "same block" band, because
// here we are generating search anchors, not asserting a match.
const VENUE_ANCHOR_METERS = 400;
const MAX_VENUE_ANCHORS = 3;

// Domains that publish event listings with dates. Presence is a small boost,
// absence is not a penalty — a venue's own site is often the best source and
// will never be on a list like this.
// A social page can confirm a night that a listing already named, but it may
// never be the only source: its titles are captions, not billings.
const SOCIAL_DOMAINS = ["facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com"];

const TICKETING_DOMAINS = [
  "ticketmaster.com",
  "livenation.com",
  "dice.fm",
  "ra.co",
  "residentadvisor.net",
  "songkick.com",
  "bandsintown.com",
  "eventbrite.com",
  "seetickets.us",
  "axs.com",
  "tixr.com",
  "setlist.fm",
  "shotgun.live",
];

// Words that are never an artist name. A fragment built only out of these is
// listings furniture ("Upcoming Shows", "Buy Tickets"), not a bill — so the
// test is per-word and the whole fragment must be noise to be discarded.
const NOISE_WORDS = new Set([
  "tickets",
  "ticket",
  "events",
  "event",
  "concerts",
  "concert",
  "calendar",
  "schedule",
  "live",
  "lineup",
  "shows",
  "show",
  "upcoming",
  "past",
  "official",
  "site",
  "home",
  "buy",
  "tour",
  "dates",
  "date",
  "listings",
  "listing",
  "and",
  "the",
  "at",
  "in",
  "on",
  "for",
]);

// Social posts are promotional prose, not listings: "Register for presale now
// 〰️ themidwaysf.com + galantis Block Party szn is in full bloom". The clean
// fixtures never produced anything like it; the first real 28-night sweep
// proposed one as an artist name. A name has to look like a name.
const PROMO_PHRASES =
  /\b(register|presale|pre-?sale|on sale|sold out|rsvp|announce|announcing|lineup drop|full bloom|link in bio|swipe|szn|giveaway|doors at|tickets? (?:are |now )?(?:live|available|on sale))\b/i;

function looksLikePromoProse(value) {
  const text = String(value ?? "");
  if (PROMO_PHRASES.test(text)) return true;
  // A domain inside the "artist name" means the title was marketing copy.
  if (/\b[a-z0-9-]+\s*\.\s*(?:com|net|org|co|fm|live|io)\b/i.test(text)) return true;
  // Emoji and dingbats belong to social captions, never to a billed act.
  if (/[\u2190-\u2BFF\u2600-\u27BF\uFE0F\u{1F000}-\u{1FAFF}]/u.test(text)) return true;
  // Real bills are short. Six words is already generous for one act.
  if (text.trim().split(/\s+/).length > 6) return true;
  // A truncated snippet is not a name.
  if (/(?:\.\.\.|…)$/.test(text.trim())) return true;
  return false;
}

function isTitleNoise(value) {
  const words = normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((word) => NOISE_WORDS.has(word));
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// ---------------------------------------------------------------------------
// Venue anchoring
// ---------------------------------------------------------------------------

// Which rooms were the photos actually near? These become the search anchor,
// and they are why the gap agent asks a specific question ("what played at The
// Midway on 27 June") rather than a hopeless one ("SF concerts 27 June").
function nearestVenues(gps, venues, options = {}) {
  const radius = options.radiusMeters ?? VENUE_ANCHOR_METERS;
  const limit = options.limit ?? MAX_VENUE_ANCHORS;
  if (!gps) return [];
  return (Array.isArray(venues) ? venues : [])
    .map((venue) => ({
      venue,
      distanceMeters: haversineMeters(gps, {
        latitude: venue.latitude,
        longitude: venue.longitude,
      }),
    }))
    .filter((row) => row.distanceMeters !== null && row.distanceMeters <= radius)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, limit)
    .map((row) => ({
      name: row.venue.name,
      city: row.venue.city ?? null,
      venueId: row.venue.id ?? row.venue._id ?? null,
      latitude: row.venue.latitude,
      longitude: row.venue.longitude,
      distanceMeters: Math.round(row.distanceMeters),
    }));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function splitIsoDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ""));
  if (!match) return null;
  const [, year, month, day] = match;
  return { year, month, day, monthIndex: Number(month) - 1, dayNumber: Number(day) };
}

function longDate(isoDate) {
  const parts = splitIsoDate(isoDate);
  if (!parts) return "";
  const month = MONTHS[parts.monthIndex];
  const name = month ? month[0].toUpperCase() + month.slice(1) : "";
  return `${name} ${parts.dayNumber}, ${parts.year}`;
}

// Every written form of one date that a listings page might use. A result is
// only about this night if one of these appears in it — that check is what
// stops the agent proposing last year's show at the same room.
function dateNeedles(isoDate) {
  const parts = splitIsoDate(isoDate);
  if (!parts) return [];
  const { year, month, day, monthIndex, dayNumber } = parts;
  const monthName = MONTHS[monthIndex] ?? "";
  const abbreviation = monthName.slice(0, 3);
  const shortYear = year.slice(2);
  // Both the padded and unpadded day, for the month-name forms as well as the
  // numeric ones. Listings write "May 2, 2026" and "May 02, 2026" about equally
  // often, and missing the padded form threw away nights whose answer was
  // sitting in the result title.
  return [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}${month}${day}`,
    `${monthName} ${dayNumber}, ${year}`,
    `${monthName} ${dayNumber} ${year}`,
    `${monthName} ${day}, ${year}`,
    `${monthName} ${day} ${year}`,
    `${abbreviation} ${dayNumber}, ${year}`,
    `${abbreviation} ${dayNumber} ${year}`,
    `${abbreviation} ${day}, ${year}`,
    `${abbreviation} ${day} ${year}`,
    `${dayNumber} ${monthName} ${year}`,
    `${dayNumber} ${abbreviation} ${year}`,
    `${day} ${monthName} ${year}`,
    `${day} ${abbreviation} ${year}`,
    `${Number(month)}/${dayNumber}/${year}`,
    `${month}/${day}/${year}`,
    `${Number(month)}/${dayNumber}/${shortYear}`,
    `${month}/${day}/${shortYear}`,
    `${Number(month)}-${dayNumber}-${year}`,
  ].map((needle) => needle.toLowerCase());
}

// Listings very often write "Saturday, May 9" with no year at all, and
// requiring the year threw those nights away — it was the single biggest
// source of refusals in the first real history sweep.
//
// Relaxing the year outright would resurrect exactly the failure the year check
// exists to prevent: last year's show at the same venue. The weekday is the way
// out. "May 9" is a Saturday only in particular years, so weekday + month + day
// pins the year on its own — and the search window is already bounded to
// [date-400, date+30], which removes every other candidate year.
function weekdayDateNeedles(isoDate) {
  const parts = splitIsoDate(isoDate);
  if (!parts) return [];
  const { year, day, monthIndex, dayNumber } = parts;
  const stamp = new Date(Date.UTC(Number(year), monthIndex, dayNumber));
  const weekday = WEEKDAYS[stamp.getUTCDay()];
  if (!weekday) return [];
  const monthName = MONTHS[monthIndex] ?? "";
  const abbreviation = monthName.slice(0, 3);
  const shortDay = weekday.slice(0, 3);
  const needles = [];
  for (const dayLabel of [weekday, shortDay]) {
    for (const monthLabel of [monthName, abbreviation]) {
      for (const number of [String(dayNumber), day]) {
        needles.push(`${dayLabel}, ${monthLabel} ${number}`);
        needles.push(`${dayLabel} ${monthLabel} ${number}`);
      }
    }
  }
  return needles;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsDate(isoDate, ...texts) {
  const haystack = texts.map(normalizeText).join("   ");
  if (dateNeedles(isoDate).some((needle) => haystack.includes(needle))) return true;
  return weekdayDateNeedles(isoDate).some((needle) => haystack.includes(needle));
}

// ---------------------------------------------------------------------------
// History sweeps — nights the catalog is missing, not nights someone photographed
// ---------------------------------------------------------------------------

// Ticketmaster sells no past events and Setlist.fm needs a key we do not have,
// so the catalog has almost no history — and backfill matches against PAST
// shows. The same search that explains one unmatched night can walk a venue's
// calendar backwards and propose what it finds.
//
// The claim being made changes, and that is worth being precise about: a
// reclaim proposal says "you were probably here"; a history proposal says only
// "this show probably happened". Weaker claim, same evidence bar — a fabricated
// past show becomes catalog, and then other people's photos match against it.

// Tavily bills per search. `advanced` depth costs 2; the exact figure matters
// less than the fact that a caller can see the bill before agreeing to it.
const CREDITS_PER_ADVANCED_SEARCH = 2;

function eachNightInRange(from, to) {
  const start = splitIsoDate(from);
  const end = splitIsoDate(to);
  if (!start || !end || from > to) return [];
  const nights = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  while (cursor <= last) {
    nights.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

// The catalog's holes for one venue. A date the catalog already explains is
// left alone — this is for filling gaps, never for second-guessing rows that
// came from a first-party source.
function nightsMissingFromCatalog(from, to, datesWithShows) {
  const known = new Set(datesWithShows ?? []);
  return eachNightInRange(from, to).filter((night) => !known.has(night));
}

// What a sweep will cost before it runs. Tavily credits are finite and expire
// with the event, so a batch job that cannot say what it is about to spend is
// not one anybody should approve.
function estimateSweepCredits(nightCount, queriesPerNight = 1) {
  return Math.max(0, nightCount) * Math.max(1, queriesPerNight) * CREDITS_PER_ADVANCED_SEARCH;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// One query per venue anchor, plus a city-wide fallback only when we have no
// anchor at all. Quoting the venue keeps the search on the room; the long date
// keeps it on the night.
function buildGapQueries(gap) {
  const date = longDate(gap.clusterDate);
  if (!date) return [];
  const city = gap.city ? String(gap.city) : "";
  const anchors = (gap.venues ?? []).slice(0, MAX_VENUE_ANCHORS);
  if (anchors.length) {
    return anchors.map((venue) => ({
      anchorVenue: venue.name,
      query: `"${venue.name}"${city ? ` ${city}` : ""} concert lineup ${date}`,
    }));
  }
  if (!city) return [];
  return [{ anchorVenue: null, query: `live music concerts in ${city} on ${date}` }];
}

// ---------------------------------------------------------------------------
// Parsing a search result into a lineup
// ---------------------------------------------------------------------------

const TITLE_SEPARATORS = /\s+(?:@|at|live at|presents|—|–|-|\||·|:)\s+/i;

function stripTrailingNoise(value) {
  return String(value ?? "")
    .replace(/\s*\((?:official|live|19|20)\d*[^)]*\)\s*$/i, "")
    .replace(/\s+tickets?$/i, "")
    .replace(/\s+concert$/i, "")
    .replace(/\s+tour(?:\s+\d{4})?$/i, "")
    .replace(/^\s*(?:tickets?|buy tickets?)\s+for\s+/i, "")
    .replace(/[\s,\-–—|·:]+$/, "")
    .replace(/^[\s,\-–—|·:]+/, "")
    .trim();
}

// "Peggy Gou b2b Sammy Virji" and "Overmono + Salute" are one show with two
// names on the bill, which is exactly what `shows.artistNames` holds.
function splitLineup(value) {
  return String(value ?? "")
    // Splitting a bill wrongly invents an artist, so the separators are
    // deliberately conservative:
    //   · "+" only when spaced, and not before an article — "Overmono + Salute"
    //     is two acts, "Bolly+House" is one compound, "Florence + the Machine"
    //     is one band.
    //   · "&" never. "Above & Beyond" and "Hall & Oates" are single names, and
    //     bills that use "&" also tend to use a comma somewhere.
    //   · b2b / vs / with / w-slash / comma / slash are unambiguous.
    .split(/(?:\s*,\s*|\s+\+\s+(?!the\s)|\s*\/\s*|\s+b2b\s+|\s+vs\.?\s+|\s+with\s+|\s+w\/\s*)/i)
    .map(stripTrailingNoise)
    .filter(
      (name) =>
        name.length >= 2 &&
        name.length <= 60 &&
        !isTitleNoise(name) &&
        !looksLikePromoProse(name),
    );
}

// Titles in the wild: "Peggy Gou at 1015 Folsom - Jun 27, 2026 | Tickets",
// "1015 Folsom presents Overmono", "Tickets for Salute | Public Works".
// Take the first segment that is neither the venue nor listings boilerplate.
function extractArtistNames(title, venueName) {
  const venue = normalizeText(venueName);
  const segments = String(title ?? "")
    .split(TITLE_SEPARATORS)
    .map(stripTrailingNoise)
    .filter(Boolean);

  for (const segment of segments) {
    const normalized = normalizeText(segment);
    if (!normalized) continue;
    if (venue && (normalized.includes(venue) || venue.includes(normalized))) continue;
    if (isTitleNoise(segment)) continue;
    // A segment that is only a date ("Jun 27, 2026") is metadata, not a bill.
    if (/^[\d\s,./-]+$/.test(segment)) continue;
    if (/^(?:mon|tue|wed|thu|fri|sat|sun)/i.test(normalized) && /\d/.test(normalized)) continue;
    const names = splitLineup(segment);
    if (names.length) return names;
  }
  return [];
}

function hostOf(url) {
  const match = /^https?:\/\/([^/?#]+)/i.exec(String(url ?? ""));
  return match ? match[1].toLowerCase().replace(/^www\./, "") : "";
}

function isTicketingDomain(url) {
  const host = hostOf(url);
  return TICKETING_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isSocialDomain(url) {
  const host = hostOf(url);
  return SOCIAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

// Venues are written half a dozen ways: "The Midway", "Midway", "The Midway SF",
// "Midway San Francisco". Requiring the catalog's exact string threw away
// nights whose listing was real and correctly dated — the second biggest source
// of refusals in the first real sweep, after the missing year.
//
// Only the leading article and a trailing city/state tag are stripped. The core
// name must still appear, and must be long enough not to collide by accident.
const VENUE_CORE_MIN_LENGTH = 5;

function venueCore(venueName) {
  return normalizeText(venueName)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+(sf|nyc|ny|ca|san francisco|new york|brooklyn)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsVenue(text, venueName) {
  const haystack = normalizeText(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  const full = normalizeText(venueName);
  if (full && haystack.includes(full)) return true;
  const core = venueCore(venueName);
  return core.length >= VENUE_CORE_MIN_LENGTH && haystack.includes(core);
}

function lineupKey(names) {
  return names.map(normalizeText).sort().join("|");
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

// results: Tavily's `results[]` — [{ title, url, content }].
// gap:     { clusterDate, city?, venues?: [{name}], anchorVenue?: string }
//
// Returns { proposal, evidence, considered, rejected } where `proposal` is null
// whenever the evidence does not clear MIN_PROPOSAL_CONFIDENCE. The rejected
// list carries a reason per URL so the report can show what was thrown away —
// silent discards look identical to bugs.
function proposeFromResults(gap, results, options = {}) {
  const anchorVenue = gap.anchorVenue ?? gap.venues?.[0]?.name ?? null;
  const minConfidence = options.minConfidence ?? MIN_PROPOSAL_CONFIDENCE;
  const rejected = [];
  const groups = new Map();

  for (const result of Array.isArray(results) ? results : []) {
    const url = result?.url ?? "";
    const title = result?.title ?? "";
    const content = result?.content ?? "";

    if (!mentionsDate(gap.clusterDate, title, content, url)) {
      rejected.push({ url, reason: "date not confirmed in the page" });
      continue;
    }
    const venueConfirmed = anchorVenue
      ? mentionsVenue(`${title} ${content} ${url.replace(/[-/]/g, " ")}`, anchorVenue)
      : false;
    if (anchorVenue && !venueConfirmed) {
      rejected.push({ url, reason: `page does not name ${anchorVenue}` });
      continue;
    }
    const artistNames = extractArtistNames(title, anchorVenue);
    if (!artistNames.length) {
      rejected.push({ url, reason: "no artist name in the title" });
      continue;
    }

    const key = lineupKey(artistNames);
    const group = groups.get(key) ?? {
      artistNames,
      sources: [],
      hosts: new Set(),
      venueConfirmed: false,
      ticketing: false,
      nonSocialSources: 0,
    };
    group.sources.push({ url, title });
    group.hosts.add(hostOf(url));
    group.venueConfirmed = group.venueConfirmed || venueConfirmed;
    group.ticketing = group.ticketing || isTicketingDomain(url);
    group.nonSocialSources = (group.nonSocialSources ?? 0) + (isSocialDomain(url) ? 0 : 1);
    groups.set(key, group);
  }

  const considered = [...groups.values()].map((group) => {
    const plural = group.sources.length !== 1;
    const evidence = [
      {
        kind: "web",
        detail: `${plural ? `${group.sources.length} listings name` : "A listing names"} ${group.artistNames.join(" + ")} on ${longDate(gap.clusterDate)}`,
        delta: DELTA_DATE_CONFIRMED,
      },
    ];
    if (group.venueConfirmed) {
      evidence.push({
        kind: "web",
        detail: `The page names ${anchorVenue}, the room your photos were taken in`,
        delta: DELTA_VENUE_CONFIRMED,
      });
    } else {
      evidence.push({
        kind: "web",
        detail: "No GPS on this night, so the venue is unverified",
        delta: DELTA_NO_VENUE_ANCHOR,
      });
    }
    if (group.ticketing) {
      const listed = [...group.hosts].filter((host) => isTicketingDomain(`https://${host}`));
      evidence.push({
        kind: "web",
        detail: `Listed on ${listed.join(", ")}`,
        delta: DELTA_TICKETING_DOMAIN,
      });
    }
    // Two sites that agree on the bill while sharing no publisher is the
    // strongest signal available without a first-party API.
    if (group.hosts.size > 1) {
      evidence.push({
        kind: "web",
        detail: `${group.hosts.size} independent sources agree`,
        delta: DELTA_CORROBORATED,
      });
    }
    const confidence = Math.min(
      evidence.reduce((total, row) => total + row.delta, 0),
      0.99,
    );
    return { ...group, hosts: [...group.hosts], evidence, confidence };
  });

  // A lineup known only from social captions is not a listing. It may
  // corroborate a night some real listing already named; it may not carry one.
  const admissible = considered.filter((group) => group.nonSocialSources > 0);
  admissible.sort((left, right) => right.confidence - left.confidence);
  considered.sort((left, right) => right.confidence - left.confidence);
  const best = admissible[0] ?? null;

  // Two different lineups both clearing the bar means the web disagrees with
  // itself about this night. Proposing either one would be a coin flip wearing
  // a source URL, so we propose neither.
  const contested = admissible.length > 1 && admissible[1].confidence >= minConfidence;

  if (!best || best.confidence < minConfidence || contested) {
    return {
      proposal: null,
      considered,
      rejected,
      declineReason: !best
        ? considered.length
          ? "only social posts named a lineup, which is a caption not a listing"
          : "no result named both the date and a lineup"
        : contested
          ? "sources disagree about who played"
          : `best confidence ${best.confidence.toFixed(2)} below ${minConfidence}`,
    };
  }

  return {
    proposal: {
      clusterDate: gap.clusterDate,
      venueName: anchorVenue,
      city: gap.city ?? null,
      artistNames: best.artistNames,
      sourceUrl: best.sources[0].url,
      sourceTitle: best.sources[0].title,
      corroboratingUrls: best.sources.slice(1).map((source) => source.url),
      confidence: best.confidence,
      evidence: best.evidence,
    },
    considered,
    rejected,
    declineReason: null,
  };
}

// The line the app shows on a proposed night (design 09's evidence card, with
// the source made visible — an unverified claim must look unverified).
function describeProposal(proposal) {
  if (!proposal) return "";
  const where = proposal.venueName ? ` at ${proposal.venueName}` : "";
  return `${proposal.artistNames.join(" + ")}${where} — proposed from ${hostOf(proposal.sourceUrl)}`;
}

// ---------------------------------------------------------------------------
// Festivals — a day is one bill, not sixty separate shows
// ---------------------------------------------------------------------------

// The same mechanism as a history sweep, pointed at the other hole in the
// catalog. Ticketmaster sells no past events, so a festival that already
// happened is invisible to us, and a festival that has not happened yet arrives
// (when it arrives at all) as sixty per-set rows.
//
// Both are answered by the same claim: **one proposal per festival DAY**, whose
// `artistNames` is that day's bill. That is deliberately the shape SPEC.md's
// "a festival is one thing, not sixty" asks the catalog for — a designated
// festival-day row per date — so recovering history here does not have to be
// undone when the data model lands.
//
// What changes from a venue night, and what does not:
//
//   · The claim is still only "this happened", never "you were there".
//   · The date gate is unchanged, and a page that names the whole weekend but
//     not this day cannot carry this day.
//   · The bill is not read off a title. It is harvested from the part of the
//     page that belongs to THIS day, and every name must be corroborated —
//     either by a source authoritative about this festival, or by two
//     independent publishers. A festival page lists sixty names; putting a
//     misparsed one into the catalog is sixty chances to be wrong, not one.

const DELTA_FESTIVAL_CONFIRMED = 0.3;

// A bill longer than this is a page listing the whole weekend, not one day.
const MAX_BILL_NAMES = 40;

const FESTIVAL_CORE_MIN_LENGTH = 5;

// Words that are festival furniture rather than acts. Distinct from
// NOISE_WORDS, which is about listings boilerplate: these are the things a
// festival page says around the names.
const FESTIVAL_FURNITURE = new Set([
  "stage",
  "stages",
  "lands",
  "day",
  "days",
  "night",
  "weekend",
  "pass",
  "passes",
  "vip",
  "ga",
  "general",
  "admission",
  "gates",
  "doors",
  "food",
  "drink",
  "art",
  "more",
  "tba",
  "tbd",
  "guests",
  "special",
  "guest",
  "set",
  "sets",
  "times",
  "headliner",
  "headliners",
  "poster",
  "map",
  "faq",
  "festival",
  "fest",
]);

const MONTH_PATTERN = MONTHS.map((month) =>
  month.length > 3 ? `${month.slice(0, 3)}(?:${month.slice(3)})?` : month,
).join("|");
const WEEKDAY_PATTERN = WEEKDAYS.map((day) => `${day.slice(0, 3)}(?:${day.slice(3)})?`).join("|");

// "Friday, August 7", "FRIDAY", "Aug 7" — the three ways a lineup page starts a
// day. Positions of these are the only thing that lets one page's content be
// cut into days, which is the whole difficulty of reading a festival bill.
const DAY_HEADER_SOURCE =
  `\\b(?:${WEEKDAY_PATTERN})\\b[.,]?\\s*(?:(?:${MONTH_PATTERN})\\b\\.?\\s*\\d{1,2})?` +
  `|\\b(?:${MONTH_PATTERN})\\b\\.?\\s*\\d{1,2}\\b`;

// "Outside Lands 2026" and "Outside Lands Music and Arts Festival" are the same
// event written two ways, and a page will use whichever it likes. Match on the
// core, and on the first two significant words, so neither direction misses.
function festivalNeedles(festivalName) {
  const core = normalizeText(festivalName)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^the\s+/, "")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:music(?:\s+and\s+arts)?\s+)?festival\b|\bfest\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = core.split(" ").filter(Boolean);
  const prefix = words.slice(0, 2).join(" ");
  return [core, prefix].filter((needle) => needle.length >= FESTIVAL_CORE_MIN_LENGTH);
}

function mentionsFestival(text, festivalName) {
  const haystack = normalizeText(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  return festivalNeedles(festivalName).some((needle) => haystack.includes(needle));
}

function festivalSlug(festivalName, isoDate) {
  const year = splitIsoDate(isoDate)?.year ?? "";
  const base = normalizeText(festivalName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return year && !base.includes(year) ? `${base}-${year}` : base;
}

function weekdayName(isoDate) {
  const parts = splitIsoDate(isoDate);
  if (!parts) return "";
  const stamp = new Date(Date.UTC(Number(parts.year), parts.monthIndex, parts.dayNumber));
  const weekday = WEEKDAYS[stamp.getUTCDay()] ?? "";
  return weekday ? weekday[0].toUpperCase() + weekday.slice(1) : "";
}

// The title of a festival diary entry, per SPEC: the festival and the day, not
// an artist. Nobody remembers Saturday at a festival as six separate sets.
function festivalDayTitle(festivalName, isoDate) {
  const day = weekdayName(isoDate);
  return day ? `${festivalName} — ${day}` : String(festivalName ?? "");
}

// Does one day header name this date? mentionsDate covers the forms that carry
// a year or a weekday. Inside a page already confirmed to be about this date,
// a bare "August 7" or a bare "FRIDAY" is unambiguous too — the confirmation
// happened at the page level, which is why this is not a hole in the year check.
function headerNamesDate(headerText, isoDate) {
  if (mentionsDate(isoDate, headerText)) return true;
  const parts = splitIsoDate(isoDate);
  if (!parts) return false;
  const text = normalizeText(headerText);
  const monthName = MONTHS[parts.monthIndex] ?? "";
  const monthMatch = new RegExp(
    `\\b${monthName.slice(0, 3)}(?:${monthName.slice(3)})?\\b\\.?\\s*${parts.dayNumber}\\b`,
  ).test(text);
  if (monthMatch) return true;
  const weekday = normalizeText(weekdayName(isoDate));
  if (!weekday) return false;
  // A weekday-only header is ours only if the header carries no day number at
  // all — "Friday, August 8" is a different day even in the right week.
  if (/\d/.test(text)) return false;
  return new RegExp(`\\b${weekday.slice(0, 3)}(?:${weekday.slice(3)})?\\b`).test(text);
}

function dayHeaderPositions(text) {
  const pattern = new RegExp(DAY_HEADER_SOURCE, "gi");
  const found = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + match[0].length;
    // "August 7-9, 2026" is the run of the whole festival, not the start of a
    // day's section. Reading it as one would hand Friday's header everything
    // printed before Friday actually begins — including the other days' bills.
    const isRange = /^\s*(?:[-–—]|to\b|through\b)\s*\d/i.test(text.slice(end, end + 12));
    if (!isRange) found.push({ index: match.index, text: match[0], length: match[0].length });
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return found;
}

// The slice of a page that belongs to one day: from this day's header to the
// next header naming a different one. Returns null when the page never names
// the day — which is a refusal, not an empty bill.
//
// This is the guard against the failure that matters most here: a three-day
// lineup page read whole would put Friday's headliners on Saturday's bill, with
// a real URL attached and no way for a human to see it was wrong.
function dayLineupSegment(content, isoDate) {
  const text = String(content ?? "");
  if (!text.trim()) return null;
  const headers = dayHeaderPositions(text);
  if (!headers.length) return { segment: text, headed: false };

  const ours = headers.find((header) => headerNamesDate(header.text, isoDate));
  if (!ours) return null;

  const start = ours.index + ours.length;
  const next = headers.find(
    (header) => header.index >= start && !headerNamesDate(header.text, isoDate),
  );
  return { segment: text.slice(start, next ? next.index : text.length), headed: true };
}

// A colon separates a label from its bill ("Friday, August 7: Tame Impala"), so
// it splits like any other. No act name carries one.
const BILL_SEPARATORS = /[,;|•·:\n\r\t]+|\s+\/\s+|\s{3,}/;

function trimBillFragment(value) {
  return stripTrailingNoise(
    String(value ?? "")
      .replace(/^[\s\-–—|·:•*+]+/, "")
      .replace(/[\s\-–—|·:•*+]+$/, "")
      // A sentence's full stop, but never the one inside "Fred again..", which
      // is part of the name and drops the act if we take it.
      .replace(/(?<!\.)\.$/, ""),
  );
}

function isFestivalFurniture(value) {
  const words = normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return true;
  return words.every((word) => FESTIVAL_FURNITURE.has(word) || NOISE_WORDS.has(word));
}

function looksLikeArtistName(value) {
  const name = String(value ?? "").trim();
  if (name.length < 2 || name.length > 40) return false;
  const words = name.split(/\s+/);
  if (words.length > 5) return false;
  if (looksLikePromoProse(name)) return false;
  if (isTitleNoise(name) || isFestivalFurniture(name)) return false;
  // Times, dates, prices and set-time rows are the other half of a lineup page.
  if (/^[\d\s.,:/$+-]+$/.test(name)) return false;
  if (/\b\d{1,2}\s*(?::\s*\d{2})?\s*(?:am|pm)\b/i.test(name)) return false;
  if (new RegExp(`^(?:${DAY_HEADER_SOURCE})$`, "i").test(normalizeText(name))) return false;
  if (/^\$/.test(name)) return false;
  // "Lands End Stage", "Panhandle Tent" — a festival page names its rooms in
  // the same lists as its acts, and a stage that becomes an artist is a row
  // every later match can land on.
  if (/\b(?:stage|tent|pavilion|grounds|polo field)$/i.test(name.trim())) return false;
  // A name has letters in it.
  return /[a-z]/i.test(name);
}

// Commas separate acts on a lineup page — and they also sit inside act names.
// "Tyler, The Creator" splits into "Tyler" and "The Creator", and there is no
// way to tell that apart from two acts called "Kaytranada" and "The Blaze".
//
// So both halves are dropped rather than guessed at. A missing name costs
// recall; an invented one is a wrong artist in the shared catalog. Another
// publisher writing the same bill with pipes or newlines recovers the name
// intact, which is why corroboration runs across sources and not within one.
function dropCommaSplitNames(fragments) {
  const dropped = new Set();
  for (let index = 1; index < fragments.length; index += 1) {
    const current = normalizeText(fragments[index]);
    const previous = fragments[index - 1];
    if (!/^the\s+\S+/.test(current)) continue;
    if (current.split(" ").length > 3) continue;
    if (String(previous).trim().split(/\s+/).length > 2) continue;
    dropped.add(index - 1);
    dropped.add(index);
  }
  return fragments.filter((_, index) => !dropped.has(index));
}

// Every plausible act named in one day's slice of one page.
function harvestBillNames(segment, context = {}) {
  const fragments = String(segment ?? "")
    .split(BILL_SEPARATORS)
    .map(trimBillFragment)
    .filter(Boolean);
  const names = dropCommaSplitNames(fragments).filter(looksLikeArtistName);
  const excluded = [context.festivalName, context.venueName, context.city]
    .filter(Boolean)
    .map((value) => normalizeText(value));
  const seen = new Set();
  const kept = [];
  for (const name of names) {
    const key = normalizeText(name);
    if (seen.has(key)) continue;
    if (excluded.some((value) => key === value || value.includes(key) || key.includes(value)))
      continue;
    if (mentionsFestival(name, context.festivalName ?? "")) continue;
    seen.add(key);
    kept.push(name);
  }
  return kept;
}

// A source that can put a name on the bill by itself: the festival's own site,
// or a ticketing/listings publisher. Everything else needs a second publisher
// to agree with it.
function isAuthoritativeFestivalSource(url, festivalName) {
  if (isTicketingDomain(url)) return true;
  const host = hostOf(url).replace(/[^a-z0-9]/g, "");
  return festivalNeedles(festivalName).some(
    (needle) => needle.length >= FESTIVAL_CORE_MIN_LENGTH && host.includes(needle.replace(/\s/g, "")),
  );
}

// results: Tavily's `results[]`. festival: { festivalName, date, city?, venueName? }
//
// Returns the same shape as proposeFromResults — { proposal, considered,
// rejected, declineReason } — because the caller, the report and the eval all
// already speak it.
function proposeFestivalDay(festival, results, options = {}) {
  const minConfidence = options.minConfidence ?? MIN_PROPOSAL_CONFIDENCE;
  const festivalName = festival.festivalName ?? "";
  const date = festival.date ?? festival.clusterDate;
  const rejected = [];
  const admissible = [];
  const corroborating = [];

  for (const result of Array.isArray(results) ? results : []) {
    const url = result?.url ?? "";
    const title = result?.title ?? "";
    const content = result?.content ?? "";

    if (!mentionsFestival(`${title} ${content} ${url.replace(/[-/]/g, " ")}`, festivalName)) {
      rejected.push({ url, reason: `page does not name ${festivalName}` });
      continue;
    }
    if (!mentionsDate(date, title, content, url)) {
      rejected.push({ url, reason: "date not confirmed in the page" });
      continue;
    }
    const slice = dayLineupSegment(`${title}\n${content}`, date);
    if (!slice) {
      rejected.push({ url, reason: "page covers the festival but never names this day" });
      continue;
    }
    const names = harvestBillNames(slice.segment, {
      festivalName,
      venueName: festival.venueName,
      city: festival.city,
    });
    if (!names.length) {
      rejected.push({ url, reason: "no act name survived on this day's part of the page" });
      continue;
    }
    const row = {
      url,
      title,
      host: hostOf(url),
      names,
      authoritative: isAuthoritativeFestivalSource(url, festivalName),
      ticketing: isTicketingDomain(url),
      headed: slice.headed,
    };
    // A social caption may agree with a bill; it may never be the bill.
    if (isSocialDomain(url)) corroborating.push(row);
    else admissible.push(row);
  }

  if (!admissible.length) {
    return {
      proposal: null,
      considered: [],
      rejected,
      declineReason: corroborating.length
        ? "only social posts named this day, which is a caption not a lineup"
        : "no result named this festival, this day and a lineup",
    };
  }

  // Per-NAME evidence, not per-lineup. Two festival pages never carry byte-
  // identical bills, so grouping by lineup the way a single-act night does
  // would refuse every festival on earth. What actually corroborates is each
  // name appearing on independent publishers' versions of the same day.
  const tally = new Map();
  for (const row of [...admissible, ...corroborating]) {
    for (const name of row.names) {
      const key = normalizeText(name);
      const entry = tally.get(key) ?? { name, hosts: new Set(), authoritative: false };
      if (!isSocialDomain(row.url)) entry.hosts.add(row.host);
      entry.authoritative = entry.authoritative || row.authoritative;
      tally.set(key, entry);
    }
  }

  const bill = [...tally.values()]
    .filter((entry) => entry.authoritative || entry.hosts.size >= 2)
    .sort((left, right) => right.hosts.size - left.hosts.size)
    .slice(0, MAX_BILL_NAMES);
  const uncorroborated = tally.size - bill.length;

  if (!bill.length) {
    return {
      proposal: null,
      considered: [],
      rejected,
      declineReason: "no act on this day was named by an authoritative or a second source",
    };
  }

  const hosts = new Set(admissible.map((row) => row.host));
  const ticketing = admissible.filter((row) => row.ticketing);
  const evidence = [
    {
      kind: "web",
      detail: `${bill.length} acts named on ${longDate(date)} at ${festivalName}`,
      delta: DELTA_DATE_CONFIRMED,
    },
    {
      kind: "web",
      detail: `${hosts.size === 1 ? "The page names" : `${hosts.size} pages name`} ${festivalName} and this day of it`,
      delta: DELTA_FESTIVAL_CONFIRMED,
    },
  ];
  if (ticketing.length) {
    evidence.push({
      kind: "web",
      detail: `Listed on ${[...new Set(ticketing.map((row) => row.host))].join(", ")}`,
      delta: DELTA_TICKETING_DOMAIN,
    });
  }
  if (hosts.size > 1) {
    evidence.push({
      kind: "web",
      detail: `${hosts.size} independent sources agree`,
      delta: DELTA_CORROBORATED,
    });
  }
  const confidence = Math.min(
    evidence.reduce((total, row) => total + row.delta, 0),
    0.99,
  );
  if (confidence < minConfidence) {
    return {
      proposal: null,
      considered: [],
      rejected,
      declineReason: `best confidence ${confidence.toFixed(2)} below ${minConfidence}`,
    };
  }

  const primary =
    admissible.find((row) => row.authoritative) ?? admissible.find((row) => row.headed) ?? admissible[0];
  return {
    proposal: {
      clusterDate: date,
      festivalId: festivalSlug(festivalName, date),
      festivalName,
      title: festivalDayTitle(festivalName, date),
      venueName: festival.venueName ?? null,
      city: festival.city ?? null,
      artistNames: bill.map((entry) => entry.name),
      sourceUrl: primary.url,
      sourceTitle: primary.title,
      corroboratingUrls: admissible.filter((row) => row.url !== primary.url).map((row) => row.url),
      confidence,
      evidence,
    },
    considered: [...tally.values()].map((entry) => ({
      name: entry.name,
      hosts: [...entry.hosts],
      authoritative: entry.authoritative,
    })),
    rejected,
    uncorroborated,
    declineReason: null,
  };
}

// One query per day, and a second that targets the pages which publish bills
// day by day (set times, daily lineups) rather than one weekend poster.
function buildFestivalQueries(festival) {
  const date = longDate(festival.date ?? festival.clusterDate);
  const name = festival.festivalName ? String(festival.festivalName) : "";
  if (!date || !name) return [];
  const city = festival.city ? ` ${festival.city}` : "";
  const day = weekdayName(festival.date ?? festival.clusterDate);
  return [
    { query: `"${name}"${city} lineup ${date}` },
    { query: `"${name}" ${day} ${date} set times daily lineup` },
  ];
}

export {
  CREDITS_PER_ADVANCED_SEARCH,
  DELTA_FESTIVAL_CONFIRMED,
  MAX_BILL_NAMES,
  DELTA_CORROBORATED,
  DELTA_DATE_CONFIRMED,
  DELTA_NO_VENUE_ANCHOR,
  DELTA_TICKETING_DOMAIN,
  DELTA_VENUE_CONFIRMED,
  MAX_VENUE_ANCHORS,
  MIN_PROPOSAL_CONFIDENCE,
  TICKETING_DOMAINS,
  VENUE_ANCHOR_METERS,
  buildFestivalQueries,
  buildGapQueries,
  dateNeedles,
  dayLineupSegment,
  describeProposal,
  weekdayDateNeedles,
  eachNightInRange,
  estimateSweepCredits,
  extractArtistNames,
  festivalDayTitle,
  festivalSlug,
  harvestBillNames,
  hostOf,
  isAuthoritativeFestivalSource,
  looksLikeArtistName,
  isSocialDomain,
  isTicketingDomain,
  longDate,
  mentionsDate,
  mentionsFestival,
  mentionsVenue,
  nearestVenues,
  nightsMissingFromCatalog,
  proposeFestivalDay,
  proposeFromResults,
  splitLineup,
  weekdayName,
};
