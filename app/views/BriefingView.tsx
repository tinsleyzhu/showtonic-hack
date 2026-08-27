"use client";

import { useState } from "react";
import { Bot, Clock, MapPin, Sparkles, UserCheck, Users, X } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { BRIEFING_FIXTURE, type AgentFind, type Briefing, type BriefingEvidence } from "../briefing";
import { briefingIsEmpty, visibleFinds } from "../briefingSurface.js";
import { PendingCandidates } from "./PendingCandidates";
import { SquadPlanCard } from "./SquadPlan";
import { AgentActivity } from "./AgentActivity";
import { EmptyLine, formatDate, LiveMessage, SectionTitle } from "./shared";

// The Briefing — the home surface.
//
// The app used to open on a catalog with agent features bolted to it. It now
// opens on the agent's work, in one order, and the order is the argument:
//
//   ① a decision you owe          — the agent is blocked on YOU
//   ② what it found               — it worked while you were gone
//   ③ what it did                 — including what it refused to do
//   ④ what it believes            — and the basis, so you can disagree
//
// A decision you owe outranks a summary of what you have already done. That is
// the same rule that put the pending queue above the recap on Profile, applied
// to the whole home screen.
//
// Every section obeys the empty-room rule independently, and the page as a
// whole obeys it too: a fresh account is not shown four empty headings implying
// an agent has been busy. It is shown one honest line about what has to happen
// first.

const EVIDENCE_ICONS: Record<BriefingEvidence["kind"], typeof MapPin> = {
  "venue-history": MapPin,
  "artist-overlap": Users,
  "genre-fit": Sparkles,
  "friend-going": UserCheck,
  recency: Clock,
};

function EvidenceRow({ kind, detail, weight }: BriefingEvidence) {
  const Icon = EVIDENCE_ICONS[kind] ?? Sparkles;
  return (
    <p className="flex items-start gap-3 py-2 text-xs">
      <Icon aria-hidden className="mt-px h-4 w-4 shrink-0 text-[#4EC98F]" />
      <span className="min-w-0 flex-1 text-[#8A8177]">{detail}</span>
      <span className="shrink-0 font-black text-[#4EC98F]">{Math.round(weight * 100)}%</span>
    </p>
  );
}

