// Browser-side backfill helpers (designs 07–11, 17).
//
// The scoring engine itself lives in `convex/backfillMatch.js` so the browser
// scan and the agent-facing `reclaim_camera_roll` tool score identically; it is
// re-exported here so existing callers keep one import. What stays in this file
// is browser-only: the fallback EXIF parser and the demo camera roll.
//
// Photo bytes never leave the device — only cluster metadata and evidence
// strings reach Convex. See docs/agent-hack/ARCHITECTURE.md.

export {
  MIN_CLUSTER_PHOTOS,
  MIN_CONFIDENCE,
  VENUE_NEAR_METERS,
  clusterPhotosIntoNights,
  describeConfidence,
  describeDistance,
  describeReclaimSpan,
  formatCaptureWindow,
  haversineMeters,
  locateCluster,
  matchClustersToShows,
  nightDateOf,
  unmatchedClusters,
} from "../convex/backfillMatch.js";

// ---------------------------------------------------------------------------
// EXIF fallback — minimal JPEG APP1/TIFF parser for DateTimeOriginal (0x9003).
//
// `app/photoMeta.js` uses exifr (HEIC + GPS) as the primary reader; this stays
// as the dependency-free fallback for plain JPEGs when exifr cannot parse a
// file. Returns an ISO-like "YYYY-MM-DDTHH:MM:SS" string or null.
// ---------------------------------------------------------------------------
function extractExifDate(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null; // not JPEG

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      const size = view.getUint16(offset + 2);
      if ((marker & 0xff00) !== 0xff00) return null;
      if (marker === 0xffe1) {
        // APP1: check "Exif\0\0"
        if (
          view.getUint32(offset + 4) === 0x45786966 && // "Exif"
          view.getUint16(offset + 8) === 0x0000
        ) {
          return parseTiffForDate(view, offset + 10);
        }
      }
      offset += 2 + size;
    }
  } catch {
    // Malformed EXIF is expected in the wild — treat as no data.
  }
  return null;
}

function parseTiffForDate(view, tiffStart) {
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949; // "II"
  if (!little && byteOrder !== 0x4d4d) return null;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  if (u16(tiffStart + 2) !== 42) return null;

  const readIfd = (ifdOffset, wantedTag) => {
    const count = u16(tiffStart + ifdOffset);
    for (let index = 0; index < count; index += 1) {
      const entry = tiffStart + ifdOffset + 2 + index * 12;
      if (u16(entry) === wantedTag) return entry;
    }
    return null;
  };

  const ifd0 = u32(tiffStart + 4);
  const exifPointerEntry = readIfd(ifd0, 0x8769);
  let dateEntry = null;
  if (exifPointerEntry !== null) {
    const exifIfd = u32(exifPointerEntry + 8);
    dateEntry = readIfd(exifIfd, 0x9003); // DateTimeOriginal
  }
  if (dateEntry === null) dateEntry = readIfd(ifd0, 0x0132); // fallback: DateTime
  if (dateEntry === null) return null;

  const valueOffset = tiffStart + u32(dateEntry + 8);
  let raw = "";
  for (let index = 0; index < 19 && valueOffset + index < view.byteLength; index += 1) {
    raw += String.fromCharCode(view.getUint8(valueOffset + index));
  }
  // "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SS"
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}

// ---------------------------------------------------------------------------
// Demo camera roll — fabricate a plausible roll from real past catalog shows so
// the flow can be demonstrated without granting file access. Deterministic:
// no RNG, same input → same output (the test asserts this).
// ---------------------------------------------------------------------------
function buildDemoCameraRoll(shows, options = {}) {
  const today = options.today ?? "9999-12-31";
  const limit = options.limit ?? 6;
  const pastShows = (Array.isArray(shows) ? shows : [])
    .filter((show) => typeof show.date === "string" && show.date < today)
    .sort((left, right) => right.date.localeCompare(left.date));

  // Spread picks across the archive so the reclaim spans multiple months.
  const step = Math.max(1, Math.floor(pastShows.length / limit));
  const picked = [];
  for (let index = 0; index < pastShows.length && picked.length < limit; index += step) {
    picked.push(pastShows[index]);
  }

  const photos = [];
  for (const show of picked) {
    const count = 3 + ((show.date.charCodeAt(9) + show.date.charCodeAt(8)) % 6); // 3–8 photos
    const latitude = show.venueLatitude ?? show.latitude;
    const longitude = show.venueLongitude ?? show.longitude;
    const hasVenueGps = Number.isFinite(latitude) && Number.isFinite(longitude);
    for (let index = 0; index < count; index += 1) {
      const minutes = String((7 * index) % 60).padStart(2, "0");
      const hour = index < count - 1 ? String(21 + (index % 3)) : "23";
      const photo = {
        name: `IMG_${show.date.replaceAll("-", "")}_${index}.jpg`,
        takenAt: `${show.date}T${hour}:${minutes}:00`,
      };
      if (hasVenueGps) {
        // Scatter deterministically inside ~60 m of the venue so the demo roll
        // exercises the GPS evidence path the same way real photos do.
        const jitter = ((index % 5) - 2) * 0.00012; // ~13 m per step
        photo.latitude = Number((latitude + jitter).toFixed(6));
        photo.longitude = Number((longitude - jitter).toFixed(6));
      }
      photos.push(photo);
    }
  }
  return photos;
}

export { buildDemoCameraRoll, extractExifDate };
