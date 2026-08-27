import assert from "node:assert/strict";
import test from "node:test";

import {
  foldText,
  normalizeVenueName,
  normalizeArtistName,
  showKey,
  artistKey,
  venueKey,
  buildDuplicateGroups,
  chooseCanonical,
  scoreShow,
  scoreArtist,
  isPlaceholderImage,
  unionLineup,
  planShowMerge,
  planArtistMerge,
  planVenueMerge,
  planDeduplication,
} from "../convex/dedupUtils.js";

// ---------------------------------------------------------------------------
// Keys — the vocabulary the syncs actually differ on
// ---------------------------------------------------------------------------

test("folding reconciles the spellings the sources disagree on", () => {
  assert.equal(foldText("Bob Dylan & His Band"), "bob dylan and his band");
  assert.equal(foldText("Golden Gate Theatre"), "golden gate theater");
  assert.equal(foldText("Béla Fleck"), "bela fleck");
  assert.equal(foldText("The Chapel’s Outdoor Stage"), "the chapels outdoor stage");
  assert.equal(foldText("  Café   du  Nord "), "cafe du nord");
});

test("a leading The is dropped, but never to nothing", () => {
  assert.equal(normalizeVenueName("The Warfield"), "warfield");
  assert.equal(normalizeVenueName("Warfield"), "warfield");
  assert.equal(normalizeArtistName("The The"), "the the"); // stripping empties it
});

test("venue keys are city-scoped so two rooms sharing a name stay apart", () => {
  const sf = venueKey({ name: "Gramercy Theatre", city: "San Francisco" });
  const ny = venueKey({ name: "Gramercy Theater", city: "New York" });
  assert.notEqual(sf, ny);
  assert.equal(ny, venueKey({ name: "The Gramercy Theatre", city: "new york" }));
});

test("unkeyable rows produce no key and are left strictly alone", () => {
  assert.equal(showKey({ date: "", venueName: "X", artistNames: ["Y"] }), "");
  assert.equal(showKey({ date: "2026-01-01", venueName: "", artistNames: ["Y"] }), "");
  assert.equal(showKey(null), "");
  assert.equal(buildDuplicateGroups([{ name: "" }, { name: "" }], artistKey).length, 0);
});

// ---------------------------------------------------------------------------
// The one that protects real data
// ---------------------------------------------------------------------------

test("an early and a late set are two shows, not a duplicate", () => {
  // Ron Carter at Birdland, 2026-10-09: an 8:30 and a 10:30 set, each ingested
  // from both Ticketmaster and JamBase. Four rows, two shows.
  const rows = [
    { _id: "a", date: "2026-10-09", venueName: "Birdland Jazz Club", startTime: "20:30", artistNames: ["Ron Carter"] },
    { _id: "b", date: "2026-10-09", venueName: "Birdland Jazz Club", startTime: "20:30", artistNames: ["Ron Carter"] },
    { _id: "c", date: "2026-10-09", venueName: "Birdland Jazz Club", startTime: "22:30", artistNames: ["Ron Carter"] },
    { _id: "d", date: "2026-10-09", venueName: "Birdland Jazz Club", startTime: "22:30", artistNames: ["Ron Carter"] },
  ];
  const groups = buildDuplicateGroups(rows, showKey);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.members.length),
    [2, 2],
  );
});

test("an untimed row never merges with a timed one", () => {
  const rows = [
    { _id: "a", date: "2026-10-09", venueName: "The Chapel", startTime: "20:00", artistNames: ["Otha"] },
    { _id: "b", date: "2026-10-09", venueName: "The Chapel", artistNames: ["Otha"] },
  ];
  assert.equal(buildDuplicateGroups(rows, showKey).length, 0);
});

test("the same night from two sources still merges", () => {
  const rows = [
    { _id: "a", date: "2026-09-27", venueName: "Brick & Mortar Music Hall", startTime: "20:30", artistNames: ["Guardin", "Kennedyxoxo"] },
    { _id: "b", date: "2026-09-27", venueName: "Brick and Mortar Music Hall", startTime: "20:30", artistNames: ["guardin", "kennedyxoxo"] },
  ];
  assert.equal(buildDuplicateGroups(rows, showKey).length, 1);
});

// ---------------------------------------------------------------------------
// Choosing, and absorbing
// ---------------------------------------------------------------------------

test("the most complete row survives, and ties break deterministically", () => {
  const thin = { _id: "b", _creationTime: 1, artistIds: ["x"], genres: [] };
  const full = { _id: "a", _creationTime: 9, artistIds: ["x", "y"], ticketUrl: "u", genres: [] };
  assert.equal(chooseCanonical([thin, full], scoreShow)._id, "a");

  // Same score: oldest wins, then lowest id — the plan must be reproducible.
  const older = { _id: "z", _creationTime: 1, artistIds: [] };
  const newer = { _id: "a", _creationTime: 2, artistIds: [] };
  assert.equal(chooseCanonical([newer, older], scoreShow)._id, "z");
  assert.equal(
    chooseCanonical([{ _id: "b", artistIds: [] }, { _id: "a", artistIds: [] }], scoreShow)._id,
    "a",
  );
});

