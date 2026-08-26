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

function isTitleNoise(value) {
  const words = normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.every((word) => NOISE_WORDS.has(word));
}

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
  return [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}${month}${day}`,
    `${monthName} ${dayNumber}, ${year}`,
    `${monthName} ${dayNumber} ${year}`,
    `${abbreviation} ${dayNumber}, ${year}`,
    `${abbreviation} ${dayNumber} ${year}`,
    `${dayNumber} ${monthName} ${year}`,
    `${dayNumber} ${abbreviation} ${year}`,
    `${Number(month)}/${dayNumber}/${year}`,
    `${month}/${day}/${year}`,
    `${Number(month)}/${dayNumber}/${shortYear}`,
    `${month}/${day}/${shortYear}`,
    `${Number(month)}-${dayNumber}-${year}`,
  ].map((needle) => needle.toLowerCase());
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsDate(isoDate, ...texts) {
  const haystack = texts.map(normalizeText).join("   ");
  return dateNeedles(isoDate).some((needle) => haystack.includes(needle));
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
    .split(/\s*(?:,|\/|\+|&|\bb2b\b|\bvs\.?\b|\bwith\b|\bw\/)\s*/i)
    .map(stripTrailingNoise)
    .filter((name) => name.length >= 2 && name.length <= 60 && !isTitleNoise(name));
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
      ? normalizeText(`${title} ${content} ${url.replace(/[-/]/g, " ")}`).includes(
          normalizeText(anchorVenue),
        )
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
    };
    group.sources.push({ url, title });
    group.hosts.add(hostOf(url));
    group.venueConfirmed = group.venueConfirmed || venueConfirmed;
    group.ticketing = group.ticketing || isTicketingDomain(url);
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

  considered.sort((left, right) => right.confidence - left.confidence);
  const best = considered[0] ?? null;

  // Two different lineups both clearing the bar means the web disagrees with
  // itself about this night. Proposing either one would be a coin flip wearing
  // a source URL, so we propose neither.
  const contested = considered.length > 1 && considered[1].confidence >= minConfidence;

  if (!best || best.confidence < minConfidence || contested) {
    return {
      proposal: null,
      considered,
      rejected,
      declineReason: !best
        ? "no result named both the date and a lineup"
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

export {
  DELTA_CORROBORATED,
  DELTA_DATE_CONFIRMED,
  DELTA_NO_VENUE_ANCHOR,
  DELTA_TICKETING_DOMAIN,
  DELTA_VENUE_CONFIRMED,
  MAX_VENUE_ANCHORS,
  MIN_PROPOSAL_CONFIDENCE,
  TICKETING_DOMAINS,
  VENUE_ANCHOR_METERS,
  buildGapQueries,
  dateNeedles,
  describeProposal,
  extractArtistNames,
  hostOf,
  isTicketingDomain,
  longDate,
  mentionsDate,
  nearestVenues,
  proposeFromResults,
  splitLineup,
};
