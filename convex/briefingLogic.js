// The briefing's three new sections, as pure functions.
//
// The app inverts here: it stops being a catalog with agent features bolted on
// and becomes the place you review what your agent did. That only works if
// every card can be checked by the human reading it, so the rule from the
// matcher carries over unchanged — NO EVIDENCE, NO CARD. A find with nothing
// to point at is not a weak recommendation, it is a guess wearing a score.
//
// Nothing here invents a second taste model. Rarity weighting comes from
// `tasteMath.genreWeights` and the low-signal floor from `LOW_SIGNAL_SHOWS`,
// so the briefing, the profile screen, the MCP surface and peer discovery all
// go quiet at the same diary length. One promise, one number.

import { genreWeights, LOW_SIGNAL_SHOWS } from "./tasteMath.js";

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Whole days between two ISO dates, positive when `later` is later. Dates in
// this catalog are date-only strings, so this stays off Date's timezone edges.
function daysBetween(earlier, later) {
  const parse = (value) => Date.parse(`${String(value ?? "").slice(0, 10)}T00:00:00Z`);
  const from = parse(earlier);
  const to = parse(later);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function monthsAgo(days) {
  if (days < 45) return `${plural(Math.max(1, Math.round(days / 7)), "week")} ago`;
  if (days < 365) return `${plural(Math.round(days / 30), "month")} ago`;
  return `${plural(Math.max(1, Math.round(days / 365)), "year")} ago`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(isoDate) {
  const parsed = Date.parse(`${String(isoDate ?? "").slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : WEEKDAYS[new Date(parsed).getUTCDay()];
}

// ---------------------------------------------------------------------------
// ② WHAT YOUR AGENT FOUND
// ---------------------------------------------------------------------------

// Evidence weights are shares of the score, not points on top of it: the Why
// expansion has to add up to the number on the card or it is theatre. Each
// signal earns a raw contribution below, and the set is rescaled at the end so
// the rows sum to exactly the score shown.
const CONTRIBUTION = {
  followedArtist: 0.28,
  loggedArtist: 0.2,
  venueNight: 0.08,
  venueLoved: 0.05,
  genreFit: 0.3,
  recency: 0.12,
  friendGoing: 0.16,
};

const CAP = {
  artists: 0.5,
  venue: 0.32,
  genre: 0.3,
  friends: 0.26,
};

function buildDiary(logs) {
  const artistNights = new Map();
  const venueNights = new Map();
  const genreNights = new Map();
  let lastSeenByArtist = new Map();

  for (const log of logs) {
    for (const name of unique(log.artistNames ?? [])) {
      const key = normalize(name);
      artistNights.set(key, (artistNights.get(key) ?? 0) + 1);
      const existing = lastSeenByArtist.get(key);
      if (!existing || String(log.showDate ?? "") > existing.date) {
        lastSeenByArtist.set(key, { date: String(log.showDate ?? ""), name });
      }
    }
    const venue = normalize(log.venueName);
    if (venue) {
      const entry = venueNights.get(venue) ?? { nights: 0, loved: 0, name: log.venueName };
      entry.nights += 1;
      if ((log.rating ?? 0) >= 4) entry.loved += 1;
      venueNights.set(venue, entry);
    }
    for (const genre of unique(log.artistGenres ?? [])) {
      const key = normalize(genre);
      genreNights.set(key, (genreNights.get(key) ?? 0) + 1);
    }
  }

  return { artistNights, venueNights, genreNights, lastSeenByArtist };
}

/**
 * Taste-score upcoming shows into the briefing's "what your agent found".
 *
 * Refuses entirely under `LOW_SIGNAL_SHOWS` logged nights — scouting from
 * three data points is the same "implying a pattern" the profile screen and
 * the agent surface already refuse to do. The caller renders the reason.
 */
export function scoreFinds(shows, taste = {}) {
  const {
    logs = [],
    followedArtistNames = [],
    excludeShowIds = [],
    peersGoing = {},
    catalogGenres,
    today = "",
    limit = 5,
  } = taste;

  if (logs.length < LOW_SIGNAL_SHOWS) return [];

  const diary = buildDiary(logs);
  const followed = new Set(followedArtistNames.map(normalize));
  const excluded = new Set(excludeShowIds.map(String));
  // Rarity measured against what the city is actually offering, so "you both
  // like jazz" stops being a compliment in a jazz-heavy catalog.
  const weights = genreWeights(catalogGenres ?? shows.map((show) => show.genres ?? []));
  const loggedNights = logs.length;

  const finds = [];

  for (const show of shows) {
    if (excluded.has(String(show.showId))) continue;

    const evidence = [];
    const artistNames = unique(show.artistNames ?? []);

    const followedOnBill = artistNames.filter((name) => followed.has(normalize(name)));
    const seenBefore = artistNames.filter(
      (name) => !followed.has(normalize(name)) && diary.artistNights.has(normalize(name)),
    );

    if (followedOnBill.length > 0) {
      evidence.push({
        kind: "artist-overlap",
        detail:
          followedOnBill.length === 1
            ? `${followedOnBill[0]} is on the bill and you follow them`
            : `Bill overlaps ${plural(followedOnBill.length, "artist")} you follow`,
        weight: Math.min(CAP.artists, followedOnBill.length * CONTRIBUTION.followedArtist),
      });
    }

    if (seenBefore.length > 0) {
      const nights = seenBefore.reduce(
        (total, name) => total + (diary.artistNights.get(normalize(name)) ?? 0),
        0,
      );
      evidence.push({
        kind: "artist-overlap",
        detail:
          seenBefore.length === 1
            ? `You've logged ${seenBefore[0]} ${plural(nights, "time")}`
            : `${plural(seenBefore.length, "artist")} on this bill are already in your diary`,
        weight: Math.min(CAP.artists, seenBefore.length * CONTRIBUTION.loggedArtist),
      });
    }

    const venue = diary.venueNights.get(normalize(show.venueName));
    if (venue) {
      evidence.push({
        kind: "venue-history",
        detail:
          venue.loved > 0
            ? `${plural(venue.loved, "night")} at this venue rated 4★ or higher`
            : `${plural(venue.nights, "night")} at this venue in your diary`,
        weight: Math.min(
          CAP.venue,
          venue.nights * CONTRIBUTION.venueNight + venue.loved * CONTRIBUTION.venueLoved,
        ),
      });
    }

    const showGenres = unique(show.genres ?? []);
    let bestGenre = null;
    for (const genre of showGenres) {
      const key = normalize(genre);
      const nights = diary.genreNights.get(key) ?? 0;
      if (nights === 0) continue;
      const rarity = weights[key] === undefined ? 1 : weights[key];
      const share = nights / loggedNights;
      const value = rarity * share;
      if (!bestGenre || value > bestGenre.value) {
        bestGenre = { genre, nights, value };
      }
    }
    if (bestGenre && bestGenre.value > 0) {
      evidence.push({
        kind: "genre-fit",
        detail: `${bestGenre.genre} on ${plural(bestGenre.nights, "night")} of your ${loggedNights}`,
        weight: Math.min(CAP.genre, bestGenre.value * CONTRIBUTION.genreFit * 3),
      });
    }

    if (today) {
      let mostRecent = null;
      for (const name of artistNames) {
        const seen = diary.lastSeenByArtist.get(normalize(name));
        if (!seen) continue;
        const days = daysBetween(seen.date, today);
        if (days === null || days < 0) continue;
        if (!mostRecent || days < mostRecent.days) mostRecent = { ...seen, days };
      }
      if (mostRecent && mostRecent.days <= 365) {
        evidence.push({
          kind: "recency",
          detail: `You saw ${mostRecent.name} ${monthsAgo(mostRecent.days)}`,
          weight: CONTRIBUTION.recency,
        });
      }
    }

    const going = peersGoing[String(show.showId)] ?? [];
    if (going.length > 0) {
      const best = going.reduce((top, peer) => (peer.matchPercent > top.matchPercent ? peer : top));
      evidence.push({
        kind: "friend-going",
        detail:
          going.length === 1
            ? `1 person with ${best.matchPercent}% taste overlap is going`
            : `${going.length} people are going, the closest at ${best.matchPercent}% taste overlap`,
        weight: Math.min(CAP.friends, CONTRIBUTION.friendGoing * going.length),
      });
    }

    // The rule, and the reason this function can be trusted on stage: a show
    // we cannot explain does not get a card, however plausible it looks.
    if (evidence.length === 0) continue;

    const raw = evidence.reduce((total, row) => total + row.weight, 0);
    const score = clamp01(Math.min(0.99, raw));
    // Rescale so the Why expansion adds up to the number on the card.
    const scaled = evidence
      .map((row) => ({ ...row, weight: round((row.weight / raw) * score) }))
      .sort((left, right) => right.weight - left.weight);

    finds.push({
      // Internal, stripped below: the bill and the start time decide whether
      // two rows are the same recommendation. Neither is part of the contract.
      billArtists: artistNames,
      startTime: show.startTime,
      showId: String(show.showId),
      title: show.title,
      date: show.date,
      venueName: show.venueName,
      city: show.city,
      ...(show.image ? { image: show.image } : {}),
      score: round(score),
      evidence: scaled,
    });
  }

  // One card per act, one party once, and no more than two nights in the same
  // room.
  //
  // Run against the live catalog this returned five cards for ONE artist:
  // Blood Orange plays the Warfield three nights, and the catalog holds each
  // night twice ("Blood Orange at The Warfield" and "Blood Orange (6 and
  // Over)"). Five slots, one recommendation. A concierge offering the same
  // name five times has recommended nothing, so the first night of a run wins
  // and the rest of the slate goes to other acts.
  const seen = new Set();
  const kept = [];
  const slate = [];
  const perVenue = new Map();
  for (const find of finds.sort(
    (left, right) => right.score - left.score || left.date.localeCompare(right.date),
  )) {
    const key = billKey(find);
    if (seen.has(key)) continue;

    // One party, two headliners. The Midway, 2026-09-05 at 15:00, reached the
    // live briefing twice — "Purple Disco Machine at The Midway" and
    // "Electroluxx Pride Party", the same three artists, because two sources
    // disagree about who is top of the bill. The headliner has to stay in the
    // dedup key, so the same event is caught here instead: same room, same
    // date, same start, and a bill that overlaps.
    if (kept.some((earlier) => isSameEvent(earlier, find))) continue;

    // A concierge that recommends one bar five ways is not scouting. Four of
    // five live finds were The Midway at 25-26% fit; the ceiling hands those
    // slots to somewhere else.
    const venue = venueKey(find.venueName);
    if ((perVenue.get(venue) ?? 0) >= MAX_FINDS_PER_VENUE) continue;
    perVenue.set(venue, (perVenue.get(venue) ?? 0) + 1);

    seen.add(key);
    kept.push(find);
    const { billArtists, startTime, ...card } = find;
    void billArtists;
    void startTime;
    slate.push(card);
    if (slate.length >= Math.max(1, Math.min(limit, 5))) break;
  }
  return slate;
}

