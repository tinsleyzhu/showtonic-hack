// Catalog deduplication — the pure half.
//
// The catalog is fed by several syncs (JamBase, Ticketmaster, the free-events
// path) that have never agreed on how a name is spelled. "Golden Gate Theatre"
// and "Golden Gate Theater" are one room; "Bob Dylan & His Band" and "Bob Dylan
// and His Band" are one act; the same night gets inserted once per sync. The
// result is ~22% excess show rows.
//
// Everything here is pure so the merge plan can be proved against a snapshot
// export before a single row is touched in production, and so the SAME key
// functions can be used by ingest to stop the duplicates coming back. A sweep
// without the ingest fix is a one-day cure.

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

// Fold a display string down to something two syncs can agree on. NFKD splits
// accents into base + combining mark so the marks can be dropped ("Béla" and
// "Bela" are the same act); the rest is the vocabulary the sources actually
// differ on.
export function foldText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks left by NFKD
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // curly apostrophes — "The Chapel’s"
    .replace(/&/g, " and ")
    .replace(/\btheatre\b/g, "theater")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/'/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// A leading "the" is noise across sources ("The Warfield" / "Warfield"), but
// only where something survives it. "The The" is a real band, and folding it to
// "the" would let it collide with anything else that folds that far.
export function stripLeadingThe(folded) {
  if (typeof folded !== "string") return "";
  const stripped = folded.replace(/^the\s+/, "");
  if (stripped.length === 0 || stripped === "the") return folded;
  return stripped;
}

export function normalizeVenueName(name) {
  return stripLeadingThe(foldText(name));
}

export function normalizeArtistName(name) {
  return stripLeadingThe(foldText(name));
}

// Two rows are the same show when they are the same night, in the same room,
// headlined by the same act, AT THE SAME START TIME.
//
// That last clause is not pedantry, it is the whole safety of this sweep. A
// jazz club plays an 8:30 and a 10:30 set: two separately ticketed events, same
// date, same room, same headliner. Ron Carter at Birdland on 2026-10-09 is four
// rows that look like one show x4 and are actually two shows x2 — each set
// ingested once from Ticketmaster and once from JamBase.
//
// Measured against the snapshot: keying without start time finds 2,581 "excess"
// rows, of which 1,652 are real, distinct, differently-timed events. Inside
// those groups, 1,433 of 1,453 time gaps are 90 minutes or more — the early/late
// set spacing — against 20 gaps of an hour or less, which is the only band where
// door-time vs stage-time could plausibly be the same show reported twice. So
// exact start time under-merges by at most ~20 groups and over-deletes by none.
// Leaving a duplicate is recoverable; deleting a real show is not.
//
// Support acts are deliberately NOT part of the key: they are the field the
// sources most often disagree on, and treating a fuller bill as a different
// show is how these duplicates got here in the first place.
export function showKey(show) {
  if (!show) return "";
  const date = typeof show.date === "string" ? show.date.slice(0, 10) : "";
  const venue = normalizeVenueName(show.venueName);
  const names = Array.isArray(show.artistNames) ? show.artistNames : [];
  const headliner = normalizeArtistName(names[0] ?? show.title ?? "");
  if (!date || !venue || !headliner) return "";
  // A row with no start time keys separately and so merges only with other
  // untimed rows. It never absorbs, or is absorbed by, a timed one.
  const startTime = typeof show.startTime === "string" ? show.startTime.trim() : "";
  return `${date}|${venue}|${headliner}|${startTime}`;
}

export function artistKey(artist) {
  return artist ? normalizeArtistName(artist.name) : "";
}

// City is part of the venue key: two rooms can share a name in two cities, and
// merging those would move shows to the wrong town.
export function venueKey(venue) {
  if (!venue) return "";
  const name = normalizeVenueName(venue.name);
  if (!name) return "";
  return `${name}|${foldText(venue.city)}`;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Rows sharing a key, in insertion order, singletons dropped. */
export function buildDuplicateGroups(rows, keyFn) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = keyFn(row);
    if (!key) continue; // unkeyable rows are left strictly alone
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  const duplicates = [];
  for (const [key, members] of groups) {
    if (members.length > 1) duplicates.push({ key, members });
  }
  return duplicates;
}