test("JamBase's default silhouette does not count as having an image", () => {
  const placeholder = "https://www.jambase.com/wp-content/uploads/2021/08/jambase-default-band-image-bw-1480x832.png";
  assert.equal(isPlaceholderImage(placeholder), true);
  assert.equal(isPlaceholderImage("https://s1.ticketm.net/dam/a/real.jpg"), false);
  assert.equal(
    scoreArtist({ genres: [], image: placeholder }),
    scoreArtist({ genres: [] }),
  );
  // and a real photo is pulled onto a survivor that only had the placeholder
  const merge = planArtistMerge([
    { _id: "a", _creationTime: 1, name: "Samsara", genres: ["rock"], image: placeholder },
    { _id: "b", _creationTime: 2, name: "Samsara", genres: [], image: "https://real/photo.jpg" },
  ]);
  assert.equal(merge.canonicalId, "a");
  assert.equal(merge.patch.image, "https://real/photo.jpg");
});

test("the survivor absorbs the fuller bill without losing the headliner", () => {
  const merge = planShowMerge([
    { _id: "a", _creationTime: 1, artistIds: ["ron"], artistNames: ["Ron Carter"], ticketUrl: "u" },
    { _id: "b", _creationTime: 2, artistIds: ["ron", "don"], artistNames: ["Ron Carter", "Donald Harrison"] },
  ]);
  assert.equal(merge.canonicalId, "b"); // the support act outweighs the ticket link
  assert.deepEqual(merge.duplicateIds, ["a"]);
  assert.equal(merge.patch.ticketUrl, "u"); // absorbed rather than dropped
  assert.equal(merge.patch.artistNames, undefined); // already complete
});

test("lineups union in order, headliner first, no repeats", () => {
  const lineup = unionLineup([
    { artistIds: ["ron"], artistNames: ["Ron Carter"] },
    { artistIds: ["ron", "don"], artistNames: ["ron carter", "Donald Harrison"] },
  ]);
  assert.deepEqual(lineup.artistIds, ["ron", "don"]);
  assert.deepEqual(lineup.artistNames, ["Ron Carter", "Donald Harrison"]);
});

test("genres union, and provenance follows the tags", () => {
  const merge = planArtistMerge([
    { _id: "a", _creationTime: 1, name: "Strawberry Guy", genres: [] },
    { _id: "b", _creationTime: 2, name: "Strawberry Guy", genres: ["pop"], genreSource: "ticketmaster" },
  ]);
  assert.equal(merge.canonicalId, "b"); // tags outweigh age
  assert.deepEqual(merge.patch, {}); // the survivor already had them

  const other = planArtistMerge([
    { _id: "a", _creationTime: 1, name: "Samsara", genres: [], hometown: "SF" },
    { _id: "b", _creationTime: 2, name: "Samsara", genres: ["alternative"], genreSource: "ticketmaster" },
  ]);
  assert.equal(other.canonicalId, "b");
  assert.equal(other.patch.hometown, "SF");
});

test("a survivor that had no tags inherits the donor's provenance, not a claim of its own", () => {
  const merge = planArtistMerge([
    { _id: "a", _creationTime: 1, name: "STS9", genres: [], image: "https://real/a.jpg", bio: "long bio" },
    { _id: "b", _creationTime: 2, name: "STS9", genres: ["rock"], genreSource: "ticketmaster" },
  ]);
  if (merge.canonicalId === "a") {
    assert.deepEqual(merge.patch.genres, ["rock"]);
    assert.equal(merge.patch.genreSource, "ticketmaster");
  }
});

test("venues merge on name and city, absorbing coordinates", () => {
  const merge = planVenueMerge([
    { _id: "a", _creationTime: 1, name: "The Warfield", city: "San Francisco", website: "w" },
    { _id: "b", _creationTime: 2, name: "Warfield", city: "San Francisco", latitude: 1, longitude: 2 },
  ]);
  assert.equal(merge.canonicalId, "b");
  assert.equal(merge.patch.website, "w");
});

test("the plan is deterministic and counts what it will delete", () => {
  const rows = [
    { _id: "a", _creationTime: 1, name: "The Warfield", city: "SF" },
    { _id: "b", _creationTime: 2, name: "Warfield", city: "SF" },
    { _id: "c", _creationTime: 3, name: "Bimbos", city: "SF" },
  ];
  const first = planDeduplication(rows, { keyFn: venueKey, mergeFn: planVenueMerge });
  const second = planDeduplication([...rows].reverse(), { keyFn: venueKey, mergeFn: planVenueMerge });
  assert.equal(first.groupCount, 1);
  assert.equal(first.excessRows, 1);
  assert.equal(first.merges[0].canonicalId, second.merges[0].canonicalId);
});