// At most this many nights in one room before the remaining slots go
// elsewhere. Two lets a residency you clearly like keep a foothold; five is
// the catalog talking about itself.
const MAX_FINDS_PER_VENUE = 2;

// The same room under two spellings.
//
// The live SF catalog holds "Castro Theatre" and "The Castro Theatre", "Cafe
// Du Nord" and "Cafe du Nord", "Palace of Fine Arts" and "The Palace of Fine
// Arts"; L1 reports the same pattern in New York with "Blue Note Jazz Club -
// NY" and "Irving Plaza Powered By Verizon 5G". Case and spacing already fall
// out of `normalize`; a leading article and those two suffix shapes are the
// rest of it.
//
// Token-SUBSET matching was considered for this and REJECTED on the evidence:
// it merges "Bill Graham Civic Auditorium" with "The Theater at Bill Graham
// Civic Auditorium", which are a 7,000-capacity arena and a small room inside
// it. A rule that cannot tell those apart would suppress a real
// recommendation, so the two-per-venue ceiling stays conservative and lets a
// genuinely missed alias through rather than hiding a genuinely different
// room. L1's data pass is the right place to canonicalise; this only has to
// stop the ceiling being evaded by an article.
function venueKey(name) {
  return normalize(name)
    .replace(/^the\s+/, "")
    .replace(/\s+powered by .*$/, "")
    .replace(/\s+-\s+[a-z]{2}$/, "")
    .trim();
}