// ---------------------------------------------------------------------------
// Choosing what survives
// ---------------------------------------------------------------------------

// 3,650 of 9,162 artists carry JamBase's default band silhouette. Counting it
// as "has an image" makes the field useless for judging completeness, and lets
// a placeholder win a merge over a real photograph — or be copied onto a
// survivor that had nothing. It is treated as absent everywhere.
export function isPlaceholderImage(url) {
  if (typeof url !== "string") return false;
  return /jambase-default-band-image/i.test(url);
}

const present = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") return value.trim().length > 0 ? 1 : 0;
  if (Array.isArray(value)) return value.length > 0 ? 1 : 0;
  return 1;
};

// Completeness, not recency: the row that survives should be the one a member
// would rather see. Support acts count for more than one because a fuller bill
// is the most visible difference between two copies of a night.
export function scoreShow(show) {
  if (!show) return 0;
  const supportActs = Math.max(0, (show.artistIds?.length ?? 0) - 1);
  return (
    supportActs * 2 +
    presentImage(show.image) +
    present(show.ticketUrl) +
    present(show.venueId) +
    present(show.startTime) +
    present(show.time) +
    present(show.memoryPrompt) +
    present(show.festivalId) +
    present(show.jambaseUrl) +
    present(show.artistNames) +
    // A room named "Irving Plaza Powered By Verizon 5G" is the same room with
    // an ad on it. Between two copies, the survivor should be the one without.
    (hasSponsorSuffix(show.venueName) ? 0 : 1)
  );
}

export function scoreArtist(artist) {
  if (!artist) return 0;
  return (
    (artist.genres?.length ?? 0) * 2 +
    presentImage(artist.image) +
    present(artist.bio) +
    present(artist.hometown) +
    present(artist.topTrack) +
    present(artist.jambaseUrl)
  );
}

export function scoreVenue(venue) {
  if (!venue) return 0;
  return (
    present(venue.latitude) +
    present(venue.longitude) +
    presentImage(venue.image) +
    present(venue.description) +
    present(venue.website) +
    present(venue.region) +
    present(venue.jambaseUrl)
  );
}

// Highest score wins; ties go to the oldest row, then to the lowest id. The
// tie-breaks exist so the plan is DETERMINISTIC — the same snapshot must
// produce the same plan twice, or a dry run proves nothing about the live run.
export function chooseCanonical(members, scoreFn) {
  return [...members].sort((left, right) => {
    const byScore = scoreFn(right) - scoreFn(left);
    if (byScore !== 0) return byScore;
    const byAge = (left._creationTime ?? 0) - (right._creationTime ?? 0);
    if (byAge !== 0) return byAge;
    return String(left._id).localeCompare(String(right._id));
  })[0];
}

// ---------------------------------------------------------------------------
// Merging — what the survivor gains before the others go
// ---------------------------------------------------------------------------
//
// A merge is not "pick one and delete the rest". Each copy usually knows
// something the others do not — one has the ticket link, another has the
// support acts — and deleting is irreversible, so the survivor absorbs every
// field it is missing first. The patch is returned rather than applied, so the
// caller can print it, count it, and diff it before writing.

const presentImage = (value) => (isPlaceholderImage(value) ? 0 : present(value));
const presenceOf = (field) => (field === "image" ? presentImage : present);

const fillScalars = (canonical, others, fields) => {
  const patch = {};
  for (const field of fields) {
    const has = presenceOf(field);
    if (has(canonical[field])) continue;
    for (const other of others) {
      if (has(other[field])) {
        patch[field] = other[field];
        break;
      }
    }
  }
  return patch;
};

