"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, Calendar, Check, Eye, Globe, Images, MapPin, Search, Sparkles, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { describeConfidence } from "../backfill.js";
import type { EvidenceKind } from "../backfill.d";
import { formatDate, SectionTitle } from "./shared";

// Nights an AGENT reconstructed, waiting on a human.
//
// `backfill.pending` has existed since the reclaim flow landed and nothing in
// the app ever read it. Two consequences, both bad:
//
//   1. When an agent calls `reclaim_camera_roll` over MCP, its candidates land
//      in the database and the app shows nothing at all. The whole premise —
//      the agent does the archaeology, the human keeps the last touch — had no
//      surface to happen on.
//   2. The reclaim flow's own summary promises "Review anytime" for nights you
//      skipped. There was no anytime and no anywhere. That copy was a lie.
//
// Empty-room rule holds: nothing pending, no card. This never claims an agent
// did something until one actually has.

const EVIDENCE_ICONS: Record<string, typeof MapPin> = {
  gps: MapPin,
  date: Calendar,
  volume: Images,
  taste: Sparkles,
  venue: Check,
  vision: Eye,
  web: Search,
};

function EvidenceRow({ kind, detail, delta }: { kind: EvidenceKind | string; detail: string; delta: number }) {
  const Icon = EVIDENCE_ICONS[kind] ?? Check;
  const against = delta < 0;
  return (
    <p className="flex items-start gap-3 py-2 text-xs">
      <Icon aria-hidden className={`mt-px h-4 w-4 shrink-0 ${against ? "text-red-300" : "text-[#4EC98F]"}`} />
      <span className="min-w-0 flex-1 text-[#8A8177]">{detail}</span>
      <span className={`shrink-0 font-black ${against ? "text-red-300" : "text-[#4EC98F]"}`}>
        {delta > 0 ? "+" : ""}
        {Math.round(delta * 100)}%
      </span>
    </p>
  );
}

export function PendingCandidates({ userId, openShow }: { userId: Id<"users">; openShow?: (showId: string) => void }) {
  const pending = useQuery(api.backfill.pending, { userId });
  const resolveCandidate = useMutation(api.backfill.resolve);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!pending || pending.length === 0) return null;

  async function decide(candidateId: Id<"backfillCandidates">, action: "accept" | "reject") {
    if (busyId) return;
    setBusyId(String(candidateId));
    setError("");
    try {
      await resolveCandidate({ candidateId, userId, action });
    } catch (resolveError) {
      // Name the night that failed, not just the verb. With several rows on
      // screen "Could not update this night" tells you nothing about which.
      setError(resolveError instanceof Error ? resolveError.message : "Could not save that decision. The night is still waiting — try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="surface-settle mt-10 border-t border-white/10 pt-8">
      <div className="flex items-center gap-2">
        <Bot aria-hidden className="h-5 w-5 text-[#FF7A50]" />
        <SectionTitle
          eyebrow={`${pending.length} ${pending.length === 1 ? "night" : "nights"} waiting on you`}
          title="Your agent rebuilt these"
        />
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#8A8177]">
        Nothing here is in your diary yet. Each one shows the evidence it was matched on,
        so you are confirming a case rather than trusting a number.
      </p>

      {error && (
        <p aria-live="assertive" className="mt-4 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {pending.map((candidate) => {
          const id = String(candidate._id);
          const busy = busyId === id;
          const open = expanded === id;
          const title = candidate.show?.artistNames?.[0] ?? candidate.show?.title ?? "An unmatched night";
          // A night that was NOT in our catalog until an agent went and found
          // it. It is the strongest claim on this screen — the catalog grows as
          // a side effect of someone reclaiming their own history — and until
          // now the only trace of it was a magnifying-glass icon on an evidence
          // row you had to expand to see. `web` evidence is produced by exactly
          // one path (convex/catalogGap.ts, which searches Tavily), so the
          // attribution is a fact about provenance rather than a sponsor badge.
          const fromWeb = candidate.evidence.some((row) => row.kind === "web");
          return (
            <article className="border border-[#2A2521] bg-[#141210]" key={id}>
              <div className="flex items-start gap-3 p-4">
                {candidate.show?.image ? (
                  <img alt="" className="h-16 w-12 shrink-0 object-cover" src={candidate.show.image} />
                ) : (
                  <span aria-hidden className="h-16 w-12 shrink-0 bg-[#1A1713]" />
                )}
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{title}</b>
                  <p className="mt-1 truncate text-xs text-[#8A8177]">
                    {formatDate(candidate.clusterDate)}
                    {candidate.show?.venueName ? ` · ${candidate.show.venueName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#8A8177]">
                    {candidate.photoCount} {candidate.photoCount === 1 ? "photo" : "photos"} on this night
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#4EC98F]">
                  {describeConfidence(candidate.confidence)}
                </span>
              </div>

              {fromWeb && (
                <p className="flex items-start gap-2 border-t border-white/10 bg-[#1A1713] px-4 py-2 text-xs text-[#6FBCD3]">
                  <Globe aria-hidden className="mt-px h-4 w-4 shrink-0" />
                  <span>
                    <b className="font-black">This night was not in our catalog.</b> Your agent
                    went and found it on the web — searched with Tavily, evidence below.
                  </span>
                </p>
              )}

              {candidate.draft?.caption && (
                <p className="font-display border-t border-white/10 px-4 py-3 text-sm leading-6 text-[#C9C1B4]">
                  &ldquo;{candidate.draft.caption}&rdquo;
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-[#8A8177]">
                    Draft caption — yours to edit after you accept
                  </span>
                </p>
              )}

              <div className="border-t border-white/10 px-4 py-3">
                <button
                  aria-expanded={open}
                  className="text-xs font-black text-[#6FBCD3]"
                  onClick={() => setExpanded(open ? null : id)}
                  type="button"
                >
                  {open ? "Hide" : "Why this match"} ({candidate.evidence.length})
                </button>
                {open && (
                  <div className="surface-settle mt-2 divide-y divide-white/10 border-t border-white/10 pt-1">
                    {candidate.evidence.length ? (
                      candidate.evidence.map((row) => (
                        <EvidenceRow delta={row.delta} detail={row.detail} key={row.kind + row.detail} kind={row.kind} />
                      ))
                    ) : (
                      <p className="py-2 text-xs text-[#8A8177]">No evidence rows were recorded for this night.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-white/10 p-4">
                <button
                  className="flex-1 bg-[#FF7A50] px-4 py-3 text-sm font-black text-black disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void decide(candidate._id as Id<"backfillCandidates">, "accept")}
                  type="button"
                >
                  {busy ? "Adding…" : "Yes, I was there"}
                </button>
                <button
                  aria-label={`Dismiss ${title}`}
                  className="flex items-center gap-1 border border-[#2A2521] px-4 py-3 text-sm font-black text-[#8A8177] disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void decide(candidate._id as Id<"backfillCandidates">, "reject")}
                  type="button"
                >
                  <X aria-hidden className="h-4 w-4" /> No
                </button>
                {candidate.show && openShow && (
                  <button
                    className="shrink-0 px-2 py-3 text-xs font-black text-[#4EC98F]"
                    onClick={() => openShow(String(candidate.show!._id))}
                    type="button"
                  >
                    Open show
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