// The same event arriving twice under different headliners: same room, same
// date, same start time, and at least one artist in common. All four, because
// two genuinely different bills can share a room and a date (two stages, an
// early and a late set), and a shared support act across two nights is not a
// duplicate either.
function isSameEvent(left, right) {
  if (venueKey(left.venueName) !== venueKey(right.venueName)) return false;
  if (left.date !== right.date) return false;
  if (normalize(left.startTime ?? "") !== normalize(right.startTime ?? "")) return false;
  const bill = new Set((left.billArtists ?? []).map(normalize));
  return (right.billArtists ?? []).some((artist) => bill.has(normalize(artist)));
}

// What makes two cards the same recommendation: the HEADLINER, not the row.
//
// Keying on the whole bill was not enough, and the live catalog showed why.
// Osees play The Chapel three nights and every night exists twice with a
// different support list — "Osees, Traps PS, Brigid Dawson" against "Osees,
// Brigid Dawson" — so the bills differ, the keys differed, and two cards
// reading "Osees at The Chapel" landed next to each other. The card shows the
// headliner, so the headliner is what makes two cards look the same.
//
// The title is the fallback for a bill the catalog never named an artist for,
// which is how festivals arrive.
function billKey(find) {
  const [headliner] = find.billArtists ?? [];
  if (headliner) return normalize(headliner);
  return normalize(find.title).replace(/\s*\(.*\)$/, "").replace(/ at .*$/, "");
}

