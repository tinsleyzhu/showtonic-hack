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
  planNextIdentifyBatch,
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

// ---------------------------------------------------------------------------
// planNextIdentifyBatch — the arithmetic that decides whether to spend more.
// ---------------------------------------------------------------------------

const full = { searched: 25, requested: 25, identified: 21, budgetRemaining: 1000 };

test("a full page under both caps keeps draining", () => {
  const plan = planNextIdentifyBatch({ limit: 25, maxCredits: 200, creditsSpent: 0, last: full });
  assert.equal(plan.stop, false);
  assert.equal(plan.done, false);
  assert.equal(plan.nextLimit, 25);
  assert.equal(plan.creditsSpent, 25);
});

test("the run's credit cap is a ceiling, not a suggestion", () => {
  const plan = planNextIdentifyBatch({ limit: 25, maxCredits: 25, creditsSpent: 0, last: full });
  assert.equal(plan.stop, true);
  assert.equal(plan.done, false); // the backlog is still there
  assert.match(plan.reason, /credit cap/);
  assert.equal(plan.delayMs, null);
});

test("the last partial batch is trimmed to what the cap leaves", () => {
  const plan = planNextIdentifyBatch({ limit: 25, maxCredits: 60, creditsSpent: 25, last: full });
  assert.equal(plan.stop, false);
  assert.equal(plan.nextLimit, 10); // 60 - 50, not another full page
});

test("a short page means the backlog ran out — that is done, not stopped", () => {
  const plan = planNextIdentifyBatch({
    limit: 25,
    maxCredits: 200,
    last: { searched: 4, requested: 4, identified: 3, budgetRemaining: 900 },
  });
  assert.equal(plan.done, true);
  assert.equal(plan.stop, true);
  assert.match(plan.reason, /backlog empty/);
});

test("an exhausted search budget stops the chain but never reports done", () => {
  const skipped = planNextIdentifyBatch({
    limit: 25,
    last: { searched: 0, requested: 25, identified: 0, skipped: "search budget exhausted" },
  });
  assert.equal(skipped.stop, true);
  assert.equal(skipped.done, false);

  // A partial grant spends the remainder and comes back empty-handed. A short
  // page here must not be read as "nothing left to enrich".
  const partial = planNextIdentifyBatch({
    limit: 25,
    last: { searched: 8, requested: 8, identified: 6, budgetRemaining: 0 },
  });
  assert.equal(partial.stop, true);
  assert.equal(partial.done, false);
  assert.match(partial.reason, /budget exhausted/);
  assert.equal(partial.creditsSpent, 8);
});

test("a missing key stops the chain instead of looping on it", () => {
  const plan = planNextIdentifyBatch({
    limit: 25,
    last: { searched: 0, requested: 25, skipped: "TAVILY_API_KEY is not set" },
  });
  assert.equal(plan.stop, true);
  assert.equal(plan.done, false);
  assert.match(plan.reason, /TAVILY_API_KEY/);
});

test("a thrown batch retries with a growing backoff, then gives up", () => {
  const first = planNextIdentifyBatch({ limit: 25, failures: 0, last: null });
  assert.equal(first.stop, false);
  assert.equal(first.failures, 1);
  assert.equal(first.delayMs, 5_000);

  const second = planNextIdentifyBatch({ limit: 25, failures: 1, last: null });
  assert.equal(second.delayMs, 10_000);

  const last = planNextIdentifyBatch({ limit: 25, failures: 4, last: null });
  assert.equal(last.stop, true);
  assert.equal(last.done, false);
  assert.match(last.reason, /gave up/);
});

test("a batch that broke early is retried, not mistaken for a finish line", () => {
  const plan = planNextIdentifyBatch({
    limit: 25,
    maxCredits: 200,
    last: { searched: 9, requested: 25, identified: 7, budgetRemaining: 900 },
  });
  assert.equal(plan.done, false);
  assert.equal(plan.stop, false);
  assert.equal(plan.failures, 1);
  assert.equal(plan.creditsSpent, 9); // the nine it did spend still count
  assert.match(plan.reason, /stopped early/);
});

test("one success clears the failure streak", () => {
  const plan = planNextIdentifyBatch({ limit: 25, maxCredits: 200, failures: 3, last: full });
  assert.equal(plan.failures, 0);
});

test("the batch cap bounds a single call independently of credits", () => {
  const plan = planNextIdentifyBatch({
    limit: 25,
    maxCredits: 10_000,
    maxBatches: 3,
    batchIndex: 2,
    last: full,
  });
  assert.equal(plan.stop, true);
  assert.match(plan.reason, /batch cap/);
});
