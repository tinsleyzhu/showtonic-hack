"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Copy, Download, ImageDown, Share2, Wand2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  describeShareFailure,
  drawRecap,
  RECAP_FORMATS,
  recapFilename,
  type RecapFormat,
} from "../recapCanvas.js";

// Export — the honest end of the share story.
//
// WE CANNOT AUTO-POST, and this UI says so instead of implying otherwise.
// Instagram's Graph API needs a business account and an app review, and
// publishing public content as someone else needs their consent for that post
// regardless of what an API allows. So the agent generates and the human posts:
// this hands them a finished 1080x1920 or 1080x1080 image, through the OS share
// sheet where the browser offers one, and a download where it does not.

type ExportRecap = Parameters<typeof drawRecap>[1]["recap"] & { handle?: string };

// Cross-origin photos have to be fetched with CORS or the canvas is tainted and
// toBlob throws. A photo that will not load that way is SKIPPED rather than
// drawn — a recap without one picture beats an export that fails.
function loadImage(url: string) {
  return new Promise<(CanvasImageSource & { width: number; height: number }) | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function renderRecap(recap: ExportRecap, format: RecapFormat) {
  const shape = RECAP_FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser did not give us a canvas to draw on.");

  // The member's own photos first, then whatever the card used as its hero —
  // otherwise a diary with no uploaded media exports onto a blank rectangle.
  const ownPhotos = (recap.photos ?? [])
    .map((photo) => photo.url)
    .filter((url): url is string => !!url);
  const urls = [...ownPhotos, recap.heroImage ?? null].filter(
    (url): url is string => !!url,
  );
  const images = new Map<string, CanvasImageSource & { width: number; height: number }>();
  for (const [index, loaded] of (await Promise.all(urls.map(loadImage))).entries()) {
    if (loaded) images.set(urls[index], loaded);
  }
  // Only a photo of THEIRS that failed is worth telling them about; a press-shot
  // fallback that would not load is not a caveat, it is a detail.
  const skipped = ownPhotos.filter((url) => !images.has(url)).length;

  drawRecap(ctx, { recap, format, images });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The image could not be encoded.");
  return { blob, skipped };
}

// Extracted so the share-sheet refusal path can reach it too.
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on a later turn, not this one: the download starts asynchronously
  // and revoking in the same tick can pull the blob out from under it —
  // silently, which is exactly the outcome this feature exists to avoid.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function RecapExport({ recap, userId }: { recap: ExportRecap; userId: Id<"users"> }) {
  const [busy, setBusy] = useState<RecapFormat | null>(null);
  const [status, setStatus] = useState("");
  // Success and failure were rendering identically in muted grey. An export that
  // failed should not read like one that worked.
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const writeCaption = useAction(api.recap.caption);
  const [caption, setCaption] = useState<{ caption: string; source: string; note: string } | null>(null);
  const [writing, setWriting] = useState(false);

  async function generateCaption() {
    setWriting(true);
    try {
      setCaption(await writeCaption({ userId }));
    } catch (error) {
      setCaption({
        caption: recap.shareText,
        source: "local",
        note: error instanceof Error ? `Written here — ${error.message}` : "Written here.",
      });
    } finally {
      setWriting(false);
    }
  }

  async function exportRecap(format: RecapFormat) {
    setBusy(format);
    setStatus("");
    setFailed(false);
    try {
      const { blob, skipped } = await renderRecap(recap, format);
      const filename = recapFilename(recap.handle ?? "recap", format);
      const file = new File([blob], filename, { type: "image/png" });
      const note = skipped
        ? ` (${skipped} ${skipped === 1 ? "photo" : "photos"} left out — the image host refused a cross-origin read)`
        : "";

      // The share sheet where the browser has one; a download where it does
      // not. Either way the human is the one who posts it.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: recap.shareText });
          setStatus(`Handed to your share sheet${note}.`);
          return;
        } catch (error) {
          // A share that rejects used to surface the raw DOM message and no
          // image at all — the exact silent-ish dead end this feature exists to
          // avoid. Cancel stops here; a refusal falls through to the download.
          const outcome = describeShareFailure(error);
          if (!outcome.fallback) {
            setStatus(outcome.message);
            return;
          }
          download(blob, filename);
          setStatus(`${outcome.message}: ${filename}${note}.`);
          return;
        }
      }
      download(blob, filename);
      setStatus(`Saved ${filename}${note}.`);
    } catch (error) {
      // Say which step failed. A silent no-op button is the thing this whole
      // feature is written to avoid.
      setFailed(true);
      setStatus(error instanceof Error ? error.message : "Could not build the image.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5">
      <p className="flex items-start gap-2 text-xs leading-5 text-[#C9C1B4]">
        <ImageDown className="mt-0.5 h-3 w-3 shrink-0 text-[#FF7A50]" />
        <span>
          <b className="text-white">Ready to post.</b> We generate it, you post it —
          Showtonic never publishes to your accounts, and there is no button here
          that would.
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(RECAP_FORMATS) as RecapFormat[]).map((format) => (
          <button
            className="flex items-center gap-2 border border-[#2A2521] px-4 py-2 text-xs font-black text-[#C9C1B4] hover:border-[#FF7A50] hover:text-white disabled:opacity-50"
            disabled={busy !== null}
            key={format}
            onClick={() => void exportRecap(format)}
            type="button"
          >
            {busy === format ? <Share2 className="h-3 w-3 animate-pulse" /> : <Download className="h-3 w-3" />}
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

      <div className="mt-4 border border-[#2A2521] bg-[#141210] p-4">
        <div className="flex items-center justify-between gap-3">
          <b className="text-xs font-black uppercase tracking-wide text-[#8A8177]">Caption</b>
          <button
            className="flex items-center gap-2 text-xs font-black text-[#6FBCD3] disabled:opacity-50"
            disabled={writing}
            onClick={() => void generateCaption()}
            type="button"
          >
            <Wand2 className="h-3 w-3" />
            {writing ? "Writing…" : caption ? "Rewrite" : "Write me one"}
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#C9C1B4]">{caption?.caption || recap.shareText}</p>
        {copied !== "idle" && (
          <p aria-live="polite" className={`mt-2 text-[10px] ${copied === "failed" ? "text-red-200" : "text-[#8A8177]"}`} role="status">
            {copied === "copied" ? "Caption copied to your clipboard." : "This browser would not let us copy. Select the caption above and copy it by hand."}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {/* Where the words came from, always. A model-written caption that
              claims to be your own words is the small lie this avoids. */}
          <small className="text-[10px] text-[#8A8177]">
            {caption ? caption.note : "Written here from your logs."}
          </small>
          <button
            className="flex items-center gap-2 text-xs font-black text-[#8A8177] hover:text-white"
            onClick={() => {
              void Promise.resolve(navigator.clipboard?.writeText(caption?.caption || recap.shareText) ?? Promise.reject(new Error("no clipboard")))
                .then(() => setCopied("copied"))
                .catch(() => setCopied("failed"));
            }}
            type="button"
          >
            <Copy aria-hidden className="h-3 w-3" /> {copied === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