// ---------------------------------------------------------------------------
// ④ WHAT IT BELIEVES
// ---------------------------------------------------------------------------

/**
 * Narrate 2–4 beliefs about a member, each with the count that produced it.
 *
 * A belief you cannot state a basis for does not ship, so every candidate here
 * carries its own arithmetic. `shows` is the upcoming catalog, used only to
 * measure how unusual a taste is in the city the member is standing in — the
 * same rarity weighting the peer matcher uses.
 */
export function narrateBeliefs(logs = [], shows = []) {
  if (logs.length < LOW_SIGNAL_SHOWS) return [];

  const diary = buildDiary(logs);
  const total = logs.length;
  const weights = genreWeights(shows.map((show) => show.genres ?? []));
  const candidates = [];

  // 1. Genre, weighted by how ordinary it is in this city's listings.
  const genres = [...diary.genreNights.entries()].sort((left, right) => right[1] - left[1]);
  if (genres.length > 0) {
    const [genre, nights] = genres[0];
    const share = nights / total;
    const rarity = weights[genre] === undefined ? 1 : weights[genre];
    if (nights >= 3 && share >= 0.25) {
      candidates.push({
        rank: share * (0.5 + rarity),
        statement:
          rarity >= 0.35
            ? `${titleCase(genre)} is what you actually go out for, and this city barely books it`
            : `${titleCase(genre)} is the thread through your diary`,
        basis: `${nights} of your ${total} logged nights were ${genre} bills`,
        strength: nights >= 6 && share >= 0.4 ? "strong" : "forming",
      });
    }
  }

  // 2. The night of the week you actually go out.
  const weekdays = new Map();
  for (const log of logs) {
    const day = weekdayOf(log.showDate);
    if (day) weekdays.set(day, (weekdays.get(day) ?? 0) + 1);
  }
  const topDay = [...weekdays.entries()].sort((left, right) => right[1] - left[1])[0];
  if (topDay && topDay[1] >= 3 && topDay[1] / total >= 0.35) {
    candidates.push({
      rank: topDay[1] / total,
      statement: `${topDay[0]} is your night`,
      basis: `${topDay[1]} of ${total} logged shows fell on a ${topDay[0]}`,
      strength: topDay[1] / total >= 0.5 ? "strong" : "forming",
    });
  }

  // 3. A room you keep going back to.
  const venue = [...diary.venueNights.values()].sort((left, right) => right.nights - left.nights)[0];
  if (venue && venue.nights >= 3) {
    candidates.push({
      rank: venue.nights / total,
      statement: `You keep going back to ${venue.name}`,
      basis:
        venue.loved > 0
          ? `${plural(venue.nights, "night")} there, ${venue.loved} of them rated 4★ or higher`
          : `${plural(venue.nights, "night")} there across your diary`,
      strength: venue.nights >= 5 ? "strong" : "forming",
    });
  }

  // 4. Drift: the recent half of the diary against the older half. Stated only
  //    when the diary is long enough to HAVE two halves worth comparing.
  const drift = describeDrift(logs);
  if (drift) candidates.push(drift);

  // 5. An artist you follow with your feet rather than a button. Three nights
  //    is the clear case; two is worth saying when two is a third of the
  //    diary, which is how a real six-night diary actually reads.
  const repeat = [...diary.artistNights.entries()]
    .filter(([, nights]) => nights >= 3 || (nights >= 2 && nights / total >= 0.3))
    .sort((left, right) => right[1] - left[1])[0];
  if (repeat) {
    const name = diary.lastSeenByArtist.get(repeat[0])?.name ?? repeat[0];
    candidates.push({
      rank: repeat[1] / total,
      statement: `You see ${name} whenever they play`,
      basis: `${plural(repeat[1], "night")} with them in a diary of ${total}`,
      strength: repeat[1] >= 4 ? "strong" : "forming",
    });
  }

  // 6. How you rate, which is the one belief every diary long enough to have
  //    an average can support. The app hides averages under LOW_SIGNAL_SHOWS
  //    and so does this — the gate at the top of the function is the same one.
  const rated = logs.filter((entry) => typeof entry.rating === "number" && entry.rating > 0);
  if (rated.length >= LOW_SIGNAL_SHOWS) {
    const average = rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length;
    const rounded = Math.round(average * 10) / 10;
    if (rounded >= 4.2) {
      candidates.push({
        rank: 0.3,
        statement: "You only log the nights that were worth it",
        basis: `Your ${rated.length} rated nights average ${rounded}★`,
        strength: rounded >= 4.5 ? "strong" : "forming",
      });
    } else if (rounded <= 3.2) {
      candidates.push({
        rank: 0.3,
        statement: "You are a hard marker",
        basis: `Your ${rated.length} rated nights average ${rounded}★`,
        strength: rounded <= 2.8 ? "strong" : "forming",
      });
    }
  }

  return candidates
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 4)
    .map(({ statement, basis, strength }) => ({ statement, basis, strength }));
}