// Union two parallel id/name arrays without disturbing the headliner, who is
// whoever the surviving row already lists first.
export function unionLineup(members) {
  const ids = [];
  const names = [];
  const seenId = new Set();
  const seenName = new Set();
  for (const member of members) {
    const memberIds = member.artistIds ?? [];
    const memberNames = member.artistNames ?? [];
    for (let index = 0; index < Math.max(memberIds.length, memberNames.length); index += 1) {
      const id = memberIds[index];
      const name = memberNames[index];
      if (id !== undefined && !seenId.has(String(id))) {
        seenId.add(String(id));
        ids.push(id);
      }
      const folded = normalizeArtistName(name);
      if (folded && !seenName.has(folded)) {
        seenName.add(folded);
        names.push(name);
      }
    }
  }
  return { artistIds: ids, artistNames: names };
}

const SHOW_FILL_FIELDS = [
  "image",
  "ticketUrl",
  "venueId",
  "time",
  "day",
  "memoryPrompt",
  "festivalId",
  "stage",
  "region",
  "jambaseUrl",
];

export function planShowMerge(members) {
  const canonical = chooseCanonical(members, scoreShow);
  const others = members.filter((member) => member._id !== canonical._id);
  const patch = fillScalars(canonical, others, SHOW_FILL_FIELDS);

  const lineup = unionLineup([canonical, ...others]);
  if (lineup.artistIds.length > (canonical.artistIds?.length ?? 0)) {
    patch.artistIds = lineup.artistIds;
  }
  if (lineup.artistNames.length > (canonical.artistNames?.length ?? 0)) {
    patch.artistNames = lineup.artistNames;
  }

  return {
    canonicalId: canonical._id,
    duplicateIds: others.map((other) => other._id),
    patch,
  };
}

const ARTIST_FILL_FIELDS = ["image", "bio", "hometown", "topTrack", "jambaseUrl"];

export function planArtistMerge(members) {
  const canonical = chooseCanonical(members, scoreArtist);
  const others = members.filter((member) => member._id !== canonical._id);
  const patch = fillScalars(canonical, others, ARTIST_FILL_FIELDS);

  // Genres union rather than winner-takes-all: two partial tag sets are more
  // useful joined, and taste matching reads this field.
  const genres = [];
  const seen = new Set();
  for (const member of [canonical, ...others]) {
    for (const genre of member.genres ?? []) {
      const folded = foldText(genre);
      if (!folded || seen.has(folded)) continue;
      seen.add(folded);
      genres.push(genre);
    }
  }
  if (genres.length > (canonical.genres?.length ?? 0)) {
    patch.genres = genres;
    // Provenance follows the tags: if the survivor had none, the source that
    // did supplied them, and claiming otherwise would overstate confidence.
    if (!(canonical.genres ?? []).length) {
      const donor = others.find((other) => (other.genres ?? []).length > 0);
      if (donor?.genreSource) patch.genreSource = donor.genreSource;
    }
  }

  return {
    canonicalId: canonical._id,
    duplicateIds: others.map((other) => other._id),
    patch,
  };
}

const VENUE_FILL_FIELDS = [
  "latitude",
  "longitude",
  "image",
  "description",
  "website",
  "region",
  "jambaseUrl",
];

export function planVenueMerge(members) {
  const canonical = chooseCanonical(members, scoreVenue);
  const others = members.filter((member) => member._id !== canonical._id);
  return {
    canonicalId: canonical._id,
    duplicateIds: others.map((other) => other._id),
    patch: fillScalars(canonical, others, VENUE_FILL_FIELDS),
  };
}

/**
 * The whole plan for one table: which rows survive, what they absorb, and what
 * goes. Deterministic for a given snapshot — that is what makes a dry run
 * evidence rather than a rehearsal.
 */
export function planDeduplication(rows, { keyFn, mergeFn }) {
  const groups = buildDuplicateGroups(rows, keyFn);
  const merges = groups.map((group) => ({ key: group.key, ...mergeFn(group.members) }));
  return {
    groupCount: merges.length,
    excessRows: merges.reduce((total, merge) => total + merge.duplicateIds.length, 0),
    merges,
  };
}

