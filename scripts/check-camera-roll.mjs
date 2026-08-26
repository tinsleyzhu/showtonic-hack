#!/usr/bin/env node
// Prep task P1 — the single highest-risk unknown before the hackathon:
// do YOUR photos actually carry a date and a location?
//
//   npm run scan:check -- ~/Desktop/rave-photos
//
// Reads a folder with exifr exactly the way the browser scan does, then reports
// what fraction of photos yielded a timestamp, what fraction yielded GPS, and
// which nights they cluster into. Nothing is uploaded and nothing is written —
// this only reads files and prints a summary.
//
// If GPS coverage comes back at 0%, the demo still works (date-only matching,
// v1 behaviour) but the crowded-night win disappears. Better to learn that now
// than at 3 PM on the day.

import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import exifr from "exifr";

import { clusterPhotosIntoNights } from "../convex/backfillMatch.js";

const PHOTO_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".heic",
  ".heif",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
  ".dng",
  ".mov",
  ".mp4",
]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function toLocalIso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

async function listPhotos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPhotos(path)));
    } else if (PHOTO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }
  return files;
}

async function readOne(path) {
  const result = { name: basename(path), takenAt: null, source: "none" };
  try {
    const parsed = await exifr.parse(path, {
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
      if (result.takenAt) result.source = "exif";
      if (
        Number.isFinite(parsed.latitude) &&
        Number.isFinite(parsed.longitude) &&
        !(parsed.latitude === 0 && parsed.longitude === 0)
      ) {
        result.latitude = parsed.latitude;
        result.longitude = parsed.longitude;
      }
    }
  } catch {
    // Unsupported container (some .mov) — fall through to the file date.
  }

  if (!result.takenAt) {
    const info = await stat(path);
    result.takenAt = toLocalIso(info.mtime);
    result.source = "file-date";
  }
  return result;
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: npm run scan:check -- <folder-of-photos>");
  process.exit(1);
}

const dir = resolve(target);
const files = await listPhotos(dir);

if (!files.length) {
  console.error(`No photos found under ${dir}`);
  process.exit(1);
}

console.log(`Reading ${files.length} files from ${dir}\n`);
const photos = [];
for (const file of files) photos.push(await readOne(file));

const withExifDate = photos.filter((photo) => photo.source === "exif").length;
const geotagged = photos.filter((photo) => photo.latitude !== undefined).length;
const heic = files.filter((file) => /\.hei[cf]$/i.test(file)).length;
const percent = (count) => `${Math.round((count / photos.length) * 100)}%`;

console.log("PHOTO METADATA");
console.log(`  files read              ${photos.length}`);
console.log(`  HEIC files              ${heic}`);
console.log(`  real EXIF timestamp     ${withExifDate}  (${percent(withExifDate)})`);
console.log(`  fell back to file date  ${photos.length - withExifDate}`);
console.log(`  GPS coordinates         ${geotagged}  (${percent(geotagged)})`);

const clusters = clusterPhotosIntoNights(photos);
console.log(`\nNIGHT CLUSTERS (evening photos, 3+ per night)`);
if (!clusters.length) {
  console.log("  none — no evening photo groups of 3 or more.");
} else {
  for (const cluster of clusters) {
    const where = cluster.gps
      ? `${cluster.gps.latitude.toFixed(4)}, ${cluster.gps.longitude.toFixed(4)} (${cluster.gps.sampleCount} geotagged)`
      : "no location";
    console.log(
      `  ${cluster.clusterDate}  ${String(cluster.photoCount).padStart(3)} photos  ${cluster.captureWindow.padEnd(18)} ${where}`,
    );
  }
}

console.log("\nVERDICT");
if (withExifDate === 0) {
  console.log("  ⚠️  No real EXIF timestamps. These are probably shared/re-saved copies.");
  console.log("      Export originals from Photos.app (File → Export → Export Unmodified Original).");
} else if (geotagged === 0) {
  console.log("  ⚠️  Timestamps yes, GPS no. Date-only matching will work; the crowded-night");
  console.log("      win will not. Check Photos.app export has 'Include location info' ticked,");
  console.log("      and that Location Services was on for Camera when these were taken.");
} else if (clusters.length === 0) {
  console.log("  ⚠️  Metadata is fine but nothing clustered. Need 3+ photos from one evening");
  console.log("      (after 5 PM). Pick a folder with a real night in it.");
} else {
  console.log(`  ✅ Ready. ${clusters.length} night${clusters.length === 1 ? "" : "s"} to reclaim,`);
  console.log(`      ${percent(geotagged)} geotagged. The GPS signal will work on this set.`);
  console.log("      Next: confirm the catalog covers these cities and dates.");
}
console.log("");
