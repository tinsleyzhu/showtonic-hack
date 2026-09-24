import assert from "node:assert/strict";
import test from "node:test";

import {
  dayBill,
  dayCity,
  dayVenue,
  festivalDisplayName,
  planFestivalDayCollapse,
} from "../convex/festivalDaysUtils.js";

// Fixtures speak the shape `festivalDays.festivalShows` emits: a plain show
// row with its venue coordinates resolved. Ids are synthetic but stable so
// plans can be compared byte for byte across runs.
let seq = 0;
function perSetRow(overrides = {}) {
  seq += 1;
  return {
    id: `shows:${String(seq).padStart(4, "0")}`,
    jambaseId: `jb:${String(seq).padStart(4, "0")}`,
    title: "An Opening Act",
    date: "2026-08-07",
    festivalId: "outside-lands-2026",
    isHeadliner: false,
    startTime: "13:00",
    artistNames: ["An Opening Act"],
    venueName: "Sutro Stage",
    city: "San Francisco",
    ...overrides,
  };
}

// A three-stage Outside Lands day: the headliner row leads, the geocoder has
// found two of the three stage venues, and one non-festival show shares the
// weekend — the show a festival collapse must never touch.
function outsideLandsFixture() {
  const fridayHeadliner = perSetRow({
    jambaseId: "jambase:4400",
    title: "Tyler, The Creator",
    artistNames: ["Tyler, The Creator"],
    isHeadliner: true,
    startTime: "20:30",
    venueName: "Lands End Stage",
    venueLatitude: 37.7712,
    venueLongitude: -122.4821,
  });
  const fridayRemi = perSetRow({
    jambaseId: "jambase:4401",
    title: "Remi Wolf",
    artistNames: ["Remi Wolf"],
    startTime: "17:00",
    venueName: "Sutro Stage",
  });
  const fridayPeggy = perSetRow({
    jambaseId: "jambase:4402",
    title: "JPEGMAFIA",
    artistNames: ["JPEGMAFIA"],
    startTime: "18:00",
    venueName: "Twin Peaks Stage",
    venueLatitude: 37.7539,
    venueLongitude: -122.4994,
  });
  const saturdayHeadliner = perSetRow({
    jambaseId: "jambase:4403",
    title: "Kendrick Lamar",
    artistNames: ["Kendrick Lamar"],
    date: "2026-08-08",
    isHeadliner: true,
    startTime: "20:30",
    venueName: "Lands End Stage",
    venueLatitude: 37.7712,
    venueLongitude: -122.4821,
  });
  const saturdayDoechii = perSetRow({
    jambaseId: "jambase:4404",
    title: "Doechii",
    artistNames: ["Doechii"],
    date: "2026-08-08",
    startTime: "16:00",
    venueName: "Sutro Stage",
  });
  const plainShow = {
    id: "shows:9999",
    jambaseId: "jambase:4410",
    title: "A Regular Tour Stop",
    date: "2026-08-08",
    festivalId: undefined, // not a festival row — a plain single-act show
    isHeadliner: true,
    startTime: "21:00",
    artistNames: ["A Regular Tour Stop"],
    venueName: "The Independent",
    city: "San Francisco",
  };
  const secondFestival = perSetRow({
    jambaseId: "jambase:4500",
    title: "Sabrina Carpenter",
    artistNames: ["Sabrina Carpenter"],
    date: "2026-04-11",
    festivalId: "coachella-2026",
    venueName: "Main Stage",
    city: "Indio",
    venueLatitude: 33.68,
    venueLongitude: -116.24,
  });

  return {
    rows: [
      fridayPeggy,
      plainShow,
      saturdayDoechii,
      fridayHeadliner,
      secondFestival,
      fridayRemi,
      saturdayHeadliner,
    ],
    festivalRows: [
      fridayHeadliner,
      fridayRemi,
      fridayPeggy,
      saturdayHeadliner,
      saturdayDoechii,
      secondFestival,
    ],
  };
}

function applyPlan(plan, rows, { demoteOnly, insertOnly } = {}) {
  // Simulates the action: day rows inserted through importUpcoming, per-set
  // rows demoted in place. `demoteOnly`/`insertOnly` simulate a crash between
  // the action's two write kinds. Returns the catalog the next run reads.
  const inserted = insertOnly
    ? []
    : plan.dayRows.map((event, index) => ({
        id: `shows:fest:${index + 1}`,
        jambaseId: event.jambaseId,
        title: event.title,
        date: event.date,
        festivalId: event.festivalId,
        isFestivalDay: true,
        isHeadliner: true,
        artistNames: event.artistNames,
        venueName: event.venueName,
        city: event.city,
      }));
  const demotedIds = new Set(demoteOnly ?? plan.demotions);
  return [
    ...inserted,
    ...rows.map((row) => (demotedIds.has(row.id) ? { ...row, nonMatchable: true } : row)),
  ];
}