// ---------------------------------------------------------------------------
// Pass 2 — venue aliases
// ---------------------------------------------------------------------------
//
// Pass 1 keyed on the venue NAME, so it could not see that "Blue Note Jazz
// Club" and "The Blue Note" are one room. 332 groups survive it where the date,
// the headliner and the start time all match and only the venue name differs.
//
// Coordinates would look like the obvious fix and are verified unsafe: several
// venue rows carry city-centroid geocodes (Golden Gate Theater, Miner
// Auditorium, Orpheum and the Warfield all share one rounded point), and rooms
// that genuinely share an address are real — Carnegie's Stern and Weill, Cafe
// du Nord and Swedish American Hall.
//
// So the test is a TOKEN SUBSET: one name's words must be wholly contained in
// the other's. That accepts "Blue Note" ⊂ "Blue Note Jazz Club" and refuses
// "Bowery Palace" vs "The Bowery Electric", which share a word but are two
// rooms. Subset is directional containment, not overlap, and that is the whole
// safety of it.

// Sponsor dressing and city suffixes are noise the sources add, not part of the
// room's name: "Irving Plaza Powered By Verizon 5G", "Blue Note Jazz Club - NY".
const VENUE_STOP_PHRASES = [/\bpowered by\b.*$/, /\bpresented by\b.*$/, /\bsponsored by\b.*$/];
const VENUE_TRAILING_STOP_TOKENS = new Set(["ny", "nyc", "sf"]);

// Words that do not identify a room on their own. A name that reduces to
// nothing but these cannot be matched by subset — otherwise a venue called
// "Park" would be absorbed by "Golden Gate Park".
const GENERIC_VENUE_TOKENS = new Set([
  "the", "at", "and", "of", "a", "on",
  "theater", "hall", "club", "room", "stage", "lounge", "bar", "cafe",
  "center", "centre", "arena", "auditorium", "ballroom", "music", "jazz",
  "live", "park", "venue", "house", "studio", "studios", "presents",
]);

export function venueTokens(name) {
  let folded = stripLeadingThe(foldText(name));
  for (const phrase of VENUE_STOP_PHRASES) folded = folded.replace(phrase, "");
  const tokens = folded.split(" ").filter(Boolean);
  while (tokens.length > 1 && VENUE_TRAILING_STOP_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens;
}

export function hasSponsorSuffix(name) {
  const folded = foldText(name);
  return VENUE_STOP_PHRASES.some((phrase) => phrase.test(folded));
}

/**
 * True when two venue names are the same room under the subset rule: one
 * token set contains the other, and the contained set says something more
 * specific than "hall" or "park".
 */
// Rooms INSIDE a venue, decided by a human on 2026-08-27 and encoded here so
// the decision is auditable rather than remembered. Structural rules cover the
// "<room> at <venue>" shape below; these are the ones no rule should guess.
const VENUE_KEEP_SEPARATE = [
  // Unresolved at signoff — treat as separate until someone reads the source.
  ["apollos victoria theater", "apollos victoria theater 1"],
  // Nested rooms, also caught structurally; listed so the signoff is explicit.
  ["city winery", "loft at city winery"],
  ["madison square garden", "infosys theater at madison square garden"],
  ["lincoln center", "david geffen hall at lincoln center"],
  ["bill graham civic auditorium", "theater at bill graham civic auditorium"],
  ["chapel", "chapels outdoor stage"],
].map((pair) => pair.map((name) => name.split(" ").sort().join(" ")).sort().join("||"));

const keepSeparatePairKey = (left, right) =>
  [venueTokens(left), venueTokens(right)]
    .map((tokens) => [...tokens].sort().join(" "))
    .sort()
    .join("||");

// "The Loft at City Winery" is a room inside City Winery, not another name for
// it — and a token subset cannot tell those apart, because the room's name
// genuinely contains the venue's. What separates them is WHERE the containment
// sits: if everything the shorter name says appears after an "at", the longer
// name is a room within it. "David Geffen Hall at Lincoln Center" is nested
// inside "Lincoln Center" and is an alias of "David Geffen Hall", and this
// rule gets both right for the same reason.
function isNestedRoom(smallTokens, largeTokens) {
  const at = largeTokens.lastIndexOf("at");
  if (at < 1) return false;
  const after = new Set(largeTokens.slice(at + 1));
  if (after.size === 0) return false;
  return [...smallTokens].every((token) => after.has(token));
}

export function venueNamesAlias(left, right) {
  if (VENUE_KEEP_SEPARATE.includes(keepSeparatePairKey(left, right))) return false;
  const a = new Set(venueTokens(left));
  const b = new Set(venueTokens(right));
  if (a.size === 0 || b.size === 0) return false;

  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) {
    if (!large.has(token)) return false;
  }

  const largeTokens = a.size <= b.size ? venueTokens(right) : venueTokens(left);
  if (isNestedRoom(small, largeTokens)) return false;
  // The shared part has to be distinctive on its own.
  return [...small].some((token) => !GENERIC_VENUE_TOKENS.has(token));
}

