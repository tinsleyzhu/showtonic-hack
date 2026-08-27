"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  Calendar,
  Check,
  Eye,
  EyeOff,
  Images,
  Lock,
  MapPin,
  ScanSearch,
  Search,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  buildDemoCameraRoll,
  clusterPhotosIntoNights,
  describeConfidence,
  describeReclaimSpan,
  matchClustersToShows,
} from "../backfill.js";
import type { BackfillCandidate, BackfillPhoto, EvidenceKind } from "../backfill.d";
import { readCameraRoll, summarizeRoll } from "../photoMeta.js";
import { RatingStars, todayIso, type Show } from "./shared";

const CARD_COLORS = ["#F97354", "#6FBCD3", "#9B7FB8", "#D9B44A", "#5F7A5E"];

type Stage = "offer" | "scanning" | "confirm" | "rate" | "complete";

type PendingRow = { candidate: BackfillCandidate; candidateId: Id<"backfillCandidates"> };
type ResolvedNight = { candidate: BackfillCandidate; rating: number };

const EVIDENCE_ICONS: Record<EvidenceKind, typeof MapPin> = {
  gps: MapPin,
  date: Calendar,
  volume: Images,
  taste: Sparkles,
  venue: Check,
  vision: Eye,
  web: Search,
};

// Evidence rows show the matcher's work instead of a bare percentage
// (docs/agent-hack/DESIGN.md "Evidence card").
function EvidenceRow({ kind, detail, delta }: { kind: EvidenceKind; detail: string; delta: number }) {
  const Icon = EVIDENCE_ICONS[kind] ?? Check;
  const against = delta < 0;
  return (
    <p className="flex items-start gap-3 py-2 text-xs">
      <Icon className={`mt-px h-4 w-4 shrink-0 ${against ? "text-red-300" : "text-[#4EC98F]"}`} />
      <span className="min-w-0 flex-1 text-[#8A8177]">{detail}</span>
      <span className={`shrink-0 font-black ${against ? "text-red-300" : "text-[#4EC98F]"}`}>
        {delta > 0 ? "+" : ""}
        {Math.round(delta * 100)}%
      </span>
    </p>
  );
}

