import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtistSearchQuery,
  resultDomain,
  mentionsArtist,
  genresInText,
  genreEvidenceFromResults,
  corroboratedGenres,
  decideArtistGenres,
} from "../convex/artistSearchUtils.js";

test("buildArtistSearchQuery anchors on the room and the city", () => {
  const query = buildArtistSearchQuery({
    name: "Otha",
    venueName: "The Independent",
    city: "San Francisco",
  });
  assert.match(query, /"Otha"/); // quoted, so the name is not split
  assert.match(query, /The Independent/);
  assert.match(query, /San Francisco/);
});

test("buildArtistSearchQuery still works with no anchors, and refuses an empty name", () => {
  assert.match(buildArtistSearchQuery({ name: "Otha" }), /"Otha"/);
  assert.equal(buildArtistSearchQuery({ name: "   " }), "");
  assert.equal(buildArtistSearchQuery(), "");
});

test("resultDomain reduces a url to a comparable domain", () => {
  assert.equal(resultDomain("https://www.residentadvisor.net/dj/otha"), "residentadvisor.net");
  assert.equal(resultDomain("https://pitchfork.com/reviews/"), "pitchfork.com");
  assert.equal(resultDomain("not a url"), "");
});

test("mentionsArtist rejects a page that never names the artist", () => {
  const name = "Traps PS";
  assert.equal(mentionsArtist({ title: "Traps PS live", content: "" }, name), true);
  assert.equal(mentionsArtist({ title: "", content: "a set from traps ps" }, name), true);
  assert.equal(
    mentionsArtist({ title: "Trap music in the Bay", content: "a scene report" }, name),
    false,
  );
});

test("genresInText prefers the specific tag over the broad one", () => {
  assert.deepEqual(genresInText("a jazz fusion record"), ["jazz fusion"]);
  assert.deepEqual(genresInText("an indie rock band"), ["indie rock"]);
});

test("genresInText is word-bounded, so substrings do not become tags", () => {
  assert.deepEqual(genresInText("the trapdoor opened"), []);
  assert.deepEqual(genresInText("poprock is not a word"), []);
  assert.deepEqual(genresInText("nothing musical here"), []);
});

test("genreEvidenceFromResults ignores results about a different entity", () => {
  const evidence = genreEvidenceFromResults(
    [
      { title: "Otha - techno DJ", url: "https://ra.co/dj/otha", content: "techno" },
      // Names a genre but never the artist: must not contribute.
      { title: "House music in SF", url: "https://sfgate.com/x", content: "house" },
    ],
    "Otha",
  );
  assert.deepEqual(
    evidence.map((item) => item.genre),
    ["techno"],
  );
});

test("genreEvidenceFromResults counts one domain once, however many pages", () => {
  const evidence = genreEvidenceFromResults(
    [
      { title: "Otha techno", url: "https://ra.co/a", content: "techno" },
      { title: "Otha techno again", url: "https://ra.co/b", content: "techno" },
    ],
    "Otha",
  );
  assert.equal(evidence.length, 1, "same domain corroborates nothing");
});

test("corroboratedGenres requires independent domains", () => {
  const evidence = [
    { genre: "techno", domain: "ra.co" },
    { genre: "techno", domain: "pitchfork.com" },
    { genre: "jazz", domain: "ra.co" },
  ];
  assert.deepEqual(corroboratedGenres(evidence), ["techno"]); // jazz has one source
});

test("decideArtistGenres writes nothing when a single source claims a genre", () => {
  const decision = decideArtistGenres(
    [{ title: "Slayr, a jazz musician", url: "https://example.com/a", content: "jazz" }],
    { name: "Slayr" },
  );
  assert.deepEqual(decision.genres, []);
  assert.match(decision.reason, /2 independent sources/);
});

test("decideArtistGenres writes nothing when no page names the artist", () => {
  const decision = decideArtistGenres(
    [
      { title: "Techno in Oakland", url: "https://a.com/1", content: "techno" },
      { title: "Techno history", url: "https://b.com/2", content: "techno" },
    ],
    { name: "Slayr" },
  );
  assert.deepEqual(decision.genres, []);
  assert.match(decision.reason, /named the artist/);
});

test("decideArtistGenres accepts a genre two independent sources agree on", () => {
  const decision = decideArtistGenres(
    [
      { title: "Otha techno DJ", url: "https://ra.co/dj/otha", content: "techno producer" },
      { title: "Otha interview", url: "https://pitchfork.com/otha", content: "her techno sets" },
    ],
    { name: "Otha" },
  );
  assert.deepEqual(decision.genres, ["techno"]);
  assert.deepEqual(decision.sources?.sort(), ["pitchfork.com", "ra.co"]);
});

test("decideArtistGenres handles an empty or missing result set", () => {
  assert.deepEqual(decideArtistGenres([], { name: "Otha" }).genres, []);
  assert.deepEqual(decideArtistGenres(undefined, { name: "Otha" }).genres, []);
});
