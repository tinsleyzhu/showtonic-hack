"use client";

import { useState } from "react";
import { Download, ImageDown, Share2 } from "lucide-react";
import {
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

export function RecapExport({ recap }: { recap: ExportRecap }) {
  const [busy, setBusy] = useState<RecapFormat | null>(null);
  const [status, setStatus] = useState("");

  async function exportRecap(format: RecapFormat) {
    setBusy(format);
    setStatus("");
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
        await navigator.share({ files: [file], text: recap.shareText });
        setStatus(`Handed to your share sheet${note}.`);
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`Saved ${filename}${note}.`);
    } catch (error) {
      // Say which step failed. A silent no-op button is the thing this whole
      // feature is written to avoid.
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
      {status && <p className="mt-2 text-xs text-[#8A8177]">{status}</p>}
    </div>
  );
}