// Venue-free identity: same night, same headliner, same start time. Rows
// sharing this are CANDIDATES for the subset test, never merged on it alone —
// on its own it would merge two genuinely different rooms.
export function showAliasKey(show) {
  if (!show) return "";
  const date = typeof show.date === "string" ? show.date.slice(0, 10) : "";
  const names = Array.isArray(show.artistNames) ? show.artistNames : [];
  const headliner = normalizeArtistName(names[0] ?? show.title ?? "");
  if (!date || !headliner) return "";
  const startTime = typeof show.startTime === "string" ? show.startTime.trim() : "";
  return `${date}|${headliner}|${startTime}`;
}

/**
 * Cluster rows that share an alias key into groups of one-room-many-names.
 * Transitive on purpose: "The Blue Note" ⊂ "Blue Note Jazz Club" ⊂ "Blue Note
 * Jazz Club - NY" is one room under three names, and all three should land in
 * the same cluster.
 */
export function clusterByVenueAlias(rows) {
  const clusters = [];
  for (const row of rows ?? []) {
    const match = clusters.find((cluster) =>
      cluster.some((member) => venueNamesAlias(member.venueName, row.venueName)),
    );
    if (match) match.push(row);
    else clusters.push([row]);
  }
  return clusters.filter((cluster) => cluster.length > 1);
}

/**
 * The pass-2 plan. Rows are bucketed by the venue-free key, then each bucket is
 * clustered by the subset rule; only clusters larger than one merge.
 *
 * A row with NO start time is a special case worth stating: it is allowed to
 * join a cluster only when that cluster has exactly one distinct start time.
 * Two distinct times means the untimed row could belong to either the early or
 * the late set, and guessing there is how a real show gets deleted.
 */
export function planVenueAliasDeduplication(shows) {
  const buckets = new Map();
  const untimed = new Map();
  for (const show of shows ?? []) {
    const key = showAliasKey(show);
    if (!key) continue;
    const timed = typeof show.startTime === "string" && show.startTime.trim().length > 0;
    const target = timed ? buckets : untimed;
    const bucket = target.get(key);
    if (bucket) bucket.push(show);
    else target.set(key, [show]);
  }

  const merges = [];
  for (const [key, rows] of buckets) {
    for (const cluster of clusterByVenueAlias(rows)) {
      merges.push({ key, ...planShowMerge(cluster) });
    }
  }

  // Untimed rows: their alias key ends in an empty time, so pair them against
  // the timed rows for the same night and headliner.
  let untimedAttached = 0;
  for (const [key, rows] of untimed) {
    const prefix = key.slice(0, key.lastIndexOf("|") + 1);
    const siblings = [];
    for (const [timedKey, timedRows] of buckets) {
      if (timedKey.startsWith(prefix)) siblings.push(...timedRows);
    }
    const distinctTimes = new Set(siblings.map((row) => row.startTime));
    if (distinctTimes.size !== 1) continue; // ambiguous — leave it alone
    for (const row of rows) {
      const cluster = [...siblings, row];
      if (!clusterByVenueAlias(cluster).length) continue;
      merges.push({ key, ...planShowMerge(cluster) });
      untimedAttached += 1;
    }
  }

  return {
    groupCount: merges.length,
    excessRows: merges.reduce((total, merge) => total + merge.duplicateIds.length, 0),
    untimedAttached,
    merges,
  };
}