function weekdayOf(date: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(`${date}T12:00:00`));
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export function BackfillFlow({
  userId,
  shows,
  favoriteArtists,
  onDone,
  onClose,
}: {
  userId: Id<"users">;
  shows: Show[];
  favoriteArtists: string[];
  onDone: (reclaimed: number) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("offer");
  const [scanProgress, setScanProgress] = useState({
    checked: 0,
    total: 0,
    clusters: 0,
    matched: 0,
    geotagged: 0,
  });
  const [queue, setQueue] = useState<PendingRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [resolved, setResolved] = useState<ResolvedNight[]>([]);
  const [activeLog, setActiveLog] = useState<{ logId: Id<"logs"> | null; row: PendingRow } | null>(null);
  const [quickRating, setQuickRating] = useState(0);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const saveCandidates = useMutation(api.backfill.saveCandidates);
  const resolveCandidate = useMutation(api.backfill.resolve);
  const rateLog = useMutation(api.backfill.rateLog);

  const today = todayIso();
  const matchOptions = useMemo(() => ({ tasteArtists: favoriteArtists, today }), [favoriteArtists, today]);

  async function runScan(photos: BackfillPhoto[]) {
    setStage("scanning");
    setError("");
    const roll = summarizeRoll(photos);
    setScanProgress({
      checked: 0,
      total: photos.length,
      clusters: 0,
      matched: 0,
      geotagged: roll.geotagged,
    });

    // Animate the on-device scan so the counts are legible (design 08).
    const stepSize = Math.max(1, Math.floor(photos.length / 20));
    for (let checked = stepSize; checked < photos.length; checked += stepSize) {
      const slice = photos.slice(0, checked);
      const clusters = clusterPhotosIntoNights(slice);
      const matched = matchClustersToShows(clusters, shows, matchOptions);
      setScanProgress({
        checked,
        total: photos.length,
        clusters: clusters.length,
        matched: matched.length,
        geotagged: roll.geotagged,
      });
      await new Promise((resolve) => setTimeout(resolve, 70));
    }

    const clusters = clusterPhotosIntoNights(photos);
    const matches = matchClustersToShows(clusters, shows, matchOptions);
    setScanProgress({
      checked: photos.length,
      total: photos.length,
      clusters: clusters.length,
      matched: matches.length,
      geotagged: roll.geotagged,
    });

    if (!matches.length) {
      setError("No nights matched the show catalog. Try more photos, or add shows manually.");
      setStage("offer");
      return;
    }

    try {
      const saved = await saveCandidates({
        userId,
        candidates: matches.map((match) => ({
          showId: match.showId as Id<"shows">,
          clusterDate: match.clusterDate,
          photoCount: match.photoCount,
          captureWindow: match.captureWindow,
          confidence: match.confidence,
          // Derived strings only — raw coordinates never leave the device.
          evidence: match.evidence,
        })),
      });
      const rowsByKey = new Map(saved.rows.map((row) => [`${row.clusterDate}|${row.showId}`, row._id]));
      const nextQueue: PendingRow[] = [];
      for (const match of matches) {
        const candidateId = rowsByKey.get(`${match.clusterDate}|${match.showId}`);
        if (candidateId) {
          nextQueue.push({ candidate: match, candidateId: candidateId as Id<"backfillCandidates"> });
        }
      }
      if (!nextQueue.length) {
        setError("Every matched night is already in your diary.");
        setStage("offer");
        return;
      }
      setQueue(nextQueue);
      setCursor(0);
      setResolved([]);
      setStage("confirm");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the scan");
      setStage("offer");
    }
  }

  async function scanFiles(files: FileList | null) {
    if (!files?.length) return;
    // exifr reads HEIC and GPS; see app/photoMeta.js for the fallback ladder.
    const photos = await readCameraRoll(files);
    if (!photos.length) {
      setError("Could not read a date from those files. Try photo originals rather than shared copies.");
      return;
    }
    await runScan(photos);
  }

  const current = queue[cursor];

  function advance() {
    setReassignOpen(false);
    if (cursor + 1 < queue.length) {
      setCursor(cursor + 1);
      setStage("confirm");
    } else {
      setStage("complete");
    }
  }

  async function resolveCurrent(action: "accept" | "reject", reassignShowId?: Id<"shows">) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await resolveCandidate({
        candidateId: current.candidateId,
        userId,
        action: reassignShowId ? "reassign" : action,
        showId: reassignShowId,
      });
      if (action === "accept") {
        setActiveLog({ logId: result.logId as Id<"logs"> | null, row: current });
        setQuickRating(0);
        setReassignOpen(false);
        setStage("rate");
      } else {
        advance();
      }
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Could not update this night");
    } finally {
      setBusy(false);
    }
  }

  async function saveRatingAndNext() {
    if (!activeLog || busy) return;
    if (quickRating > 0 && activeLog.logId) {
      setBusy(true);
      try {
        await rateLog({ userId, logId: activeLog.logId, rating: quickRating });
      } catch (ratingError) {
        // The night itself is already in the diary — only the rating failed, and
        // saying so keeps someone from assuming the whole thing was lost.
        setError(ratingError instanceof Error ? ratingError.message : "The show is saved, but the rating did not go through. Try again, or rate it later from your diary.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setResolved((entries) => [...entries, { candidate: activeLog.row.candidate, rating: quickRating }]);
    setActiveLog(null);
    advance();
  }

  const sameNightAlternatives = current
    ? shows.filter((show) => show.date === current.candidate.clusterDate && show.id !== current.candidate.showId)
    : [];

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0A0908] text-[#F5F1E8]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button aria-label="Close backfill" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2A2521]" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
          <p className="text-sm font-black uppercase tracking-[0.3em]">
            {stage === "offer" && "Your history"}
            {stage === "scanning" && "Scanning"}
            {stage === "confirm" && `${cursor + 1} of ${queue.length}`}
            {stage === "rate" && "Added"}
            {stage === "complete" && "Showtonic"}
          </p>
          <span aria-hidden className="h-10 w-10" />
        </div>

        {error && <p aria-live="assertive" className="surface-settle mt-4 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200" role="alert">{error}</p>}

        {stage === "offer" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Reclaim your nights</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Your camera roll already remembers the shows.</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              Showtonic groups concert nights by date and time, then matches them against historical show data for you to confirm.
            </p>
            <div className="mt-6 border border-[#2A2521] bg-[#141210] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A2018]">
                    <Images className="h-5 w-5 text-[#FF7A50]" />
                  </span>
                  <b className="text-sm">Find my past shows</b>
                </div>
                <small className="text-[#8A8177]">About a minute</small>
              </div>
              <div className="mt-4 divide-y divide-white/10 border-t border-white/10 text-xs text-[#8A8177]">
                <p className="flex items-center gap-3 py-3"><Smartphone className="h-4 w-4 shrink-0" /> Scanning and photo analysis happen in this browser.</p>
                <p className="flex items-center gap-3 py-3"><EyeOff className="h-4 w-4 shrink-0" /> Original photos and videos are not uploaded.</p>
                <p className="flex items-center gap-3 py-3"><Lock className="h-4 w-4 shrink-0" /> Nothing enters your diary until you confirm it.</p>
              </div>
            </div>
            <div className="flex-1" />
            <label className="mt-8 block w-full cursor-pointer bg-[#FF7A50] px-5 py-4 text-center text-sm font-black text-black">
              Choose photos to scan
              <input accept="image/*" className="sr-only" multiple onChange={(event) => void scanFiles(event.target.files)} type="file" />
            </label>
            <button className="mt-3 w-full border border-[#2A2521] px-5 py-4 text-sm font-black" onClick={() => void runScan(buildDemoCameraRoll(shows, { today, limit: 6 }))} type="button">
              Use the demo camera roll
            </button>
            <button className="mt-4 text-sm font-black text-[#4EC98F]" onClick={onClose} type="button">
              I&apos;ll add shows manually
            </button>
          </section>
        )}

        {stage === "scanning" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">On this device</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Finding nights that look like live music.</h1>
            <div className="relative mx-auto mt-10 flex h-56 w-56 items-center justify-center">
              <span aria-hidden className="absolute inset-0 rounded-full border border-white/10" />
              <span aria-hidden className="absolute inset-6 rounded-full border border-white/15" />
              <span className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-[#141210]">
                <strong className="font-display text-4xl text-[#4EC98F]">{scanProgress.checked}</strong>
                <small className="mt-1 text-[10px] uppercase tracking-wide text-[#8A8177]">photos checked</small>
              </span>
            </div>
            <div aria-live="polite" className="mt-10 divide-y divide-white/10 border-y border-white/10 text-sm" role="status">
              <p className="flex items-center justify-between py-3">Night clusters found <b className="text-[#4EC98F]">{scanProgress.clusters}</b></p>
              <p className="flex items-center justify-between py-3">Photos with a location <b className="text-[#4EC98F]">{scanProgress.geotagged}</b></p>
              <p className="flex items-center justify-between py-3">Matched to known shows <b className="text-[#4EC98F]">{scanProgress.matched}</b></p>
              <p className="flex items-center justify-between py-3">Need your help <b className="text-[#4EC98F]">{Math.max(scanProgress.clusters - scanProgress.matched, 0)}</b></p>
            </div>
            <p className="mt-6 flex items-center gap-3 text-xs leading-5 text-[#8A8177]">
              <Lock className="h-4 w-4 shrink-0 text-[#4EC98F]" /> Only matched-show metadata syncs. Your photos stay on this device.
            </p>
          </section>
        )}

        {stage === "confirm" && current && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">
              {weekdayOf(current.candidate.clusterDate)} · {longDate(current.candidate.clusterDate)}
            </p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">
              Were you at {current.candidate.artistNames[0] ?? current.candidate.showTitle}?
            </h1>
            <p className="mt-2 text-sm text-[#8A8177]">
              {current.candidate.venueName}
              {current.candidate.city ? ` · ${current.candidate.city}` : ""}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {current.candidate.image ? (
                <img alt="" className="aspect-[3/4] w-full rounded object-cover" src={current.candidate.image} />
              ) : (
                <span className="aspect-[3/4] w-full rounded" style={{ backgroundColor: CARD_COLORS[0] }} />
              )}
              {[1, 2].map((index) => (
                <span className="aspect-[3/4] w-full rounded" key={index} style={{ backgroundColor: CARD_COLORS[(cursor + index) % CARD_COLORS.length] }} />
              ))}
            </div>
            <div className="mt-5 border border-[#2A2521] bg-[#141210] p-4">
              <div className="flex items-center justify-between">
                <b className="text-sm">Why this match</b>
                <span className="text-xs font-black text-[#4EC98F]">{describeConfidence(current.candidate.confidence)}</span>
              </div>
              <div className="mt-2 divide-y divide-white/10 border-t border-white/10 pt-1">
                {(current.candidate.evidence ?? []).map((row) => (
                  <EvidenceRow delta={row.delta} detail={row.detail} key={row.kind + row.detail} kind={row.kind} />
                ))}
                <p className="flex items-center justify-between py-2 text-xs text-[#8A8177]">
                  <span>JamBase match</span>
                  <span className="text-[#F5F1E8]">
                    {current.candidate.artistNames.slice(0, 2).join(", ") || current.candidate.showTitle}
                  </span>
                </p>
              </div>
              <p className="mt-3 border-t border-white/10 pt-3 text-xs text-[#8A8177]">Nothing is added until you confirm.</p>
            </div>
            <div className="flex-1" />
            <div className="mt-6 grid grid-cols-[2fr_1fr] gap-2">
              <button className="bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={busy} onClick={() => void resolveCurrent("accept")} type="button">
                {busy ? "Adding…" : "Yes, add it"}
              </button>
              <button className="border border-[#2A2521] px-5 py-4 text-sm font-black disabled:opacity-60" disabled={busy} onClick={() => void resolveCurrent("reject")} type="button">
                No
              </button>
            </div>
            {sameNightAlternatives.length > 0 && (
              <button className="mt-4 text-sm font-black text-[#4EC98F]" onClick={() => setReassignOpen(!reassignOpen)} type="button">
                Right night, wrong show
              </button>
            )}
            {reassignOpen && (
              <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
                {sameNightAlternatives.slice(0, 4).map((show) => (
                  <button className="flex w-full items-center gap-3 py-3 text-left disabled:opacity-60" disabled={busy} key={show.id} onClick={() => void resolveCurrent("accept", show.id as Id<"shows">)} type="button">
                    <img alt="" className="h-10 w-10 rounded object-cover" src={show.image} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{show.artistNames?.join(" + ") || show.title}</b>
                      <small className="text-[#8A8177]">{show.venueName}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {stage === "rate" && activeLog && (
          <section className="surface-settle flex flex-1 flex-col">
            <p aria-live="polite" className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]" role="status">Show {resolved.length + 1} added</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">
              How good was {activeLog.row.candidate.artistNames[0] ?? activeLog.row.candidate.showTitle}?
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">A rating makes your diary personal. Everything else can wait.</p>
            <div className="mt-6 border border-[#2A2521] bg-[#141210] p-4">
              <div className="grid grid-cols-4 gap-2">
                {activeLog.row.candidate.image ? (
                  <img alt="" className="aspect-square w-full rounded object-cover" src={activeLog.row.candidate.image} />
                ) : (
                  <span className="aspect-square w-full rounded" style={{ backgroundColor: CARD_COLORS[0] }} />
                )}
                {[1, 2, 3].map((index) => (
                  <span className="aspect-square w-full rounded" key={index} style={{ backgroundColor: CARD_COLORS[index % CARD_COLORS.length] }} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <RatingStars interactive onChange={setQuickRating} value={quickRating} />
                <strong className={`font-display text-3xl ${quickRating ? "surface-accept" : ""}`} key={quickRating}>{quickRating ? quickRating.toFixed(1) : "—"}</strong>
              </div>
              <p className="mt-3 text-xs text-[#8A8177]">{activeLog.row.candidate.photoCount} moments stay on this device.</p>
            </div>
            <div className="flex-1" />
            <button className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={busy} onClick={() => void saveRatingAndNext()} type="button">
              {busy ? "Saving…" : quickRating > 0 ? "Save rating and next" : "Add without rating"}
            </button>
            <button className="mt-3 text-sm font-black text-[#4EC98F]" onClick={() => { setQuickRating(0); void saveRatingAndNext(); }} type="button">
              Skip rating
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-[#8A8177]">No long forms — the reclaim flow keeps moving.</p>
          </section>
        )}

        {stage === "complete" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Your diary has a past now</p>
            <div className="mt-4 flex items-baseline gap-3">
              <strong className="surface-accept font-display text-6xl text-[#4EC98F]">{resolved.length}</strong>
              <span className="text-xs font-black uppercase tracking-[0.2em]">{resolved.length === 1 ? "show" : "shows"} reclaimed</span>
            </div>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">{describeReclaimSpan(resolved.map((entry) => entry.candidate)) || "Your nights, back in one place."}</h1>
            <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {resolved.slice(0, 3).map((entry) => (
                <div className="flex items-center gap-3 py-3" key={entry.candidate.clusterDate + entry.candidate.showId}>
                  <span className="flex h-10 w-10 items-center justify-center rounded" style={{ backgroundColor: CARD_COLORS[entry.candidate.clusterDate.charCodeAt(9) % CARD_COLORS.length] }}>
                    <span className="font-display text-lg text-[#F5F1E8]">{(entry.candidate.artistNames[0] ?? "S").slice(0, 1)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{entry.candidate.artistNames[0] ?? entry.candidate.showTitle}</b>
                    <small className="text-[#8A8177]">
                      {longDate(entry.candidate.clusterDate)} · {entry.rating > 0 ? entry.rating.toFixed(1) : "unrated"}
                    </small>
                  </span>
                  <Check className="h-4 w-4 shrink-0 text-[#4EC98F]" />
                </div>
              ))}
            </div>
            {resolved.length > 3 && (
              <p className="mt-3 flex items-center justify-between border border-[#2A2521] bg-[#141210] px-4 py-3 text-sm">
                <span className="text-[#8A8177]">{resolved.length - 3} more shows added</span>
                <span className="font-black text-[#4EC98F]">Review anytime</span>
              </p>
            )}
            <div className="flex-1" />
            <button className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black" onClick={() => onDone(resolved.length)} type="button">
              Open my diary
            </button>
            <button className="mt-3 w-full cursor-not-allowed border border-[#2A2521] px-5 py-4 text-sm font-black text-[#6B6258]" disabled title="Claimed accounts arrive with a later build" type="button">
               Claim and sync with Apple · coming soon
            </button>
            <button className="mt-4 text-sm font-black text-[#4EC98F]" onClick={() => onDone(resolved.length)} type="button">
              Keep using on this device
            </button>
          </section>
        )}

        {stage === "confirm" && !current && (
          <section className="flex flex-1 flex-col items-center justify-center">
            <ScanSearch className="h-8 w-8 text-[#8A8177]" />
            <p className="mt-4 text-sm text-[#8A8177]">Nothing left to confirm.</p>
            <button className="mt-6 bg-[#FF7A50] px-5 py-3 text-sm font-black text-black" onClick={() => setStage("complete")} type="button">
              See the summary
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
