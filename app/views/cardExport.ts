// The one route every share card takes out of this app.
//
// Extracted from RecapExport so the recap, the reclaim story and the taste
// overlap cannot drift into three different answers to "what happens when the
// share sheet says no" — a question this app has already got wrong once, by
// handing back a raw DOM error and no image.
//
// WE STILL CANNOT AUTO-POST, and still say so rather than designing around it.
// Instagram's Graph API needs a business account and app review, and publishing
// public content for someone needs their consent for that post regardless. So
// every card ends at the OS share sheet or a download, with a human's thumb in
// between.

import { describeShareFailure, RECAP_FORMATS, type RecapFormat } from "../recapCanvas.js";

export type CardHandoff = { status: string; failed: boolean };

// Paints at full poster resolution and encodes. `paint` gets a real 2D context
// and the shape it is painting into.
export async function renderCard(
  format: RecapFormat,
  paint: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const shape = RECAP_FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");

  paint(ctx);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The image could not be encoded.");
  return blob;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoked on a later turn, not this one: the download starts asynchronously
  // and revoking in the same tick can pull the blob out from under it —
  // silently, which is exactly the outcome these cards exist to avoid.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// The share sheet where the browser has one, a download where it does not, and
// a download again where the sheet refuses. Cancelling is a decision and stops
// there. Either way the human is the one who posts it.
export async function handOffCard(
  blob: Blob,
  filename: string,
  shareText: string,
  note = "",
): Promise<CardHandoff> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText });
      return { status: `Handed to your share sheet${note}.`, failed: false };
    } catch (error) {
      const outcome = describeShareFailure(error);
      if (!outcome.fallback) return { status: outcome.message, failed: false };
      download(blob, filename);
      return { status: `${outcome.message}: ${filename}${note}.`, failed: false };
    }
  }

  download(blob, filename);
  return { status: `Saved ${filename}${note}.`, failed: false };
}
