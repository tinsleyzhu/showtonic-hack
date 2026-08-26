import assert from "node:assert/strict";
import test from "node:test";

import { negotiate, scoreShow } from "../agents/negotiate.mjs";

function agent(handle, taste = {}) {
  return {
    agent: `${handle}-agent`,
    taste: {
      handle,
      lowSignal: false,
      topArtists: [],
      lovedArtists: [],
      topVenues: [],
      topGenres: [],
      ...taste,
    },
  };
}

function show(showId, artists, venue = "Some Room") {
  return { showId, title: showId, artists, venue, date: "2026-09-01", genres: [] };
}

test("scoreShow weighs loved artists above merely seen ones", () => {
  const loved = scoreShow(show("s", ["Jamie xx"]), {
    lovedArtists: ["Jamie xx"],
    topArtists: [{ name: "Jamie xx" }],
  });
  const seen = scoreShow(show("s", ["Jamie xx"]), { topArtists: [{ name: "Jamie xx" }] });

  assert.ok(loved.points > seen.points);
  assert.match(loved.because[0], /favourites/);
});

test("scoreShow damps a thin diary rather than trusting it", () => {
  const taste = { lovedArtists: ["Jamie xx"] };
  const confident = scoreShow(show("s", ["Jamie xx"]), taste);
  const thin = scoreShow(show("s", ["Jamie xx"]), { ...taste, lowSignal: true });

  assert.equal(thin.points, confident.points / 2);
});

test("a five-agent squad converges when a majority actively want the same night", () => {
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Jamie xx"] }),
    agent("cy", { topArtists: [{ name: "Jamie xx" }] }),
    agent("dee"),
    agent("eli"),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Nobody"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "consensus");
  assert.equal(result.plans[0].show.showId, "s1");
  assert.equal(result.plans[0].group.length, 5);
});

test("indifferent members do not block — they just do not carry the vote", () => {
  const squad = [agent("ana", { lovedArtists: ["Jamie xx"] }), agent("ben")];
  const slate = [show("s1", ["Jamie xx"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "consensus");
  assert.equal(result.plans[0].acceptCount, 1);
  assert.deepEqual(result.plans[0].blocks, []);
});

test("the squad splits when the whole group cannot agree but a subgroup can", () => {
  // ana and ben want the techno night; cy wants the folk night and would
  // rather be there, so cy blocks rather than tagging along.
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Jamie xx"] }),
    agent("cy", { lovedArtists: ["Big Thief"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "split");
  assert.equal(result.plans[0].show.showId, "s1");
  assert.deepEqual(
    result.plans[0].group.map((member) => member.taste.handle),
    ["ana", "ben"],
  );
  assert.deepEqual(
    result.plans[0].excluded.map((member) => member.taste.handle),
    ["cy"],
  );
});

test("nobody is quietly dropped — a split names who is left out", () => {
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Jamie xx"] }),
    agent("cy", { lovedArtists: ["Big Thief"] }),
    agent("dee", { lovedArtists: ["Big Thief"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "split");
  const named = [
    ...result.plans[0].group.map((member) => member.taste.handle),
    ...result.plans[0].excluded.map((member) => member.taste.handle),
  ].sort();
  assert.deepEqual(named, ["ana", "ben", "cy", "dee"]);
});

test("refuses rather than inventing a consensus nobody holds", () => {
  const squad = [agent("ana"), agent("ben"), agent("cy")];
  const slate = [show("s1", ["Nobody"]), show("s2", ["Nobody Else"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "refused");
  assert.equal(result.reason, "no_viable_group");
  assert.deepEqual(result.plans, []);
});

test("refuses on an empty slate instead of returning an undefined show", () => {
  const result = negotiate([agent("ana"), agent("ben")], []);

  assert.equal(result.outcome, "refused");
  assert.equal(result.reason, "empty_slate");
});

test("refuses when there are not enough agents to be a squad", () => {
  const result = negotiate([agent("ana", { lovedArtists: ["Jamie xx"] })], [
    show("s1", ["Jamie xx"]),
  ]);

  assert.equal(result.outcome, "refused");
  assert.equal(result.reason, "too_few_agents");
});

test("every member of a consensus plan gets a recorded stance", () => {
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Jamie xx"] }),
    agent("cy"),
  ];
  const slate = [show("s1", ["Jamie xx"])];

  const { plans } = negotiate(squad, slate);

  assert.equal(plans[0].votes.length, 3);
  for (const vote of plans[0].votes) {
    assert.ok(["accepts", "neutral", "blocks"].includes(vote.stance));
  }
});
