"use client";

// STUB — L5 replaces this file wholesale. It exists so BriefingView can import
// it from hour zero. Contract: renders `items` newest-first, refusals styled as
// integrity (the agent explaining its restraint), not as failure.

import type { AgentActivityItem } from "../briefing";

export function AgentActivity({ items }: { items: AgentActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="What your agent did while you were away">
      <h2 className="text-xs uppercase tracking-[0.28em] text-[#FF7A50]">While you were away</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li className="border border-[#2A2521] px-3 py-2 text-sm" key={item.at}>
            {item.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
