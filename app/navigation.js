// Bottom tab bar model: Briefing · Discover · Diary · Log · Activity. Pure
// logic so it stays testable under node:test.
//
// Briefing is home. The app used to open on the catalog, which framed it as a
// listings site that happened to own an agent; it now opens on the agent's work
// and the catalog is one tap away. Discover is DEMOTED, NOT DELETED — browsing
// is still how you find a specific night, and the concierge redesign does not
// get to take that away.
//
// Web mapping notes:
// - "Diary" opens the combined diary+profile view (exports 12/19 embed the
//   profile header inside DIARY), so a separate Profile tab would duplicate it —
//   the profile slot is dropped on web.
// - "Log" is an intent, not a view: it lands on Discover in past-catalog mode so
//   the user can find the show they attended.
// - "Activity" is v1.5 (empty-room rule): hidden unless the flag is on AND the
//   surface has content to show.

/** @typedef {{ tab: string; label: string; view: string; requiresSocial?: boolean }} TabItem */

const TABS = [
  { tab: "briefing", label: "Briefing", view: "briefing" },
  { tab: "discover", label: "Browse", view: "discover" },
  { tab: "diary", label: "Diary", view: "profile" },
  { tab: "log", label: "Log", view: "discover" },
  { tab: "activity", label: "Activity", view: "leaderboard", requiresSocial: true },
];

/**
 * Tabs to render, applying the v1.5 empty-room rule to social surfaces.
 * @param {{ socialEnabled?: boolean; hasSocialContent?: boolean }} [flags]
 * @returns {TabItem[]}
 */
export function visibleTabs(flags = {}) {
  return TABS.filter(
    (item) => !item.requiresSocial || (flags.socialEnabled && flags.hasSocialContent),
  );
}

/**
 * Resolve which tab is highlighted for the current view + catalog mode.
 * Detail views (show/artist/venue) highlight the tab they were reached from.
 * @param {string} view
 * @param {{ catalogMode?: string; cameFrom?: string }} [context]
 * @returns {string}
 */
export function activeTab(view, context = {}) {
  if (view === "briefing") return "briefing";
  if (view === "discover") return context.catalogMode === "past" ? "log" : "discover";
  if (view === "profile") return "diary";
  if (view === "leaderboard" || view === "tasteMatch") return "activity";
  if (view === "show" || view === "artist" || view === "venue") {
    return context.cameFrom && ["briefing", "discover", "diary", "log", "activity"].includes(context.cameFrom)
      ? context.cameFrom
      : "discover";
  }
  return "briefing";
}

/**
 * The navigation effect of tapping a tab.
 * @param {string} tab
 * @returns {{ view: string; catalogMode: "upcoming" | "past" }}
 */
export function tabDestination(tab) {
  const item = TABS.find((entry) => entry.tab === tab) ?? TABS[0];
  return { view: item.view, catalogMode: tab === "log" ? "past" : "upcoming" };
}
