// The activity feed's decisions, kept pure so they are testable without a
// browser and without a clock.
//
// `AgentActivityItem` is coordinator-owned (app/briefing.ts). Everything here
// reads it and never widens it.

// How each kind of work introduces itself. The chip is the agent's own word for
// what it did, in the same first-person register as the summaries.
//
// `restraint: true` is the one that matters. A refusal is not a failed action —
// it is the agent declining to guess, which is the single most trust-building
// thing it does all day. It gets its own tone so it can never be styled as an
// error.
const ACTIVITY_KINDS = {
  reclaimed: { label: "Rebuilt", restraint: false },
  searched: { label: "Searched", restraint: false },
  refused: { label: "Held back", restraint: true },
  squad: { label: "Convened", restraint: false },
  recap: { label: "Recapped", restraint: false },
};

// An unknown kind must render as ordinary work rather than crash or, worse,
// silently vanish: this feed is derived server-side and a new kind will reach
// this component before it reaches this file.
const UNKNOWN_KIND = { label: "Worked", restraint: false };

function describeActivityKind(kind) {
  return ACTIVITY_KINDS[kind] ?? UNKNOWN_KIND;
}

// Newest first, and enforced here rather than trusted from the caller. The
// contract promises the order, but the feed is assembled from three different
// tables and a fixture — one of them getting it wrong should not put last
// week's work above this morning's.
//
// Ties keep their original order, so a batch written in one pass reads in the
// order it happened.
function orderActivity(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.at === "number" && Number.isFinite(item.at))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.at - a.item.at || a.index - b.index)
    .map((entry) => entry.item);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "4h ago" — the concierge's own sense of time. Anything older than a week gets
// a date instead, because "23d ago" is arithmetic homework.
//
// `now` is a parameter and not `Date.now()` so this is testable and so the
// component renders the same string on the server and the client.
function describeElapsed(at, now) {
  const elapsed = now - at;
  if (!Number.isFinite(elapsed)) return "";
  // A clock that disagrees with the server by a few seconds should not produce
  // "in 3 seconds" on a feed of things that have already happened.
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(at));
}

// The full timestamp, for the screen reader and the tooltip. A relative time
// alone is unverifiable, and this feed's whole claim is that it is checkable.
function absoluteTime(at) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

// A refusal without its reason is just a shrug. The contract says WHY is
// mandatory for `refused`; if one arrives without it, say so plainly instead of
// rendering an empty box that reads like a bug.
function refusalReason(item) {
  const detail = typeof item?.detail === "string" ? item.detail.trim() : "";
  return detail || "No reason was recorded for this one.";
}

export {
  ACTIVITY_KINDS,
  absoluteTime,
  describeActivityKind,
  describeElapsed,
  orderActivity,
  refusalReason,
};
