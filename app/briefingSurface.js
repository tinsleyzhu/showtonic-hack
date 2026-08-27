// The Briefing's decision rules, pulled out of the component so they can be
// proved rather than eyeballed.
//
// Two of these are load-bearing promises the product makes out loud, and a
// component is the wrong place to keep a promise you cannot test:
//
//   · "No evidence, no card" (CONCIERGE.md). A fit score with nothing behind it
//     is exactly the unfalsifiable number this surface exists to refuse.
//   · The empty-room rule. A fresh account must never be shown headings that
//     imply an agent has been working when none has.

/**
 * Finds worth rendering: evidence-backed, and not dismissed this session.
 * @param {readonly {showId: string, evidence?: readonly unknown[]}[]} finds
 * @param {readonly string[]} [dismissed]
 */
export function visibleFinds(finds, dismissed = []) {
  const gone = new Set(dismissed);
  return (finds ?? []).filter(
    (find) => (find?.evidence?.length ?? 0) > 0 && !gone.has(find.showId),
  );
}

/**
 * True when the agent has genuinely nothing to report and the page should say
 * so once, honestly, instead of rendering four empty sections.
 *
 * Note it asks about VISIBLE finds, not raw ones: a briefing whose only find
 * has no evidence is an empty briefing, because that find will never render.
 * @param {{decisionsOwed?: number, finds?: readonly unknown[], beliefs?: readonly unknown[], activity?: readonly unknown[]}} briefing
 * @param {readonly string[]} [dismissed]
 */
export function briefingIsEmpty(briefing, dismissed = []) {
  if (!briefing) return true;
  return (
    (briefing.decisionsOwed ?? 0) === 0 &&
    visibleFinds(briefing.finds ?? [], dismissed).length === 0 &&
    (briefing.beliefs?.length ?? 0) === 0 &&
    (briefing.activity?.length ?? 0) === 0
  );
}

/**
 * Relative time for the activity feed. Takes `now` rather than reading the
 * clock so the server render and the client render agree — a mismatch here
 * hydrates as a React error on the home screen.
 * @param {number} at epoch ms
 * @param {number} now epoch ms
 */
export function timeAgo(at, now) {
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