test("a legacy festival collapses to one day row per date, titled <Festival> — <Weekday>", () => {
  const { rows, festivalRows } = outsideLandsFixture();
  const plan = planFestivalDayCollapse(rows);

  assert.equal(plan.festivalCount, 2); // Outside Lands + Coachella
  assert.equal(plan.days.length, 3); // OL Fri + OL Sat + Coachella
  assert.equal(plan.dayRows.length, 3); // one per date — Coachella's single set collapses too

  const friday = plan.dayRows.find((day) => day.date === "2026-08-07");
  assert.equal(friday.jambaseId, "fest:outside-lands-2026:2026-08-07");
  assert.equal(friday.title, "Outside Lands 2026 — Friday");
  assert.equal(friday.festivalId, "outside-lands-2026");
  assert.equal(friday.isFestivalDay, true);
  assert.equal(friday.isHeadliner, true);
  assert.equal(friday.venueName, "Lands End Stage");
  assert.equal(friday.city, "San Francisco");
  assert.equal(friday.latitude, 37.7712);
  assert.equal(friday.longitude, -122.4821);

  // The bill leads with the headliner, then sets by start time — one entry
  // per act on the bill, however many rows named it.
  assert.deepEqual(friday.artistNames, ["Tyler, The Creator", "Remi Wolf", "JPEGMAFIA"]);

  const saturday = plan.dayRows.find((day) => day.date === "2026-08-08");
  assert.equal(saturday.jambaseId, "fest:outside-lands-2026:2026-08-08");
  assert.equal(saturday.title, "Outside Lands 2026 — Saturday");
  assert.deepEqual(saturday.artistNames, ["Kendrick Lamar", "Doechii"]);

  // The demotion set: every per-set row of every collapsed date, nothing else.
  assert.deepEqual(
    [...plan.demotions].sort(),
    festivalRows.map((row) => row.id).sort(),
  );
  assert.ok(plan.days.every((day) => day.dayRowExisted === false));
  assert.deepEqual(
    plan.days.map((day) => day.demoted),
    [1, 3, 2], // Coachella, then OL Friday, OL Saturday — days report in (festival, date) order
  );
});

test("a second run plans nothing — the collapse is idempotent", () => {
  const { rows } = outsideLandsFixture();

  const firstRun = planFestivalDayCollapse(rows);
  assert.ok(firstRun.dayRows.length > 0 && firstRun.demotions.length > 0);

  const secondRun = planFestivalDayCollapse(applyPlan(firstRun, rows));
  assert.equal(secondRun.dayRows.length, 0);
  assert.equal(secondRun.demotions.length, 0);
  assert.equal(secondRun.festivalCount, 2);
  assert.ok(secondRun.days.every((day) => day.dayRowExisted === true));
  assert.ok(secondRun.days.every((day) => day.demoted === 0));
  const fridayReport = secondRun.days.find(
    (day) => day.festivalId === "outside-lands-2026" && day.date === "2026-08-07",
  );
  assert.equal(fridayReport.alreadyDemoted, 3);
});

test("a run interrupted between inserts and demotions repairs without double work", () => {
  const { rows, festivalRows } = outsideLandsFixture();
  const firstRun = planFestivalDayCollapse(rows);

  // The crash: day rows landed; exactly one demotion did before the process
  // died. The catalog now holds day rows, one demoted row, and the rest of
  // the sets still matchable.
  const postCrash = applyPlan(firstRun, rows, { demoteOnly: [festivalRows[0].id] });
  const reRun = planFestivalDayCollapse(postCrash);

  assert.equal(reRun.dayRows.length, 0); // day rows exist — never duplicated
  assert.equal(
    reRun.demotions.length,
    festivalRows.length - 1, // every remaining per-set row, once
  );
  assert.ok(!reRun.demotions.includes(festivalRows[0].id)); // not demoted twice
});

test("gap-agent day rows (gap:fest: keys, no flag) satisfy the day-row check", () => {
  const dayRow = {
    id: "shows:gap1",
    jambaseId: "gap:fest:coachella-2026:2026-04-11",
    title: "Coachella 2026 — Saturday",
    date: "2026-04-11",
    festivalId: "coachella-2026",
    isFestivalDay: undefined, // a pre-flag row — recognised by its key alone
    isHeadliner: true,
    artistNames: ["Sabrina Carpenter", "Karol G"],
    venueName: "Main Stage",
    city: "Indio",
  };
  const set1 = perSetRow({
    jambaseId: "jambase:4500",
    date: "2026-04-11",
    festivalId: "coachella-2026",
    venueName: "Outdoor Theatre",
  });
  const set2 = perSetRow({
    jambaseId: "jambase:4501",
    title: "Another Act",
    date: "2026-04-11",
    festivalId: "coachella-2026",
    venueName: "Outdoor Theatre",
  });

  const plan = planFestivalDayCollapse([dayRow, set1, set2]);
  assert.deepEqual(plan.dayRows, []); // the day already exists — no duplicate
  assert.deepEqual([...plan.demotions].sort(), [set1.id, set2.id].sort());
  assert.equal(plan.days.length, 1);
  assert.equal(plan.days[0].dayRowExisted, true);
});