// ---------------------------------------------------------------------------
// Denormalized display names
// ---------------------------------------------------------------------------
//
// shows.venueName is a denormalized string, and the Browse dropdown reads it
// directly — so "Bimbo's 365 Club" and "Bimbo’s 365 Club" (straight vs curly
// apostrophe) appear as two rooms even after every duplicate SHOW is merged.
// The rows are correct; the strings disagree. One spelling per room, chosen
// once, fixes the dropdown without touching a single show's identity.

/**
 * Pick the spelling a room should be displayed under: the one most shows
 * already use. Measured on the catalog, the majority spelling is the natural
 * public name every time — "The Warfield" 36 to 2, "The Cutting Room" 206 to
 * 6, "The Gramercy Theatre" 175 to 23. Letting the venues table win instead
 * produced "Warfield" and "Golden Gate Theater", which is a visible
 * downgrade for the person who reported the twins in the first place. So the
 * venue row is a TIE-BREAK, not an authority — it holds one spelling, not a
 * count, and cannot outvote 200 shows.
 */
export function chooseDisplayVenueName(candidates) {
  const pool = (candidates ?? []).filter((candidate) => candidate?.name);
  if (pool.length === 0) return "";

  return [...pool].sort((left, right) => {
    const byCount = (right.count ?? 0) - (left.count ?? 0);
    if (byCount !== 0) return byCount;
    const byRecord = Number(right.fromVenueRow) - Number(left.fromVenueRow);
    if (byRecord !== 0) return byRecord;
    const bySponsor = Number(hasSponsorSuffix(left.name)) - Number(hasSponsorSuffix(right.name));
    if (bySponsor !== 0) return bySponsor;
    const byLength = right.name.length - left.name.length;
    if (byLength !== 0) return byLength;
    return left.name.localeCompare(right.name);
  })[0].name;
}

/**
 * The whole rename plan: for each room, the spelling to keep and the spellings
 * to replace. Rooms already spelled one way produce nothing.
 */
export function planVenueNameCanonicalization(shows, venues) {
  const rooms = new Map();

  // Only shows are counted. A venues row contributes its spelling as a
  // tie-break flag, never as a vote — one record must not outweigh the rows
  // people actually see.
  const bump = (key, name, fromVenueRow) => {
    if (!key || !name) return;
    const room = rooms.get(key) ?? new Map();
    const entry = room.get(name) ?? { name, count: 0, fromVenueRow: false };
    if (fromVenueRow) entry.fromVenueRow = true;
    else entry.count += 1;
    room.set(name, entry);
    rooms.set(key, room);
  };

  for (const show of shows ?? []) {
    bump(venueKey({ name: show.venueName, city: show.city }), show.venueName, false);
  }
  for (const venue of venues ?? []) {
    bump(venueKey(venue), venue.name, true);
  }

  const renames = [];
  for (const [key, room] of rooms) {
    const candidates = [...room.values()];
    if (candidates.length < 2) continue;
    const keep = chooseDisplayVenueName(candidates);
    const replace = candidates
      .filter((candidate) => candidate.name !== keep)
      .map((candidate) => candidate.name);
    if (replace.length > 0) renames.push({ key, keep, replace });
  }

  return {
    roomCount: renames.length,
    spellingCount: renames.reduce((total, rename) => total + rename.replace.length, 0),
    renames,
  };
}