function titleCase(value) {
  return String(value ?? "").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function describeDrift(logs) {
  const dated = logs
    .filter((log) => String(log.showDate ?? "").length >= 10)
    .sort((left, right) => String(left.showDate).localeCompare(String(right.showDate)));
  if (dated.length < 8) return null;

  const half = Math.floor(dated.length / 2);
  const older = dated.slice(0, half);
  const recent = dated.slice(dated.length - half);
  const shareOf = (window, genre) =>
    window.filter((log) => unique(log.artistGenres ?? []).some((value) => normalize(value) === genre))
      .length / window.length;

  let best = null;
  const genres = new Set(
    recent.flatMap((log) => unique(log.artistGenres ?? []).map(normalize)).filter(Boolean),
  );
  for (const genre of genres) {
    const now = shareOf(recent, genre);
    const before = shareOf(older, genre);
    if (now < 0.5 || now - before < 0.25) continue;
    if (!best || now - before > best.delta) {
      best = { genre, delta: now - before, now, before };
    }
  }
  if (!best) return null;

  const nowCount = Math.round(best.now * recent.length);
  const beforeCount = Math.round(best.before * older.length);
  return {
    rank: best.delta + 0.2,
    statement: `You've moved toward ${best.genre} this year`,
    basis: `${nowCount} of your last ${recent.length} nights were ${best.genre}, against ${beforeCount} of the ${older.length} before`,
    strength: best.delta >= 0.4 ? "strong" : "forming",
  };
}

// The first count in a basis sentence — "6 of your 19 logged nights…" — which
// is what "the evidence genuinely changed" is measured against.
function basisCount(basis) {
  const match = /\d+/.exec(String(basis ?? ""));
  return match ? Number(match[0]) : null;
}

/**
 * Apply a member's corrections to the beliefs we would otherwise show.
 *
 * "That's wrong" suppresses the belief — not for a cooling-off period. They
 * said the claim is false; re-asserting it next week because a timer expired
 * is the app arguing with someone about their own life. It comes back only
 * when the evidence genuinely changed (the count behind it grew by half
 * again), and when it does it SAYS it was corrected rather than reappearing
 * as if nothing happened.
 *
 * "That's right" pins the belief and marks it confirmed. It does not promote
 * `forming` to `strong`: strength is derived from counts, and a member
 * agreeing with us is not more nights in the diary. Their agreement is its own
 * fact, not a louder version of ours.
 */
export function applyBeliefFeedback(beliefs = [], feedback = [], options = {}) {
  const { limit = 4 } = options;
  const byStatement = new Map(
    feedback.map((entry) => [normalize(entry.statement), entry]),
  );

  const kept = [];
  for (const belief of beliefs) {
    const correction = byStatement.get(normalize(belief.statement));
    if (!correction) {
      kept.push({ belief, pinned: false });
      continue;
    }

    if (correction.verdict === "right") {
      kept.push({
        belief: { ...belief, basis: `${belief.basis} — and you confirmed it` },
        pinned: true,
      });
      continue;
    }

    const then = basisCount(correction.basisAtTime);
    const now = basisCount(belief.basis);
    const evidenceChanged = then !== null && now !== null && now >= Math.ceil(then * 1.5);
    if (!evidenceChanged) continue;

    kept.push({
      belief: {
        ...belief,
        basis: `${belief.basis} — you told me this was wrong when it was ${then}`,
      },
      pinned: false,
    });
  }

  return kept
    .sort((left, right) => Number(right.pinned) - Number(left.pinned))
    .slice(0, Math.max(1, Math.min(limit, 4)))
    .map((entry) => entry.belief);
}

// ---------------------------------------------------------------------------
// ③ WHILE YOU WERE AWAY
// ---------------------------------------------------------------------------

/**
 * Derive the activity feed from tables that already exist — no new writes, no
 * schema change, and therefore nothing that can drift from what happened.
 *
 * Refusals are first-class items and their `detail` is MANDATORY: a refusal
 * without a stated reason is indistinguishable from a failure, and the whole
 * point of showing them is that declining is a decision the agent made and can
 * defend. An item that cannot say why is dropped rather than shown bare.
 */
export function deriveActivity(candidates = [], squadPlans = [], logs = [], options = {}) {
  const { limit = 10, userId } = options;
  const items = [];

  // A confirmed night is narrated ONCE, by the agent.
  //
  // Live, @tinsley's feed carried the same event twice, adjacent and on the
  // same timestamp, in two different voices: "Added Molly Santana at The
  // Midway to your diary" from the log the agent wrote, and "You confirmed
  // Molly Santana… is in your diary" from the candidate they accepted. The
  // feed is a record of what the agent did, so the agent's line is the one
  // that stays. The candidate line survives only for a night no log covers,
  // which is the case where dropping it would lose the event entirely.
  const reclaimedNights = new Set(
    logs
      .filter((log) => log.source === "reclaim" || log.source === "backfill")
      .map((log) => String(log.showDate ?? "").slice(0, 10)),
  );

  for (const candidate of candidates) {
    const night = String(candidate.clusterDate ?? "").slice(0, 10);
    const photos = candidate.photoCount ?? 0;
    const confidence = Math.round((candidate.confidence ?? 0) * 100);
    const where = candidate.showTitle ? describeShow(candidate.showTitle, candidate.venueName) : null;

    if (candidate.status === "pending" && where) {
      items.push({
        at: candidate.createdAt ?? 0,
        kind: "reclaimed",
        summary: `Rebuilt ${night} from ${plural(photos, "photo")}: ${where}, ${confidence}%`,
        detail: "Waiting on you in Decisions.",
      });
      continue;
    }

    if (candidate.status === "accepted" && where && !reclaimedNights.has(night)) {
      items.push({
        at: candidate.createdAt ?? 0,
        kind: "reclaimed",
        summary: `You confirmed ${where} — ${night} is in your diary`,
      });
      continue;
    }

    // No show attached: the matcher found a night it could not name. That is a
    // refusal, and it only ships if the evidence says why.
    const why = firstDetail(candidate.evidence);
    if (!where && why) {
      items.push({
        at: candidate.createdAt ?? 0,
        kind: "refused",
        summary: `Declined to name the night of ${night}`,
        detail: why,
      });
    }
  }

  for (const plan of squadPlans) {
    if (userId && Array.isArray(plan.userIds) && !plan.userIds.some((id) => String(id) === String(userId))) {
      continue;
    }
    const transcript = Array.isArray(plan.transcript) ? plan.transcript : [];
    const closing = transcript[transcript.length - 1];
    const settled =
      plan.settlement === "simulated"
        ? "Payment was simulated — no ticketing API here sells to agents."
        : undefined;

    items.push({
      at: plan.createdAt ?? closing?.at ?? 0,
      kind: "squad",
      summary: `${plural(plan.userIds?.length ?? 0, "agent")} agreed on ${plan.showTitle}${
        plan.showDate ? ` on ${plan.showDate}` : ""
      }`,
      detail: closing ? `${closing.agent}: "${closing.message}"` : settled,
    });
  }

  for (const log of logs) {
    if (log.source !== "reclaim" && log.source !== "backfill") continue;
    items.push({
      at: log.createdAt ?? 0,
      kind: "reclaimed",
      summary: `Added ${log.showTitle} (${String(log.showDate ?? "").slice(0, 10)}) to your diary`,
      detail: log.source === "reclaim" ? "Rebuilt from your camera roll, with your confirmation." : undefined,
    });
  }

  return items
    .filter((item) => item.kind !== "refused" || Boolean(item.detail))
    .map((item) => (item.detail === undefined ? { at: item.at, kind: item.kind, summary: item.summary } : item))
    .sort((left, right) => right.at - left.at)
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

// "Molly Santana at The Midway" + venue "The Midway" is not "Molly Santana at
// The Midway at The Midway". Ticketmaster names shows after their room, so the
// title usually carries the venue already, and appending it again read as a
// stutter on two of the four rows in the live feed.
//
// Compared through `venueKey`, so "The Midway" in the title still matches
// "Midway" on the row — the same aliasing the venue ceiling has to survive.
function describeShow(title, venueName) {
  const name = String(title ?? "").trim();
  const venue = String(venueName ?? "").trim();
  if (!venue) return name;
  const tail = name.split(/\s+at\s+/i).pop();
  if (venueKey(tail) === venueKey(venue)) return name;
  return `${name} at ${venue}`;
}

function firstDetail(evidence) {
  if (!Array.isArray(evidence)) return null;
  const row = evidence.find((entry) => entry && String(entry.detail ?? "").trim().length > 0);
  return row ? String(row.detail).trim() : null;
}
