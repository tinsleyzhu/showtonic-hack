// Recap export — painting the recap to a downloadable image.
//
// Canvas 2D and nothing else. No chart library, no html2canvas, no CDN font:
// the app's display face is a system serif stack (`--font-display` in
// globals.css is Iowan Old Style / Palatino / Georgia), so the export looks
// like the app without loading a byte from anywhere.
//
// The geometry and the text layout live here as pure functions so they can be
// tested without a browser; `drawRecap` takes any 2D-context-shaped object,
// which is what makes the tests possible at all.

// Story and square, the two shapes a person actually posts.
const RECAP_FORMATS = {
  story: { width: 1080, height: 1920, heroHeight: 1080, label: "Story 9:16" },
  square: { width: 1080, height: 1080, heroHeight: 520, label: "Square 1:1" },
};

const INK = "#0a0908";
const CREAM = "#f4efe6";
const MUTED = "#8A8177";
const ORANGE = "#FF7A50";
const GREEN = "#4EC98F";
const PAD = 72;

const DISPLAY = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const SANS = '-apple-system, "Helvetica Neue", Arial, sans-serif';

// object-fit: cover, as source-rectangle arithmetic. Returns the crop of the
// image to draw so it fills the box without distorting — a squashed hero is
// the single most obvious tell that an image was machine-generated.
function coverRect(sourceWidth, sourceHeight, boxWidth, boxHeight) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
    return { sx: 0, sy: 0, sWidth: sourceWidth || 0, sHeight: sourceHeight || 0 };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = boxWidth / boxHeight;
  if (sourceRatio > boxRatio) {
    // Source is wider than the box: keep full height, crop the sides.
    const sWidth = sourceHeight * boxRatio;
    return { sx: (sourceWidth - sWidth) / 2, sy: 0, sWidth, sHeight: sourceHeight };
  }
  const sHeight = sourceWidth / boxRatio;
  return { sx: 0, sy: (sourceHeight - sHeight) / 2, sWidth: sourceWidth, sHeight };
}

// Greedy word wrap against a measuring function. A word longer than the line
// is left on its own line rather than dropped — an over-long artist name should
// overflow visibly, not silently disappear from someone's recap.
function wrapLines(text, maxWidth, measure, maxLines = Infinity) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]$/, "")}…`;
  return kept;
}

function recapFilename(handle, format) {
  const safe = String(handle ?? "recap").replace(/[^a-z0-9_-]+/gi, "").toLowerCase() || "recap";
  return `showtonic-recap-${safe}-${format}.png`;
}

// Paints the whole card. `images` is a map of url -> a drawable image (already
// loaded and same-origin-safe); anything missing is simply not drawn, which is
// how a cross-origin photo that refused to load degrades: the export still
// happens, without that photo, rather than throwing.
function drawRecap(ctx, { recap, format = "story", images = new Map() } = {}) {
  const shape = RECAP_FORMATS[format] ?? RECAP_FORMATS.story;
  const { width, height, heroHeight } = shape;
  const measure = (text) => ctx.measureText(text).width;

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  // --- Hero -----------------------------------------------------------------
  const hero = firstDrawable(recap, images);
  if (hero) {
    const crop = coverRect(hero.width, hero.height, width, heroHeight);
    ctx.drawImage(hero, crop.sx, crop.sy, crop.sWidth, crop.sHeight, 0, 0, width, heroHeight);
  } else {
    ctx.fillStyle = "#1A1713";
    ctx.fillRect(0, 0, width, heroHeight);
  }
  // Scrim, so the headline is legible over any photo rather than only over the
  // dark ones.
  const scrim = ctx.createLinearGradient(0, heroHeight - 420, 0, heroHeight);
  scrim.addColorStop(0, "rgba(10,9,8,0)");
  scrim.addColorStop(1, INK);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, heroHeight - 420, width, 420);

  // --- Headline -------------------------------------------------------------
  let y = heroHeight - 40;
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 84px ${DISPLAY}`;
  ctx.fillStyle = CREAM;
  const headlineLines = wrapLines(recap.headline, width - PAD * 2, measure, 2);
  y -= (headlineLines.length - 1) * 92;
  for (const line of headlineLines) {
    ctx.fillText(line, PAD, y);
    y += 92;
  }

  if (recap.spanLine) {
    ctx.font = `400 34px ${SANS}`;
    ctx.fillStyle = MUTED;
    for (const line of wrapLines(recap.spanLine, width - PAD * 2, measure, 2)) {
      ctx.fillText(line, PAD, y + 8);
      y += 44;
    }
  }

  // --- Stats ----------------------------------------------------------------
  y = heroHeight + 96;
  const stats = [
    { label: "shows", value: String(recap.shows) },
    { label: "artists", value: String(recap.artists) },
    { label: "venues", value: String(recap.venues) },
  ];
  const column = (width - PAD * 2) / stats.length;
  stats.forEach((stat, index) => {
    const centre = PAD + column * index + column / 2;
    ctx.textAlign = "center";
    ctx.font = `600 76px ${DISPLAY}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(stat.value, centre, y);
    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(stat.label.toUpperCase(), centre, y + 42);
  });
  ctx.textAlign = "left";
  y += 110;

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(PAD, y, width - PAD * 2, 2);
  y += 72;

  // --- Top artists ----------------------------------------------------------
  const rows = (recap.topArtists ?? []).slice(0, format === "story" ? 5 : 3);
  if (rows.length) {
    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = ORANGE;
    ctx.fillText("MOST SEEN", PAD, y);
    y += 54;
    rows.forEach((row, index) => {
      ctx.font = `600 44px ${DISPLAY}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(`${index + 1}`, PAD, y);
      ctx.fillStyle = CREAM;
      const [name] = wrapLines(row.name, width - PAD * 2 - 220, measure, 1);
      ctx.fillText(name ?? "", PAD + 56, y);
      ctx.font = `400 30px ${SANS}`;
      ctx.fillStyle = MUTED;
      ctx.textAlign = "right";
      ctx.fillText(`${row.count}`, width - PAD, y);
      ctx.textAlign = "left";
      y += 62;
    });
    y += 24;
  }

  // --- Best night -----------------------------------------------------------
  if (recap.highestRated && y < height - 260) {
    ctx.fillStyle = GREEN;
    ctx.fillRect(PAD, y - 34, 4, 96);
    ctx.font = `700 24px ${SANS}`;
    ctx.fillText("BEST NIGHT", PAD + 28, y);
    ctx.font = `400 34px ${SANS}`;
    ctx.fillStyle = CREAM;
    const best = recap.highestRated.venueName
      ? `${recap.highestRated.title} · ${recap.highestRated.venueName}`
      : recap.highestRated.title;
    let bestY = y + 46;
    for (const line of wrapLines(best, width - PAD * 2 - 28, measure, 2)) {
      ctx.fillText(line, PAD + 28, bestY);
      bestY += 44;
    }
    y = bestY + 20;
  }

  // --- Footer ---------------------------------------------------------------
  ctx.font = `400 28px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(`@${recap.handle ?? ""}`, PAD, height - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = ORANGE;
  ctx.fillText("showtonic", width - PAD, height - PAD);
  ctx.textAlign = "left";
  ctx.restore();

  return shape;
}

function firstDrawable(recap, images) {
  for (const photo of recap.photos ?? []) {
    const image = images.get(photo.url);
    if (image) return image;
  }
  const fallback = recap.heroImage ? images.get(recap.heroImage) : null;
  return fallback ?? null;
}

export { coverRect, drawRecap, RECAP_FORMATS, recapFilename, wrapLines };
