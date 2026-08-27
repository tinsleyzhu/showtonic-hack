import assert from "node:assert/strict";
import test from "node:test";

import { narrateBeliefs, scoreFinds } from "../convex/briefingLogic.js";
import { NEW_YORK_CATALOG, NEW_YORK_DIARY } from "./briefingFixturesNewYork.mjs";

// Section ② against the OTHER city's catalog.
//
// Every briefing fixture until now was San Francisco. New York is a different
// adversary: 3,461 upcoming shows against SF's 1,439, saturated with jazz,
// and thick with residencies that appear four times a night across the same
// rooms. A slate that behaves in San Francisco can still be five cards of
// Arturo Sandoval here.

const TODAY = "2026-08-27";

test("a residency-thick catalog still yields five different acts", () => {
  // The fixture holds Arturo Sandoval four times on 2026-08-27 alone, across
  // "The Blue Note" and "Blue Note Jazz Club".
  const finds = scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY, today: TODAY });

  assert.equal(finds.length, 5);
  const leadActs = finds.map((find) => find.title.split(" at ")[0]);
  assert.equal(new Set(leadActs).size, 5, `repeated acts: ${leadActs.join(", ")}`);
});

test("nothing outside the member's city reaches the slate", () => {
  const finds = scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY, today: TODAY });
  for (const find of finds) assert.equal(find.city, "New York");
});

test("every New York card is explained, and the explanation adds up", () => {
  const finds = scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY, today: TODAY });
  for (const find of finds) {
    assert.ok(find.evidence.length > 0, `${find.title} shipped unexplained`);
    const summed = find.evidence.reduce((total, row) => total + row.weight, 0);
    assert.ok(Math.abs(summed - find.score) < 0.02, `${find.title}: ${summed} vs ${find.score}`);
  }
});

test("in a jazz city, 'you like jazz' is worth almost nothing", () => {
  // Nine of this member's ten nights are jazz, and the row still earns about
  // a twentieth of the card — because nearly every bill in the New York
  // catalog is jazz too, so the fact separates nobody. This is the rarity
  // weighting doing its job on a real catalog rather than a constructed one.
  const finds = scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY, today: TODAY });
  const jazzRows = finds
    .flatMap((find) => find.evidence)
    .filter((row) => row.kind === "genre-fit" && /^jazz\b/.test(row.detail));

  assert.ok(jazzRows.length > 0, "the jazz row should still appear — it is true, just cheap");
  for (const row of jazzRows) assert.ok(row.weight <= 0.1, `jazz earned ${row.weight}`);

  // The same diary, a catalog where jazz is rare: now it is the strongest
  // thing we can say.
  const rareJazzCatalog = NEW_YORK_CATALOG.map((show, index) => ({
    ...show,
    genres: index === 0 ? show.genres : ["rock"],
  }));
  const rare = scoreFinds(rareJazzCatalog, { logs: NEW_YORK_DIARY, today: TODAY });
  const rareJazzRow = rare
    .flatMap((find) => find.evidence)
    .find((row) => row.kind === "genre-fit" && /^jazz\b/.test(row.detail));
  assert.ok(rareJazzRow, "a rare shared genre must survive into the evidence");
  assert.ok(
    rareJazzRow.weight > jazzRows[0].weight,
    `rare jazz ${rareJazzRow.weight} should beat ubiquitous jazz ${jazzRows[0].weight}`,
  );
});

test("the room they keep going back to leads the slate", () => {
  const [top] = scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY, today: TODAY });
  assert.equal(top.venueName, "Smoke Jazz & Supper Club");
  assert.ok(
    top.evidence.some((row) => row.kind === "venue-history" && /rated 4★ or higher/.test(row.detail)),
  );
});

test("beliefs read as counted facts against the real catalog too", () => {
  const beliefs = narrateBeliefs(NEW_YORK_DIARY, NEW_YORK_CATALOG);
  assert.ok(beliefs.length >= 2 && beliefs.length <= 4);
  for (const belief of beliefs) assert.match(belief.basis, /\d/);
  assert.ok(
    beliefs.some((belief) => /Smoke Jazz & Supper Club/.test(belief.statement)),
    "four nights in one room is the clearest thing about this diary",
  );
});

test("a New York member with a thin diary is told nothing, same as in San Francisco", () => {
  assert.deepEqual(scoreFinds(NEW_YORK_CATALOG, { logs: NEW_YORK_DIARY.slice(0, 4), today: TODAY }), []);
  assert.deepEqual(narrateBeliefs(NEW_YORK_DIARY.slice(0, 4), NEW_YORK_CATALOG), []);
});
