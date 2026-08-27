import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBeliefFeedback,
  deriveActivity,
  narrateBeliefs,
  scoreFinds,
} from "../convex/briefingLogic.js";
import { LOW_SIGNAL_SHOWS } from "../convex/tasteMath.js";

function log(overrides = {}) {
  return {
    showDate: "2026-05-02",
    showTitle: "A night",
    artistNames: ["Osees"],
    artistGenres: ["punk"],
    venueName: "Rickshaw Stop",
    rating: 4.5,
    createdAt: 1_756_000_000_000,
    ...overrides,
  };
}

function show(overrides = {}) {
  return {
    showId: "show-1",
    title: "Mannequin Pussy",
    date: "2026-09-04",
    venueName: "Rickshaw Stop",
    city: "San Francisco",
    artistNames: ["Mannequin Pussy"],
    genres: ["punk"],
    ...overrides,
  };
}

function diary(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) =>
    log({ showDate: `2026-0${(index % 8) + 1}-1${index % 9}`, ...overrides }),
  );
}

// --- ② what your agent found -----------------------------------------------

test("a thin diary gets no finds at all, not weak ones", () => {
  // The same floor the profile screen, the MCP taste tool and peer discovery
  // use. Scouting from four nights is implying a pattern we cannot see.
  const finds = scoreFinds([show()], { logs: diary(LOW_SIGNAL_SHOWS - 1), today: "2026-08-27" });
  assert.deepEqual(finds, []);
});

test("no evidence, no card", () => {
  // A show with nothing in common with the diary is not a weak recommendation.
  // It is a guess, and the matcher's rule carries over: it does not ship.
  const finds = scoreFinds(
    [show({ showId: "stranger", artistNames: ["Nobody You Know"], genres: ["polka"], venueName: "Some Room" })],
    { logs: diary(8), today: "2026-08-27" },
  );
  assert.deepEqual(finds, []);
});

test("every find's evidence adds up to the score on the card", () => {
  const [find] = scoreFinds([show()], {
    logs: diary(8),
    followedArtistNames: ["Mannequin Pussy"],
    today: "2026-08-27",
  });

  assert.ok(find.evidence.length > 0);
  const summed = find.evidence.reduce((total, row) => total + row.weight, 0);
  // Rounded to cents, because the Why expansion renders rounded weights.
  assert.ok(Math.abs(summed - find.score) < 0.02, `${summed} vs ${find.score}`);
  assert.ok(find.score > 0 && find.score <= 1);
});

test("evidence rows are checkable sentences, not scores in disguise", () => {
  const [find] = scoreFinds([show()], {
    logs: diary(8),
    followedArtistNames: ["Mannequin Pussy"],
    peersGoing: { "show-1": [{ handle: "vee", matchPercent: 78 }] },
    today: "2026-08-27",
  });

  const details = find.evidence.map((row) => row.detail);
  assert.ok(details.some((detail) => /night(s)? at this venue rated 4★ or higher/.test(detail)));
  assert.ok(details.some((detail) => /Mannequin Pussy is on the bill and you follow them/.test(detail)));
  assert.ok(details.some((detail) => /1 person with 78% taste overlap is going/.test(detail)));
  const kinds = new Set(find.evidence.map((row) => row.kind));
  for (const kind of kinds) {
    assert.ok(["venue-history", "artist-overlap", "genre-fit", "friend-going", "recency"].includes(kind));
  }
});

test("a concierge recommends five things, it does not paginate", () => {
  const shows = Array.from({ length: 12 }, (_, index) =>
    show({
      showId: `show-${index}`,
      title: `Act ${index}`,
      artistNames: [`Act ${index}`],
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    }),
  );
  const finds = scoreFinds(shows, { logs: diary(8), today: "2026-08-27", limit: 25 });
  assert.equal(finds.length, 5);
  const scores = finds.map((find) => find.score);
  assert.deepEqual(scores, [...scores].sort((left, right) => right - left));
});

test("a show already in your diary or on your calendar is not a discovery", () => {
  const finds = scoreFinds([show({ showId: "already" })], {
    logs: diary(8),
    excludeShowIds: ["already"],
    today: "2026-08-27",
  });
  assert.deepEqual(finds, []);
});