test("an isFestivalDay-flagged day row satisfies the day-row check without the key prefix", () => {
  const dayRow = perSetRow({
    jambaseId: "jambase:4600",
    title: "Outside Lands 2026 — Friday",
    isFestivalDay: true,
    isHeadliner: true,
    artistNames: ["Tyler, The Creator"],
  });
  const plan = planFestivalDayCollapse([dayRow, perSetRow()]);
  assert.equal(plan.dayRows.length, 0);
  assert.equal(plan.demotions.length, 1);
});

test("only the requested festival collapses when a festivalId filter is given", () => {
  const { rows } = outsideLandsFixture();
  const plan = planFestivalDayCollapse(rows, { festivalId: "coachella-2026" });
  assert.equal(plan.festivalCount, 1);
  assert.equal(plan.dayRows.length, 1);
  assert.equal(plan.dayRows[0].festivalId, "coachella-2026");
  assert.equal(plan.dayRows[0].title, "Coachella 2026 — Saturday");
  assert.equal(plan.demotions.length, 1);
});

test("the day bill deduplicates acts and tolerates input in any order", () => {
  const rows = [
    perSetRow({ title: "Doechii", artistNames: ["Doechii", "Tyler, The Creator"] }),
    perSetRow({ title: "Tyler, The Creator", artistNames: ["tyler, the creator"] }),
  ];
  const forward = planFestivalDayCollapse(rows);
  const shuffled = planFestivalDayCollapse([rows[1], rows[0]]);
  assert.equal(forward.dayRows[0].artistNames.length, 2); // one act, one spelling, one entry
  assert.deepEqual(forward.dayRows, shuffled.dayRows);
  assert.deepEqual(forward.demotions, shuffled.demotions);
});

test("the day venue is the most-named stage; ties prefer located venues, then alphabetical", () => {
  const untied = [
    perSetRow({ venueName: "Sutro Stage" }),
    perSetRow({ venueName: "Sutro Stage" }),
    perSetRow({ venueName: "Lands End Stage" }),
  ];
  assert.equal(dayVenue(untied).venueName, "Sutro Stage");

  // 1–1 tie: the venue with coordinates wins, whatever its name.
  const tieLocated = [
    perSetRow({ venueName: "Twin Peaks Stage" }), // no coords on file
    perSetRow({ venueName: "Lands End Stage", venueLatitude: 37.7712, venueLongitude: -122.4821 }),
  ];
  assert.equal(dayVenue(tieLocated).venueName, "Lands End Stage");
  assert.equal(dayVenue(tieLocated).latitude, 37.7712);

  // 1–1 tie, neither located: alphabetical, independent of row order.
  const tieBare = [
    perSetRow({ venueName: "Twin Peaks Stage" }),
    perSetRow({ venueName: "Lands End Stage" }),
  ];
  assert.equal(dayVenue(tieBare).venueName, "Lands End Stage");
  assert.deepEqual(dayVenue([]), null);
});

test("the day city comes from the winning venue's rows, then from any row — never invented", () => {
  const rows = [
    perSetRow({ venueName: "Lands End Stage", city: "" }),
    perSetRow({ venueName: "Lands End Stage" }),
    perSetRow({ venueName: "Sutro Stage", city: "San Francisco" }),
  ];
  // The winning venue's rows say nothing, so the fallback rides through.
  assert.equal(dayCity(rows, "Lands End Stage"), "San Francisco");
  // The winning venue's own city beats the fallback.
  assert.equal(dayCity([rows[1], rows[2]], "Sutro Stage"), "San Francisco");
  assert.equal(dayCity([rows[0]], "Lands End Stage"), "");
});

test("dayBill flattens co-billed rows and dedupes case-insensitively", () => {
  const rows = [
    perSetRow({ artistNames: ["Tyler, The Creator"] }),
    perSetRow({ title: "Doechii", artistNames: ["Doechii", "tyler, the creator"] }),
    perSetRow({ title: "  Remi Wolf  ", artistNames: ["  Remi Wolf  ", ""] }),
  ];
  assert.deepEqual(dayBill(rows), ["Tyler, The Creator", "Doechii", "Remi Wolf"]);
});

test("festivalDisplayName speaks the slug", () => {
  assert.equal(festivalDisplayName("outside-lands-2026"), "Outside Lands 2026");
  assert.equal(festivalDisplayName("lollapalooza-2025"), "Lollapalooza 2025");
  assert.equal(festivalDisplayName("coachella"), "Coachella");
  assert.equal(festivalDisplayName(""), "");
  assert.equal(festivalDisplayName(undefined), "");
});

test("rows without a festivalId are invisible to the planner", () => {
  const plan = planFestivalDayCollapse([
    { id: "shows:1", jambaseId: "jambase:1", title: "A Show", date: "2026-08-07" },
  ]);
  assert.deepEqual(plan, { dayRows: [], demotions: [], days: [], festivalCount: 0 });
  assert.deepEqual(planFestivalDayCollapse([]), {
    dayRows: [],
    demotions: [],
    days: [],
    festivalCount: 0,
  });
});
