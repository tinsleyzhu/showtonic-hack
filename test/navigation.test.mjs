import assert from "node:assert/strict";
import test from "node:test";

import { activeTab, tabDestination, visibleTabs } from "../app/navigation.js";

test("core tabs render without any social flags, and Briefing leads", () => {
  const tabs = visibleTabs().map((item) => item.tab);
  assert.deepEqual(tabs, ["briefing", "discover", "diary", "log"]);
});

test("Discover is demoted, not deleted", () => {
  // The concierge redesign moves the agent's work to the front. It does not get
  // to take browsing away: finding one specific night is still a real task and
  // the catalog is the only surface that does it.
  const discover = visibleTabs().find((item) => item.tab === "discover");
  assert.ok(discover, "the browse tab must survive the redesign");
  assert.equal(discover.view, "discover");
  assert.equal(discover.label, "Browse");
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
    ["briefing", "discover", "diary", "log", "activity"],
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

test("an unknown tab falls back to Briefing, because Briefing is home now", () => {
  assert.deepEqual(tabDestination("briefing"), { view: "briefing", catalogMode: "upcoming" });
  assert.deepEqual(tabDestination("unknown"), { view: "briefing", catalogMode: "upcoming" });
  assert.equal(activeTab("briefing"), "briefing");
  assert.equal(activeTab("anything-unrouted"), "briefing");
});

test("a show opened from the Briefing returns you to the Briefing", () => {
  assert.equal(activeTab("show", { cameFrom: "briefing" }), "briefing");
});

test("log tab lands on discover in past mode; others reset to upcoming", () => {
  assert.deepEqual(tabDestination("log"), { view: "discover", catalogMode: "past" });
  assert.deepEqual(tabDestination("diary"), { view: "profile", catalogMode: "upcoming" });
  assert.deepEqual(tabDestination("discover"), { view: "discover", catalogMode: "upcoming" });
});