test("a genre the city is drowning in counts for less than a rare one", () => {
  const jazzCity = Array.from({ length: 20 }, (_, index) => ({
    showId: `catalog-${index}`,
    title: "x",
    date: "2026-09-01",
    venueName: "x",
    city: "San Francisco",
    genres: index === 0 ? ["punk"] : ["jazz"],
  }));

  const logs = [
    ...diary(4, { artistGenres: ["jazz"], artistNames: ["A Jazz Act"], venueName: "SFJAZZ" }),
    ...diary(4, { artistGenres: ["punk"], artistNames: ["A Punk Act"], venueName: "Thee Parkside" }),
  ];

  const [punk] = scoreFinds([show({ showId: "punk-night", genres: ["punk"], venueName: "Bottom of the Hill", artistNames: ["Someone"] })], {
    logs,
    catalogGenres: jazzCity.map((entry) => entry.genres),
    today: "2026-08-27",
  });
  const [jazz] = scoreFinds([show({ showId: "jazz-night", genres: ["jazz"], venueName: "Bottom of the Hill", artistNames: ["Someone"] })], {
    logs,
    catalogGenres: jazzCity.map((entry) => entry.genres),
    today: "2026-08-27",
  });

  assert.ok(punk.score > jazz.score, `punk ${punk.score} should beat jazz ${jazz.score}`);
});

// --- ④ what it believes -----------------------------------------------------

test("no beliefs from a diary too thin to have any", () => {
  assert.deepEqual(narrateBeliefs(diary(LOW_SIGNAL_SHOWS - 1)), []);
});

test("every belief states the arithmetic that produced it", () => {
  const beliefs = narrateBeliefs(diary(12), []);
  assert.ok(beliefs.length >= 2 && beliefs.length <= 4);
  for (const belief of beliefs) {
    assert.ok(belief.statement.length > 0);
    assert.match(belief.basis, /\d/, `basis must carry a count: ${belief.basis}`);
    assert.ok(["strong", "forming"].includes(belief.strength));
  }
});

test("the weekday belief counts real weekdays", () => {
  // 2026-08-01, -08, -15, -22, -29 are all Saturdays.
  const saturdays = ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29"].map((date) =>
    log({ showDate: date }),
  );
  const others = [log({ showDate: "2026-07-06" }), log({ showDate: "2026-07-07" })];
  const beliefs = narrateBeliefs([...saturdays, ...others], []);
  const weekday = beliefs.find((belief) => belief.statement.includes("Saturday is your night"));
  assert.ok(weekday, JSON.stringify(beliefs, null, 2));
  assert.equal(weekday.basis, "5 of 7 logged shows fell on a Saturday");
  assert.equal(weekday.strength, "strong");
});

test("drift is only claimed when there are two halves to compare", () => {
  const older = Array.from({ length: 5 }, (_, index) =>
    log({ showDate: `2026-01-0${index + 1}`, artistGenres: ["folk"], artistNames: [`Folk ${index}`] }),
  );
  const recent = Array.from({ length: 5 }, (_, index) =>
    log({ showDate: `2026-07-0${index + 1}`, artistGenres: ["electronic"], artistNames: [`Electro ${index}`] }),
  );

  const beliefs = narrateBeliefs([...older, ...recent], []);
  assert.ok(beliefs.some((belief) => /moved toward electronic/.test(belief.statement)));

  // Four nights cannot show a drift, and saying so would be inventing one.
  const short = narrateBeliefs([...older.slice(0, 3), ...recent.slice(0, 3)], []);
  assert.ok(!short.some((belief) => /moved toward/.test(belief.statement)));
});

// --- ③ while you were away --------------------------------------------------

test("a refusal without a stated reason never ships", () => {
  const items = deriveActivity(
    [
      { clusterDate: "2026-06-27", status: "pending", confidence: 0.4, createdAt: 3 },
      {
        clusterDate: "2026-06-28",
        status: "pending",
        confidence: 0.4,
        createdAt: 2,
        evidence: [{ kind: "date", detail: "40 acts share one field and one date", delta: 0 }],
      },
    ],
    [],
    [],
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "refused");
  assert.equal(items[0].detail, "40 acts share one field and one date");
});

test("a pending reclaim reads as a decision you owe, in past tense", () => {
  const [item] = deriveActivity(
    [
      {
        clusterDate: "2026-06-27",
        showTitle: "Witch Whores of Satan",
        venueName: "Rickshaw Stop",
        photoCount: 9,
        confidence: 0.95,
        status: "pending",
        createdAt: 10,
      },
    ],
    [],
    [],
  );

  assert.equal(item.kind, "reclaimed");
  assert.equal(
    item.summary,
    "Rebuilt 2026-06-27 from 9 photos: Witch Whores of Satan at Rickshaw Stop, 95%",
  );
  assert.equal(item.detail, "Waiting on you in Decisions.");
});

