"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { RECAP_FORMATS, type RecapFormat } from "../recapCanvas.js";
import { buildReclaimStory, drawReclaim, reclaimFilename } from "../reclaimCanvas.js";
import type { ReclaimNight, ReclaimStory } from "../reclaimCanvas.d";
import { handOffCard, renderCard } from "./cardExport";

// Offered at the END of a confirm session, when the person is holding the one
// feeling this whole product is for: nights they had lost are back, and they
// did not do the work.
//
// Everything on it comes from the session's own client-side state — the nights
// just confirmed, and the oldest date among them. No backend call, no
// provenance column, nothing read back from a table that does not exist yet.

export function ReclaimShareCard({ handle, nights }: { handle: string; nights: ReclaimNight[] }) {
  const story = buildReclaimStory(nights, { handle });
  // Empty-room rule: nothing confirmed is not a story, and there is no card.
  // The guard lives out here so the card below can be typed against a story
  // that definitely has one.
  if (story.empty) return null;
  return <ReadyCard handle={handle} story={story} />;
}

function ReadyCard({ handle, story }: { handle: string; story: Extract<ReclaimStory, { empty: false }> }) {
  const [busy, setBusy] = useState<RecapFormat | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  async function share(format: RecapFormat) {
    setBusy(format);
    setStatus("");
    setFailed(false);
    try {
      const blob = await renderCard(format, (ctx) => drawReclaim(ctx, { story, format }));
      const outcome = await handOffCard(blob, reclaimFilename(handle, format), story.shareText);
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
    <div className="mt-6 border border-[#2A2521] bg-[#141210] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF7A50]">Worth showing someone</p>
      <p className="font-display mt-2 text-lg leading-7 text-[#F5F1E8]">{story.shareText}</p>
      <p className="mt-2 text-xs leading-5 text-[#C9C1B4]">
        We generate it, you post it — Showtonic never publishes to your accounts, and there is no button here that
        would.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(RECAP_FORMATS) as RecapFormat[]).map((format) => (
          <button
            className="flex items-center gap-2 border border-[#2A2521] px-4 py-2 text-xs font-black text-[#C9C1B4] hover:border-[#FF7A50] hover:text-white disabled:opacity-50"
            disabled={busy !== null}
            key={format}
            onClick={() => void share(format)}
            type="button"
          >
            {busy === format ? <Share2 aria-hidden className="h-3 w-3 animate-pulse" /> : <Download aria-hidden className="h-3 w-3" />}
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
