import assert from "node:assert/strict";
import test from "node:test";

import { activeTab, tabDestination, visibleTabs } from "../app/navigation.js";

test("core tabs render without any social flags", () => {
  const tabs = visibleTabs().map((item) => item.tab);
  assert.deepEqual(tabs, ["discover", "diary", "log"]);
});

test("activity tab needs both the v1.5 flag and real content (empty-room rule)", () => {
  assert.equal(
    visibleTabs({ socialEnabled: true, hasSocialContent: false }).some(
      (item) => item.tab === "activity",
    ),
    false,
  );
  assert.equal(
    visibleTabs({ socialEnabled: false, hasSocialContent: true }).some(
      (item) => item.tab === "activity",
    ),
    false,
  );
  assert.deepEqual(
    visibleTabs({ socialEnabled: true, hasSocialContent: true }).map((item) => item.tab),
    ["discover", "diary", "log", "activity"],
  );
});

test("discover view highlights the log tab in past-catalog mode", () => {
  assert.equal(activeTab("discover", { catalogMode: "upcoming" }), "discover");
  assert.equal(activeTab("discover", { catalogMode: "past" }), "log");
  assert.equal(activeTab("discover"), "discover");
});

test("diary and activity views map to their tabs", () => {
  assert.equal(activeTab("profile"), "diary");
  assert.equal(activeTab("leaderboard"), "activity");
  assert.equal(activeTab("tasteMatch"), "activity");
});

test("detail views inherit the tab they were reached from", () => {
  assert.equal(activeTab("show", { cameFrom: "diary" }), "diary");
  assert.equal(activeTab("artist", { cameFrom: "log" }), "log");
  assert.equal(activeTab("venue", {}), "discover");
  assert.equal(activeTab("show", { cameFrom: "bogus" }), "discover");
});

test("log tab lands on discover in past mode; others reset to upcoming", () => {
  assert.deepEqual(tabDestination("log"), { view: "discover", catalogMode: "past" });
  assert.deepEqual(tabDestination("diary"), { view: "profile", catalogMode: "upcoming" });
  assert.deepEqual(tabDestination("discover"), { view: "discover", catalogMode: "upcoming" });
  assert.deepEqual(tabDestination("unknown"), { view: "discover", catalogMode: "upcoming" });
});
