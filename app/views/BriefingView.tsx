"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Bot, Clock, MapPin, Sparkles, UserCheck, Users, X } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import type { AgentFind, Briefing, BriefingEvidence, TasteBelief } from "../briefing";
import { briefingIsEmpty, visibleFinds } from "../briefingSurface.js";
import { PendingCandidates } from "./PendingCandidates";
import { SquadPlanCard } from "./SquadPlan";
import { AgentActivity } from "./AgentActivity";
import { DetailSkeleton, formatDate, LiveMessage, SectionTitle, todayIso } from "./shared";

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

// The way out of an empty briefing, offered identically wherever the briefing is
// thin.
//
// It exists because the two thin states had drifted: a member with NOTHING was
// offered the camera-roll scan, and a member with almost nothing — one activity
// row, no finds — was offered only "browse what's on", under a sentence that
// says "log three nights". The member with less data got the better route. The
// scan is the primary because it is the one that actually produces history;
// browsing is how you find one specific night, which is a different job.
function NextStep({
  text,
  onOpenBackfill,
  onBrowse,
}: {
  text: string;
  onOpenBackfill: () => void;
  onBrowse: () => void;
}) {
  return (
    <div className="mt-4 border border-dashed border-[#2A2521] p-5">
      <p className="text-sm leading-6 text-[#8A8177]">{text}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="bg-[#FF7A50] px-4 py-2 text-xs font-black text-black"
          onClick={onOpenBackfill}
          type="button"
        >
          Scan your camera roll
        </button>
        <button
          className="border border-[#2A2521] px-4 py-2 text-xs font-black text-[#4EC98F]"
          onClick={onBrowse}
          type="button"
        >
          Browse what&rsquo;s on
        </button>
      </div>
    </div>
  );
}

// A belief you can argue with.
//
// The whole section is a claim the app makes about you, and a claim you cannot
// contradict is not a belief, it is an assertion. Two verbs, and what each one
// means is deliberately NOT symmetric — see convex/briefingLogic.js:
//
//   "That's right"  pins it and says so in the basis. It does NOT promote
//                   forming → strong: strength is derived from how many nights
//                   are in your diary, and you agreeing with us is not more
//                   nights. Confirmation is its own fact, not a louder ours.
//   "That's wrong"  suppresses it. Not for a cooling-off period — you said the
//                   claim is false, and re-asserting it next week because a
//                   timer expired would be the app arguing with you. It returns
//                   only if the evidence genuinely changes, and then it says so.
//
// `basisAtTime` is the basis AS DISPLAYED, because "only comes back when the
// evidence changed" has to compare against the number you were actually
// looking at, not the number by the time your tap arrives.
function BeliefCard({
  belief,
  onCorrect,
}: {
  belief: TasteBelief;
  onCorrect: (belief: TasteBelief, verdict: "right" | "wrong") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"right" | "wrong" | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function correct(verdict: "right" | "wrong") {
    if (busy) return;
    setBusy(verdict);
    setFailed(false);
    setStatus(verdict === "right" ? "Noting that…" : "Taking that back…");
    try {
      await onCorrect(belief, verdict);
      // "wrong" removes the card on the next query result, so this line is
      // mostly read by someone who cannot see it go.
      setStatus(verdict === "right" ? "Noted — I'll keep this one." : "Dropped. I won't claim that again.");
    } catch (error) {
      setFailed(true);
      setStatus(
        error instanceof Error && error.message
          ? error.message
          : "That did not save, so the belief stands. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="border border-[#2A2521] bg-[#141210] p-4">
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

      {status && (
        <div className="mt-3">
          <LiveMessage tone={failed ? "error" : "info"}>{status}</LiveMessage>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <button
          className="border border-[#2A2521] px-3 py-2 text-xs font-black text-[#4EC98F] disabled:opacity-60"
          disabled={busy !== null}
          onClick={() => void correct("right")}
          type="button"
        >
          {busy === "right" ? "Noting…" : "That's right"}
        </button>
        <button
          className="border border-[#2A2521] px-3 py-2 text-xs font-black text-[#8A8177] disabled:opacity-60"
          disabled={busy !== null}
          onClick={() => void correct("wrong")}
          type="button"
        >
          {busy === "wrong" ? "Dropping…" : "That's wrong"}
        </button>
      </div>
    </article>
  );
}

export function BriefingView({
  userId,
  handle,
  // Live. `briefing` survives only as a test/story override — every sibling
  // agent card (PendingCandidates, SquadPlanCard, RecapCard) self-queries, and
  // the Briefing being the one that took its data by prop was an artifact of
  // being built before the query existed.
  briefing: briefingOverride,
  openShow,
  onYes,
  onBrowse,
  onOpenBackfill,
}: {
  userId: Id<"users">;
  handle: string;
  briefing?: Briefing;
  openShow: (showId: string) => void;
  onYes: (find: AgentFind) => Promise<void>;
  onBrowse: () => void;
  onOpenBackfill: () => void;
}) {
  const liveBriefing = useQuery(api.briefing.forUser, { userId, today: todayIso() });
  const briefing = briefingOverride ?? liveBriefing;
  const [dismissed, setDismissed] = useState<string[]>([]);
  const correct = useMutation(api.briefing.correctBelief);

  async function correctBelief(belief: TasteBelief, verdict: "right" | "wrong") {
    await correct({ userId, statement: belief.statement, basisAtTime: belief.basis, verdict });
  }

  // The home screen now waits on a real round trip, which it never did on
  // fixtures. Same rule as every other detail view: hold the silhouette rather
  // than popping in, and say so to a screen reader.
  if (!briefing) return <DetailSkeleton label="Reading your briefing" />;

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
        <NextStep
          onBrowse={onBrowse}
          onOpenBackfill={onOpenBackfill}
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
              id="briefing-finds" title="What your agent found"
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
              <NextStep
                onBrowse={onBrowse}
                onOpenBackfill={onOpenBackfill}
                text="Log three nights and your agent has enough to scout with. Until then it would be guessing, so it doesn't."
              />
            )}
          </section>

          {activity.length > 0 && (
            // The double-heading seam was fixed from BOTH sides at once: L5
            // stripped the component's chrome while this file stripped the
            // wrapper, and the merge of the two fixes left section ③ with no
            // heading at all. The contract is L5's: the component owns the
            // rows, the composer owns the section and the title. So the
            // wrapper is back, and it is the only one.
            <section aria-labelledby="briefing-activity" className="mt-10 border-t border-white/10 pt-8">
              <SectionTitle eyebrow="Since you last looked" id="briefing-activity" title="While you were away" />
              <AgentActivity items={activity} />
            </section>
          )}

          {beliefs.length > 0 && (
            <section aria-labelledby="briefing-beliefs" className="mt-10 border-t border-white/10 pt-8">
              <SectionTitle eyebrow="Drawn from your diary" id="briefing-beliefs" title="What it believes" />
              <div className="mt-5 space-y-3">
                {beliefs.map((belief) => (
                  <BeliefCard belief={belief} key={belief.statement} onCorrect={correctBelief} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
