"use client";

import { useState } from "react";
import { Download, Send } from "lucide-react";
import { RECAP_FORMATS, type RecapFormat } from "../recapCanvas.js";
import { buildOverlapStory, drawOverlap, overlapFilename } from "../overlapCanvas.js";
import type { OverlapStory } from "../overlapCanvas.d";
import { handOffCard, renderCard } from "./cardExport";

// The share with a named recipient.
//
// A recap gets posted at an audience; a card with someone else's handle on it
// gets sent TO that someone, which is the only card here that closes a loop
// instead of broadcasting. So the copy says "send", not "share" — the verb is
// the feature.
//
// Carries match strength and shared artist names only. Never the other
// person's diary.

export function OverlapShareCard({
  matchPercent,
  sharedArtists,
  sharedShowCount,
  theirHandle,
}: {
  matchPercent: number;
  sharedArtists: readonly { name: string }[];
  sharedShowCount: number;
  theirHandle: string;
}) {
  // The viewer's own handle, for the footer and the sentence. Read lazily and
  // defensively: without it the card still works, it just speaks in one voice
  // instead of two.
  const [mine] = useState(() => {
    try {
      return window.localStorage.getItem("showtonic.handle") ?? "";
    } catch {
      return "";
    }
  });

  const story = buildOverlapStory({
    matchPercent,
    mine,
    sharedArtists,
    sharedShowCount,
    theirs: theirHandle,
  });
  if (story.empty) return null;
  return <ReadyCard story={story} />;
}

function ReadyCard({ story }: { story: Extract<OverlapStory, { empty: false }> }) {
  const [busy, setBusy] = useState<RecapFormat | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function send(format: RecapFormat) {
    setBusy(format);
    setStatus("");
    setFailed(false);
    try {
      const blob = await renderCard(format, (ctx) => drawOverlap(ctx, { story, format }));
      const outcome = await handOffCard(blob, overlapFilename(story.them, format), story.shareText);
      setStatus(outcome.status);
      setFailed(outcome.failed);
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : "Could not build the image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF7A50]">Send it to them</p>
      <p className="font-display mt-2 text-base leading-7 text-[#F5F1E8]">{story.shareText}</p>
      <p className="mt-2 text-xs leading-5 text-[#C9C1B4]">
        The card carries your overlap and the artists you share — never anything else from @{story.them}&apos;s diary.
        You send it; Showtonic never messages anyone for you.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(RECAP_FORMATS) as RecapFormat[]).map((format) => (
          <button
            className="flex items-center gap-2 border border-[#2A2521] px-4 py-2 text-xs font-black text-[#C9C1B4] hover:border-[#FF7A50] hover:text-white disabled:opacity-50"
            disabled={busy !== null}
            key={format}
            onClick={() => void send(format)}
            type="button"
          >
            {busy === format ? <Send aria-hidden className="h-3 w-3 animate-pulse" /> : <Download aria-hidden className="h-3 w-3" />}
            {RECAP_FORMATS[format].label}
          </button>
        ))}
      </div>
      {status && (
        <p
          aria-live="polite"
          className={`mt-2 text-xs ${failed ? "border border-red-400/60 bg-red-950/30 p-2 text-red-200" : "text-[#8A8177]"}`}
          role="status"
        >
          {status}
        </p>
      )}
    </div>
  );
}