test("squad plans belong to their members and nobody else", () => {
  const plan = {
    userIds: ["user-a", "user-b"],
    showTitle: "Jamie xx",
    showDate: "2026-09-12",
    createdAt: 20,
    transcript: [{ agent: "vee's agent", handle: "vee", message: "Booked. Two of us are in.", at: 20 }],
  };

  const mine = deriveActivity([], [plan], [], { userId: "user-a" });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, "squad");
  assert.match(mine[0].detail, /Booked\. Two of us are in\./);

  const theirs = deriveActivity([], [plan], [], { userId: "user-c" });
  assert.deepEqual(theirs, []);
});

test("newest first, capped at ten", () => {
  const candidates = Array.from({ length: 14 }, (_, index) => ({
    clusterDate: "2026-06-27",
    showTitle: `Night ${index}`,
    venueName: "A Room",
    photoCount: 3,
    confidence: 0.9,
    status: "pending",
    createdAt: index,
  }));

  const items = deriveActivity(candidates, [], []);
  assert.equal(items.length, 10);
  assert.deepEqual(
    items.map((item) => item.at),
    [13, 12, 11, 10, 9, 8, 7, 6, 5, 4],
  );
});

test("logs the agent rebuilt are activity; logs you wrote yourself are not", () => {
  const items = deriveActivity(
    [],
    [],
    [
      log({ source: "reclaim", showTitle: "Osees", createdAt: 5 }),
      log({ source: "live", showTitle: "Something you logged", createdAt: 6 }),
    ],
  );

  assert.equal(items.length, 1);
  assert.match(items[0].summary, /Added Osees/);
});

test("five cards for one artist is one recommendation, not five", () => {
  // Live catalog, San Francisco: Blood Orange plays the Warfield three nights
  // and the catalog holds each night twice — "Blood Orange at The Warfield"
  // and "Blood Orange (6 and Over)". The first run of this function against
  // real data filled the whole slate with that one act.
  const run = ["2026-09-09", "2026-09-10", "2026-09-11"].flatMap((date, index) => [
    show({ showId: `warfield-${index}-a`, title: "Blood Orange at The Warfield", date, venueName: "The Warfield", artistNames: ["Blood Orange"], genres: ["punk"] }),
    show({ showId: `warfield-${index}-b`, title: "Blood Orange (6 and Over)", date, venueName: "Warfield", artistNames: ["Blood Orange"], genres: ["punk"] }),
  ]);
  const other = show({ showId: "other", title: "Someone Else", date: "2026-09-20", venueName: "Rickshaw Stop", artistNames: ["Someone Else"], genres: ["punk"] });

  // A catalog where punk is rare, so the genre row carries weight at all —
  // in an all-punk catalog punk means nothing, which is the rarity model
  // working and a different test.
  const catalogGenres = [["punk"], ...Array.from({ length: 19 }, () => ["jazz"])];
  const finds = scoreFinds([...run, other], { logs: diary(8), today: "2026-08-27", catalogGenres });

  assert.equal(finds.filter((find) => /Blood Orange/.test(find.title)).length, 1);
  assert.ok(finds.some((find) => find.title === "Someone Else"));
  // The first night of a run is the one worth offering.
  assert.equal(finds.find((find) => /Blood Orange/.test(find.title)).date, "2026-09-09");
});

test("the bill never leaks into the contract", () => {
  const [find] = scoreFinds([show()], { logs: diary(8), today: "2026-08-27" });
  assert.deepEqual(
    Object.keys(find).sort(),
    ["city", "date", "evidence", "score", "showId", "title", "venueName"],
  );
});

// --- belief corrections ------------------------------------------------------

const BELIEF = {
  statement: "Saturday is your night",
  basis: "6 of 12 logged shows fell on a Saturday",
  strength: "forming",
};

test("a belief you called wrong does not come back next week", () => {
  const kept = applyBeliefFeedback(
    [BELIEF],
    [{ statement: "Saturday is your night", verdict: "wrong", basisAtTime: BELIEF.basis }],
  );
  assert.deepEqual(kept, []);
});

