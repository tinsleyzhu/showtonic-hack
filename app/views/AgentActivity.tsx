"use client";

import { Bot, CircleSlash, Images, Search, Sparkles, Users } from "lucide-react";
import { timeAgo } from "../briefingSurface.js";
import type { AgentActivityItem } from "../briefing";

// STUB — L5 replaces this file. Its props are frozen: `items` is the contract's
// AgentActivityItem[], newest first, already capped by the query.
//
// What is deliberately settled here rather than left to the replacement, because
// it is the section's whole argument: a REFUSAL is rendered as integrity, not as
// a failure. An agent that declines to guess your set at a 40-act festival and
// says why is doing the job correctly, and the surface has to read that way — so
// refusals keep the same weight as any other row and their `detail` is never
// collapsed, because for a refusal the reason IS the content.

const ACTIVITY_ICONS: Record<AgentActivityItem["kind"], typeof Bot> = {
  reclaimed: Images,
  searched: Search,
  refused: CircleSlash,
  squad: Users,
  recap: Sparkles,
};

export function AgentActivity({ items, now }: { items: AgentActivityItem[]; now: number }) {
  // Empty-room rule: no work done, no feed. Never claim an agent has been busy.
  if (!items.length) return null;

  return (
    <ol className="mt-5 space-y-px">
      {items.map((item) => {
        const Icon = ACTIVITY_ICONS[item.kind] ?? Bot;
        const refused = item.kind === "refused";
        return (
          <li
            className="flex items-start gap-3 border border-[#2A2521] bg-[#141210] p-4"
            key={`${item.at}-${item.summary}`}
          >
            <Icon
              aria-hidden
              className={`mt-px h-4 w-4 shrink-0 ${refused ? "text-[#6FBCD3]" : "text-[#8A8177]"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6">{item.summary}</p>
              {item.detail && (
                <p className={`mt-1 text-xs leading-5 ${refused ? "text-[#6FBCD3]" : "text-[#8A8177]"}`}>
                  {refused && <span className="font-black">Why: </span>}
                  {item.detail}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#8A8177]">
              {timeAgo(item.at, now)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