function FindCard({
  find,
  onYes,
  onNo,
  openShow,
}: {
  find: AgentFind;
  onYes: (find: AgentFind) => void;
  onNo: (find: AgentFind) => void;
  openShow: (showId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function yes() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setStatus("Saving…");
    try {
      await onYes(find);
      setStatus("On your watchlist.");
    } catch (error) {
      // The lane rule: a control that fails must say so. Silence here would
      // read as "saved" and the member would find out at the door.
      setFailed(true);
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "That did not save. The show is still here — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="surface-settle border border-[#2A2521] bg-[#141210]">
      <div className="flex items-start gap-3 p-4">
        {find.image ? (
          <img alt="" className="h-16 w-12 shrink-0 object-cover" src={find.image} />
        ) : (
          <span aria-hidden className="h-16 w-12 shrink-0 bg-[#1A1713]" />
        )}
        <div className="min-w-0 flex-1">
          <b className="block truncate">{find.title}</b>
          <p className="mt-1 truncate text-xs text-[#8A8177]">
            {formatDate(find.date)} · {find.venueName}
          </p>
          <p className="mt-1 truncate text-xs text-[#8A8177]">{find.city}</p>
        </div>
        <span className="shrink-0 text-xs font-black text-[#4EC98F]">
          {Math.round(find.score * 100)}% fit
        </span>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <button
          aria-expanded={open}
          className="text-xs font-black text-[#6FBCD3]"
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open ? "Hide" : "Why"} ({find.evidence.length})
        </button>
        {open && (
          <div className="surface-settle mt-2 divide-y divide-white/10 border-t border-white/10 pt-1">
            {find.evidence.map((row) => (
              <EvidenceRow detail={row.detail} key={row.kind + row.detail} kind={row.kind} weight={row.weight} />
            ))}
          </div>
        )}
      </div>

      {status && (
        <div className="border-t border-white/10 px-4 py-3">
          <LiveMessage tone={failed ? "error" : "info"}>{status}</LiveMessage>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/10 p-4">
        <button
          className="flex-1 bg-[#FF7A50] px-4 py-3 text-sm font-black text-black disabled:opacity-60"
          disabled={busy}
          onClick={() => void yes()}
          type="button"
        >
          {busy ? "Saving…" : "Yes, watch this"}
        </button>
        <button
          aria-label={`Dismiss ${find.title}`}
          className="flex items-center gap-1 border border-[#2A2521] px-4 py-3 text-sm font-black text-[#8A8177] disabled:opacity-60"
          disabled={busy}
          onClick={() => onNo(find)}
          type="button"
        >
          <X aria-hidden className="h-4 w-4" /> No
        </button>
        <button
          className="shrink-0 px-2 py-3 text-xs font-black text-[#4EC98F]"
          onClick={() => openShow(find.showId)}
          type="button"
        >
          Open show
        </button>
      </div>
    </article>
  );
}

export function BriefingView({
  userId,
  handle,
  // Fixtures are the DEFAULT, not a hardcoding: when convex/briefing.ts lands,
  // page.tsx passes `briefing={useQuery(api.briefing.forUser, { userId })}` and
  // nothing else in this file changes. The contract's shapes are identical by
  // construction, which is the whole point of building against it.
  briefing = BRIEFING_FIXTURE,
  now,
  openShow,
  onYes,
  onBrowse,
  onOpenBackfill,
}: {
  userId: Id<"users">;
  handle: string;
  briefing?: Briefing;
  now: number;
  openShow: (showId: string) => void;
  onYes: (find: AgentFind) => Promise<void>;
  onBrowse: () => void;
  onOpenBackfill: () => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);

  // Both rules live in app/briefingSurface.js, where they are tested. See the
  // header there for why they are not inlined: "no evidence, no card" and the
  // empty-room rule are promises the product makes out loud.
  const finds = visibleFinds(briefing.finds, dismissed);
  const beliefs = briefing.beliefs;
  const activity = briefing.activity;
  const nothingYet = briefingIsEmpty(briefing, dismissed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <Bot aria-hidden className="h-5 w-5 text-[#FF7A50]" />
        <SectionTitle eyebrow={`@${handle}`} title="Your briefing" />
      </div>

      {nothingYet ? (
        // The empty room, stated once and honestly, instead of four headings
        // that imply an agent has been working when none has.
        <EmptyLine
          actionLabel="Scan your camera roll"
          onAction={onOpenBackfill}
          text="Your agent has nothing to report yet. Give it your history and it can start scouting."
        />
      ) : (
        <>
          {briefing.decisionsOwed > 0 && (
            <section aria-labelledby="briefing-decisions">
              <h3 className="sr-only" id="briefing-decisions">
                Decisions you owe
              </h3>
              <PendingCandidates openShow={openShow} userId={userId} />
              <SquadPlanCard openShow={openShow} userId={userId} />
            </section>
          )}

          <section aria-labelledby="briefing-finds" className="mt-10 border-t border-white/10 pt-8">
            <SectionTitle
              eyebrow={finds.length ? `${finds.length} worth your night` : "Nothing to recommend yet"}
              title="What your agent found"
            />
            {finds.length ? (
              <>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#8A8177]">
                  Scouted against your own history. Every one shows its working, so you are
                  judging a case rather than trusting a number.
                </p>
                <div className="mt-5 space-y-3">
                  {finds.map((find) => (
                    <FindCard
                      find={find}
                      key={find.showId}
                      onNo={(value) => setDismissed((current) => [...current, value.showId])}
                      onYes={onYes}
                      openShow={openShow}
                    />
                  ))}
                </div>
              </>
            ) : (
              // Says WHY it is empty, per CONCIERGE.md. An empty recommender
              // that explains itself is a working one; a silent one looks broken.
              <EmptyLine
                actionLabel="Browse what's on"
                onAction={onBrowse}
                text="Log three nights and your agent has enough to scout with. Until then it would be guessing, so it doesn't."
              />
            )}
          </section>

          {activity.length > 0 && (
            <section aria-labelledby="briefing-activity" className="mt-10 border-t border-white/10 pt-8">
              <SectionTitle eyebrow="Since you last looked" title="While you were away" />
              <AgentActivity items={activity} />
            </section>
          )}

          {beliefs.length > 0 && (
            <section aria-labelledby="briefing-beliefs" className="mt-10 border-t border-white/10 pt-8">
              <SectionTitle eyebrow="Drawn from your diary" title="What it believes" />
              <div className="mt-5 space-y-3">
                {beliefs.map((belief) => (
                  <article
                    className="border border-[#2A2521] bg-[#141210] p-4"
                    key={belief.statement}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display min-w-0 flex-1 text-lg leading-7">{belief.statement}</p>
                      <span
                        className={`shrink-0 text-[10px] uppercase tracking-wide ${
                          belief.strength === "strong" ? "text-[#4EC98F]" : "text-[#8A8177]"
                        }`}
                      >
                        {belief.strength}
                      </span>
                    </div>
                    {/* The basis is the point. A belief without one is a horoscope. */}
                    <p className="mt-2 text-xs leading-5 text-[#8A8177]">{belief.basis}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
