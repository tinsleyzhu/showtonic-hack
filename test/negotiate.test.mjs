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

test("a member with nothing better to do stays neutral instead of blocking", () => {
  // ana wants the show; ben's human has no history at all, so there is no
  // "somewhere I'd rather be" — an opinion-less agent must not veto.
  const squad = [agent("ana", { lovedArtists: ["Jamie xx"] }), agent("ben")];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Nobody"])];

  const { plans } = negotiate(squad, slate);
  const ben = plans[0].votes.find((vote) => vote.member.taste.handle === "ben");

  assert.equal(ben.stance, "neutral");
});

test("a raised floor can turn a consensus into a refusal", () => {
  // "seen before" is worth 3; a floor of 4 means only a loved artist counts.
  const squad = [
    agent("ana", { topArtists: [{ name: "Jamie xx" }] }),
    agent("ben", { topArtists: [{ name: "Jamie xx" }] }),
  ];
  const slate = [show("s1", ["Jamie xx"])];

  assert.equal(negotiate(squad, slate, { floor: 3 }).outcome, "consensus");
  assert.equal(negotiate(squad, slate, { floor: 4 }).outcome, "refused");
});

test("a thin diary can fall under the floor its damping puts it below", () => {
  // A loved artist is 5 points, halved to 2.5 for a thin diary. At floor 3
  // the confident agent clears and the thin one does not.
  const taste = { lovedArtists: ["Jamie xx"] };
  const confident = [agent("ana", taste), agent("ben", taste)];
  const thin = [
    agent("ana", { ...taste, lowSignal: true }),
    agent("ben", { ...taste, lowSignal: true }),
  ];
  const slate = [show("s1", ["Jamie xx"])];

  assert.equal(negotiate(confident, slate, { floor: 3 }).outcome, "consensus");
  assert.equal(negotiate(thin, slate, { floor: 3 }).outcome, "refused");
});

test("minGroup refuses a split that would be smaller than the group is allowed to be", () => {
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Big Thief"] }),
    agent("cy", { lovedArtists: ["Big Thief"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief"])];

  // ben + cy can go without ana...
  assert.equal(negotiate(squad, slate, { minGroup: 2 }).outcome, "split");
  // ...but not if a plan has to carry all three.
  assert.equal(negotiate(squad, slate, { minGroup: 3 }).outcome, "refused");
});

test("a split takes the largest workable group, not the most enthusiastic one", () => {
  // dee alone would score higher on s2, but three people can go to s1.
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { lovedArtists: ["Jamie xx"] }),
    agent("cy", { lovedArtists: ["Jamie xx"] }),
    agent("dee", { lovedArtists: ["Big Thief", "Big Thief II"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief", "Big Thief II"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "split");
  assert.equal(result.plans[0].group.length, 3);
  assert.equal(result.plans[0].show.showId, "s1");
});

test("a squad past the power-set bound still negotiates", () => {
  // 12 agents — candidateGroups switches to whole-group plus drop-one rather
  // than enumerating 4,096 subsets.
  const squad = Array.from({ length: 12 }, (_, index) =>
    agent(`m${index}`, { lovedArtists: ["Jamie xx"] }),
  );
  const slate = [show("s1", ["Jamie xx"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "consensus");
  assert.equal(result.plans[0].group.length, 12);
});

test("a large squad splits by dropping the members who would rather be elsewhere", () => {
  const squad = [
    ...Array.from({ length: 11 }, (_, index) =>
      agent(`m${index}`, { lovedArtists: ["Jamie xx"] }),
    ),
    agent("holdout", { lovedArtists: ["Big Thief"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief"])];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "split");
  assert.deepEqual(
    result.plans[0].excluded.map((member) => member.taste.handle),
    ["holdout"],
  );
});

test("shows missing artists or a venue are scored, not crashed on", () => {
  const squad = [agent("ana", { lovedArtists: ["Jamie xx"] }), agent("ben")];
  const slate = [
    { showId: "bare", title: "bare", date: "2026-09-01" },
    show("s1", ["Jamie xx"]),
  ];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "consensus");
  assert.equal(result.plans[0].show.showId, "s1");
});

test("venue affinity alone can carry a night nobody's artists are on", () => {
  const taste = { topVenues: [{ name: "The Fillmore" }] };
  const squad = [agent("ana", taste), agent("ben", taste)];
  const slate = [show("s1", ["Nobody"], "The Fillmore")];

  const result = negotiate(squad, slate);

  assert.equal(result.outcome, "consensus");
  assert.match(result.plans[0].votes[0].because[0], /keep going back to/);
});

test("negotiating twice over the same inputs gives the same answer", () => {
  const squad = [
    agent("ana", { lovedArtists: ["Jamie xx"] }),
    agent("ben", { topArtists: [{ name: "Jamie xx" }] }),
    agent("cy", { lovedArtists: ["Big Thief"] }),
  ];
  const slate = [show("s1", ["Jamie xx"]), show("s2", ["Big Thief"])];

  const first = negotiate(squad, slate);
  const second = negotiate(squad, slate);

  assert.equal(first.outcome, second.outcome);
  assert.equal(first.plans[0].show.showId, second.plans[0].show.showId);
  assert.deepEqual(
    first.plans[0].group.map((member) => member.taste.handle),
    second.plans[0].group.map((member) => member.taste.handle),
  );
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