test("it comes back only when the evidence actually changed, and says so", () => {
  const grown = { ...BELIEF, basis: "9 of 20 logged shows fell on a Saturday" };
  const [returned] = applyBeliefFeedback(
    [grown],
    [{ statement: "Saturday is your night", verdict: "wrong", basisAtTime: BELIEF.basis }],
  );

  assert.ok(returned, "half again as much evidence brings it back");
  assert.equal(returned.basis, "9 of 20 logged shows fell on a Saturday — you told me this was wrong when it was 6");

  // One more night is not new evidence, it is the same claim repeated.
  const barely = { ...BELIEF, basis: "7 of 13 logged shows fell on a Saturday" };
  assert.deepEqual(
    applyBeliefFeedback([barely], [{ statement: "Saturday is your night", verdict: "wrong", basisAtTime: BELIEF.basis }]),
    [],
  );
});

test("agreeing with us pins a belief but does not make it stronger", () => {
  const others = [
    { statement: "You keep going back to The Chapel", basis: "5 nights there", strength: "strong" },
    { statement: "Punk is the thread through your diary", basis: "7 of 12 nights", strength: "strong" },
    { statement: "You only log the nights that were worth it", basis: "12 rated nights average 4.4★", strength: "strong" },
  ];

  const kept = applyBeliefFeedback(
    [...others, BELIEF],
    [{ statement: "Saturday is your night", verdict: "right", basisAtTime: BELIEF.basis }],
  );

  assert.equal(kept[0].statement, "Saturday is your night", "confirmed beliefs lead");
  // Strength is derived from counts. Someone agreeing with us is not more
  // nights in the diary.
  assert.equal(kept[0].strength, "forming");
  assert.match(kept[0].basis, /and you confirmed it$/);
});

test("a suppressed belief frees its slot", () => {
  const five = Array.from({ length: 5 }, (_, index) => ({
    statement: `Belief ${index}`,
    basis: `${index + 3} of 12 nights`,
    strength: "forming",
  }));

  const kept = applyBeliefFeedback(five, [
    { statement: "Belief 0", verdict: "wrong", basisAtTime: "3 of 12 nights" },
  ]);

  assert.equal(kept.length, 4);
  assert.ok(!kept.some((belief) => belief.statement === "Belief 0"));
});

test("corrections match on the statement, whatever its spacing or case", () => {
  const kept = applyBeliefFeedback(
    [BELIEF],
    [{ statement: "  saturday IS your   night ", verdict: "wrong", basisAtTime: BELIEF.basis }],
  );
  assert.deepEqual(kept, []);
});

test("a run with a different support act each night is still one act", () => {
  // The live catalog, San Francisco: Osees play The Chapel three nights and
  // every night exists twice with a different support list — "Osees, Traps
  // PS, Brigid Dawson" against "Osees, Brigid Dawson". Keying on the whole
  // bill made those different keys, and two cards reading "Osees at The
  // Chapel" landed next to each other in the live briefing.
  const chapel = [
    show({ showId: "a", title: "Osees at The Chapel", date: "2026-08-27", artistNames: ["Osees", "Traps PS", "Brigid Dawson"] }),
    show({ showId: "b", title: "Osees w/ Brigid Dawson", date: "2026-08-27", artistNames: ["Osees", "Brigid Dawson"] }),
    show({ showId: "c", title: "Osees at The Chapel", date: "2026-08-28", artistNames: ["Osees", "Traps PS", "Brigid Dawson", "Gumby's Junk"] }),
    show({ showId: "d", title: "Osees", date: "2026-08-28", artistNames: ["Osees"] }),
  ];

  const finds = scoreFinds(chapel, { logs: diary(8), today: "2026-08-27" });
  assert.equal(finds.length, 1);
  assert.equal(finds[0].date, "2026-08-27");
});

test("a festival with no named artists still dedupes on its name", () => {
  const portola = [
    show({ showId: "p1", title: "Portola", date: "2026-09-26", venueName: "Pier 80 Warehouse", artistNames: [] }),
    show({ showId: "p2", title: "Portola", date: "2026-09-27", venueName: "Pier 80 Warehouse", artistNames: [] }),
  ];

  const catalogGenres = [["punk"], ...Array.from({ length: 19 }, () => ["jazz"])];
  const finds = scoreFinds(portola, { logs: diary(8), today: "2026-08-27", catalogGenres });
  assert.equal(finds.length, 1);
  assert.equal(finds[0].date, "2026-09-26");
});
