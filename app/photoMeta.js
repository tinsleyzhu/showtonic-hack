// Photo metadata reader (browser only).
//
// exifr replaces the hand-rolled JPEG parser as the primary reader because it
// handles HEIC — what an iPhone camera roll is actually made of — and reads the
// GPS IFD, which the old parser ignored entirely. GPS is what disambiguates a
// crowded Saturday with fifteen shows in one city.
//
// PRIVACY: this runs in the browser and returns metadata only. Coordinates are
// consumed by the matcher on-device; nothing here uploads a photo, and only the
// derived evidence string ("6 photos within a block of The Midway") is ever
// sent to Convex. See docs/agent-hack/ARCHITECTURE.md.

import { extractExifDate } from "./backfill.js";

// Enough bytes for the EXIF/HEIC metadata block without reading whole photos.
const HEAD_BYTES = 512 * 1024;

// exifr is loaded lazily, in the browser only. At module scope it drags `fs`
// and `zlib` into the SSR bundle, which the Cloudflare Workers runtime cannot
// resolve — the dev server 500s on every route. Scanning is a user-initiated
// browser action, so paying the import cost on first scan is free.
let exifrPromise = null;

function loadExifr() {
  if (typeof window === "undefined") return Promise.resolve(null);
  exifrPromise ??= import("exifr")
    .then((module) => module.default ?? module)
    .catch(() => null);
  return exifrPromise;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

// exifr returns a JS Date built from the camera's local wall-clock time. The
// night-clustering rules are all local-time, so format the local components
// rather than calling toISOString() (which would shift by the runtime's zone).
function toLocalIso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

function isUsableCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0) // Null Island — stripped, not real
  );
}

const VIDEO_EXT = /\.(mov|mp4|m4v)$/i;
// iPhone MOVs put the moov atom (where the metadata lives) at the END of the
// file, after gigabytes of mdat. Read both ends; never the middle.
const VIDEO_TAIL_BYTES = 1024 * 1024;
const VIDEO_HEAD_BYTES = 64 * 1024;

/**
 * Pull the two signals we need out of QuickTime/MP4 metadata bytes without a
 * full atom walk: Apple writes `com.apple.quicktime.creationdate` as ISO-8601
 * WITH the capture-local UTC offset ("2026-08-07T21:14:32-0700") — the naive
 * part IS the local wall-clock our night-clustering wants — and location as an
 * ISO-6709 string ("+37.7797-122.4136+011.028/"). Both are plain ASCII inside
 * moov, and both formats are specific enough that a match in binary noise is
 * implausible. Exported for tests.
 */
function findQuickTimeSignals(text) {
  const out = { takenAt: null };
  const date = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?[+-]\d{2}:?\d{2}/);
  if (date) out.takenAt = date[1];
  const gps = text.match(/([+-]\d{1,2}\.\d{3,})([+-]\d{1,3}\.\d{3,})(?:[+-]\d+\.?\d*)?\//);
  if (gps) {
    const latitude = Number(gps[1]);
    const longitude = Number(gps[2]);
    if (isUsableCoordinate(latitude, longitude)) {
      out.latitude = latitude;
      out.longitude = longitude;
    }
  }
  return out;
}

async function readVideoMetadata(file) {
  const result = { name: file?.name, takenAt: null };
  try {
    const head = await file.slice(0, VIDEO_HEAD_BYTES).arrayBuffer();
    const tailStart = Math.max(0, file.size - VIDEO_TAIL_BYTES);
    const tail = tailStart > 0 ? await file.slice(tailStart).arrayBuffer() : null;
    const decoder = new TextDecoder("latin1");
    // Tail first: that is where an iPhone's moov actually lives.
    for (const buffer of [tail, head]) {
      if (!buffer) continue;
      const found = findQuickTimeSignals(decoder.decode(buffer));
      if (found.takenAt) {
        Object.assign(result, found);
        return result;
      }
    }
  } catch {
    // Unreadable container — fall through to the file date below.
  }
  if (Number.isFinite(file?.lastModified)) {
    result.takenAt = toLocalIso(new Date(file.lastModified));
  }
  return result;
}

/**
 * Read one picked file into `{ takenAt, latitude?, longitude?, name }`.
 *
 * Degradation ladder, in order: exifr (HEIC + JPEG, date + GPS) → the
 * dependency-free JPEG parser → the file's lastModified timestamp. A photo that
 * lost its GPS in transit (WhatsApp, iOS Safari's picker) still matches on
 * date — GPS is a confidence boost, never a requirement.
 */
async function readPhotoMetadata(file) {
  // A concert night is filmed more than it is photographed; a video carries
  // the same date+GPS evidence, just in QuickTime atoms instead of EXIF.
  if (VIDEO_EXT.test(file?.name ?? "")) return readVideoMetadata(file);
  const result = { name: file?.name, takenAt: null };

  try {
    const exifr = await loadExifr();
    const parsed = await exifr?.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "latitude", "longitude"],
    });
    if (parsed) {
      result.takenAt =
        toLocalIso(parsed.DateTimeOriginal) ??
        toLocalIso(parsed.CreateDate) ??
        toLocalIso(parsed.ModifyDate);
      if (isUsableCoordinate(parsed.latitude, parsed.longitude)) {
        result.latitude = parsed.latitude;
        result.longitude = parsed.longitude;
      }
    }
  } catch {
    // Unsupported container or truncated metadata — fall through.
  }

  if (!result.takenAt) {
    try {
      const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
      result.takenAt = extractExifDate(head);
    } catch {
      result.takenAt = null;
    }
  }

  // Last resort: EXIF-free exports and screenshots still have a file date.
  if (!result.takenAt && Number.isFinite(file?.lastModified)) {
    result.takenAt = toLocalIso(new Date(file.lastModified));
  }

  return result;
}

/** Read a whole picked selection, dropping files we could not date at all. */
async function readCameraRoll(files) {
  const list = [...(files ?? [])];
  const photos = await Promise.all(list.map((file) => readPhotoMetadata(file)));
  return photos.filter((photo) => Boolean(photo.takenAt));
}

/** Scan health, for the UI and the "why did nothing match?" explanation. */
function summarizeRoll(photos) {
  const total = photos.length;
  const geotagged = photos.filter((photo) =>
    isUsableCoordinate(photo.latitude, photo.longitude),
  ).length;
  return { total, geotagged, withoutLocation: total - geotagged };
}

export { findQuickTimeSignals, readCameraRoll, readPhotoMetadata, summarizeRoll, toLocalIso };
