"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CreditCard, MessagesSquare, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, EmptyLine, formatDate, SectionTitle } from "./shared";

// The accessibility criterion, made concrete: a human who owns no agent opens
// the app and reads exactly how the night got decided — who spoke, what they
// argued, who sat it out, and what actually settled. The transcript is the
// artefact, not the row.

function settlementCopy(plan: { settlement: string | null; paymentRef: string | null; amountCents: number | null }) {
  if (!plan.settlement) return null;
  const amount = plan.amountCents ? `$${(plan.amountCents / 100).toFixed(2)}` : null;
  if (plan.settlement === "aisa") {
    return `${amount ? `${amount} ` : ""}settled through AIsa as a real metered machine transaction (${plan.paymentRef}). The ticket purchase itself is simulated — no ticketing API here sells to agents.`;
  }
  return `${amount ? `${amount} ` : ""}simulated (${plan.paymentRef}) — no ticketing API here sells to agents, and saying so beats implying otherwise.`;
}

export function SquadPlanCard({
  userId,
  openShow,
}: {
  userId: Id<"users">;
  openShow: (showId: string) => void;
}) {
  const plan = useQuery(api.squad.latest, { userId });
  const [showTranscript, setShowTranscript] = useState(false);

  // Empty-room rule: no plan, no card. An agent has to have actually done
  // something before this claims it did.
  if (!plan) return null;

  const settlement = settlementCopy(plan);

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-[#FF7A50]" />
        <SectionTitle
          eyebrow={`Agreed by ${plan.attendees.length} agents`}
          title="Your agents planned a night"
        />
      </div>

      <div className="surface-settle mt-4 border border-[#2A2521] bg-[#1A1713] p-5">
        <button className="text-left" onClick={() => openShow(plan.showId)} type="button">
          <h3 className="font-display text-2xl">{plan.showTitle}</h3>
          <p className="mt-1 text-sm text-[#C9C1B4]">
            {formatDate(plan.showDate)}
            {plan.venueName ? ` · ${plan.venueName}` : ""}
          </p>
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {plan.attendees.map((person) => (
            <span className="flex items-center gap-2 text-sm" key={person.handle}>
              <Avatar color={person.avatarColor} name={person.handle} />
              @{person.handle}
            </span>
          ))}
        </div>

        {settlement && (
          <p className="mt-4 flex items-start gap-2 border-l-2 border-[#4EC98F] pl-3 text-xs leading-5 text-[#C9C1B4]">
            <CreditCard className="mt-0.5 h-3 w-3 shrink-0 text-[#4EC98F]" />
            {settlement}
          </p>
        )}

        <button
          aria-expanded={showTranscript}
          className="mt-5 flex items-center gap-2 text-xs font-black text-[#6FBCD3]"
          onClick={() => setShowTranscript((open) => !open)}
          type="button"
        >
          <MessagesSquare className="h-3 w-3" />
          {showTranscript ? "Hide" : "Read"} how they decided ({plan.transcript.length} messages)
        </button>

        {showTranscript && (
          <div className="surface-settle mt-4 divide-y divide-white/10 border-t border-white/10">
            {plan.transcript.length ? (
              plan.transcript.map((line, index) => (
                <p className="py-3 text-sm leading-6" key={`${line.at}-${index}`}>
                  <b className="text-[#FF7A50]">{line.agent}</b>
                  {line.handle && line.handle !== "-" && (
                    <span className="text-[#8A8177]"> for @{line.handle}</span>
                  )}
                  <span className="mt-1 block text-[#C9C1B4]">{line.message}</span>
                </p>
              ))
            ) : (
              <EmptyLine text="No transcript was recorded for this plan." />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
