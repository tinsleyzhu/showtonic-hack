"use client";

import { useEffect, useState } from "react";
import { BookOpen, Images, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { AgentActivityItem } from "../briefing";
import {
  absoluteTime,
  describeActivityKind,
  describeElapsed,
  orderActivity,
  refusalReason,
} from "../activityFeed.js";
import { SectionTitle } from "./shared";

// "While you were away" — section ③ of the briefing.
//
// This is the section that decides whether the concierge reads as a colleague
// or as a cron job, and the deciding rows are the REFUSALS.
//
// A feed of things that went well is marketing. A feed that also says "I could
// have guessed here and I didn't, and here is exactly why" is the only evidence
// a person has that the agent's confident claims mean anything. So a refusal is
// not a muted failure row: it gets the raised surface, the blue rule this app
// already uses for reasoning, and — the part that matters — its reason is
// ALWAYS visible. Restraint behind a disclosure triangle is restraint nobody
// reads.
//
// Nothing here is red. Red says "something broke, go fix it." Nothing broke:
// the agent did its job, and part of its job is stopping.

const KIND_ICONS: Record<string, typeof Search> = {
  reclaimed: Images,
  searched: Search,
  refused: ShieldCheck,
  squad: Users,
  recap: BookOpen,
};

function ActivityRow({ item, now }: { item: AgentActivityItem; now: number | null }) {
  const [open, setOpen] = useState(false);
  const kind = describeActivityKind(item.kind);
  const Icon = KIND_ICONS[item.kind] ?? Sparkles;
  const rowId = `activity-${item.at}-${item.kind}`;
  const stamp = absoluteTime(item.at);
  // Relative time only once the client has a clock. Rendering `Date.now()`
  // during SSR and again on hydration gives two different strings for one row,
  // which React reports as a mismatch and a reader sees as flickering times.
  const elapsed = now === null ? stamp : describeElapsed(item.at, now);

  const when = (
    <time className="ml-auto shrink-0 text-xs text-[#8A8177]" dateTime={new Date(item.at).toISOString()}>
      {elapsed}
      <span className="sr-only"> ({stamp})</span>
    </time>
  );

  if (kind.restraint) {
    return (
      <li className="border border-[#2A2521] border-l-2 border-l-[#6FBCD3] bg-[#1A1713] p-4">
        <p className="flex items-center gap-2">
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-[#6FBCD3]" />
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#6FBCD3]">{kind.label}</span>
          {when}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#F5F1E8]">{item.summary}</p>
        {/* The reason is the row. It is never behind a click. */}
        <p className="font-display mt-2 text-sm leading-6 text-[#C9C1B4]">{refusalReason(item)}</p>
      </li>
    );
  }

  return (
    <li className="border border-[#2A2521] bg-[#141210] p-4">
      <p className="flex items-center gap-2">
        <Icon aria-hidden className="h-4 w-4 shrink-0 text-[#8A8177]" />
        <span className="text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">{kind.label}</span>
        {when}
      </p>
      <p className="mt-2 text-sm leading-6 text-[#C9C1B4]">{item.summary}</p>
      {item.detail && (
        <>
          <button
            aria-controls={rowId}
            aria-expanded={open}
            className="mt-2 text-xs font-black text-[#6FBCD3]"
            onClick={() => setOpen(!open)}
            type="button"
          >
            {open ? "Hide" : "What happened"}
          </button>
          {open && (
            <p className="surface-settle mt-2 border-t border-white/10 pt-2 text-sm leading-6 text-[#8A8177]" id={rowId}>
              {item.detail}
            </p>
          )}
        </>
      )}
    </li>
  );
}

export function AgentActivity({ items }: { items: AgentActivityItem[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // On a frame rather than synchronously: setting state in the effect body
    // cascades an extra render. The interval keeps "12m ago" honest while the
    // briefing sits open on a second monitor, which is where it will sit.
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(tick);
    };
  }, []);

  const ordered = orderActivity(items);
  // Empty-room rule: a fresh account has no agent and no history, and this
  // section never claims otherwise.
  if (ordered.length === 0) return null;

  const held = ordered.filter((item) => describeActivityKind(item.kind).restraint).length;

  return (
    <section aria-label="While you were away" className="surface-settle mt-10 border-t border-white/10 pt-8">
      <SectionTitle
        eyebrow={`${ordered.length} ${ordered.length === 1 ? "thing" : "things"}, newest first`}
        title="While you were away"
      />
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#8A8177]">
        {held > 0
          ? "Everything I did on my own, including the parts where I stopped. I would rather leave a night blank than fill it with a guess."
          : "Everything I did on my own. None of it touched your diary without you."}
      </p>
      <ol className="mt-5 space-y-3">
        {ordered.map((item) => (
          <ActivityRow item={item} key={`${item.at}-${item.kind}-${item.summary}`} now={now} />
        ))}
      </ol>
    </section>
  );
}
