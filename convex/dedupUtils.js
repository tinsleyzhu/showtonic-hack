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
    present(show.artistNames)
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
