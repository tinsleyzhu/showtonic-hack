// The reclaim story card — the one share where the AGENT is the subject.
//
// Every other card in this app is a summary of what the person did: shows
// counted, artists ranked, a diary. This one is a summary of what the software
// did FOR them, and that is the novel object. "My agent rebuilt 14 nights I
// never logged" is a sentence nobody can post from any other app, because no
// other app did the archaeology.
//
// Same pipeline as the recap: canvas 2D, the shared paint box, no CDN font, no
// auto-post. New copy layer, nothing else.

import { CARD_CTA, CARD_THEME, RECAP_FORMATS, wrapLines } from "./recapCanvas.js";

const { INK, CREAM, MUTED, ORANGE, GREEN, PAD, DISPLAY, SANS } = CARD_THEME;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2019-03-14" -> "March 2019". Parsed by hand rather than through Date, which
// would shift the month backwards for anyone west of UTC on the 1st.
function monthYear(date) {
  const match = /^(\d{4})-(\d{2})/.exec(String(date ?? ""));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${match[1]}` : "";
}

// Counting only. Everything the card says is derived here so the screen and the
// image can never disagree, and so the copy is testable without a canvas.
//
// `nights` is what the person just confirmed in this session — client-side
// state BackfillFlow already holds. Nothing is read back from the server and no
// provenance column is invented.
function buildReclaimStory(nights, options = {}) {
  const rows = (Array.isArray(nights) ? nights : []).filter((row) => row && row.clusterDate);
  const handle = String(options.handle ?? "").replace(/^@+/, "");

  if (rows.length === 0) {
    // Nothing confirmed is not a story. The card must not exist.
    return { empty: true, nights: 0, handle };
  }

  const dates = rows.map((row) => String(row.clusterDate)).sort();
  const oldest = dates[0];
  const oldestLabel = monthYear(oldest);

  // The acts, most-seen first, for the strip under the number. Ties keep the
  // order they were confirmed in.
  const counts = new Map();
  for (const row of rows) {
    const name = (row.artistNames?.[0] ?? row.showTitle ?? "").trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

  const nightWord = rows.length === 1 ? "night" : "nights";
  return {
    empty: false,
    handle,
    nights: rows.length,
    oldest,
    oldestLabel,
    names,
    headline: `${rows.length} ${nightWord} I never logged`,
    // The brief's shape, kept as the share text so the caption and the image
    // say the same thing.
    shareText: oldestLabel
      ? `My agent rebuilt ${rows.length} ${nightWord} I never logged. Oldest: ${oldestLabel}.`
      : `My agent rebuilt ${rows.length} ${nightWord} I never logged.`,
  };
}

function reclaimFilename(handle, format) {
  const safe = String(handle || "reclaim").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `showtonic-reclaimed-${safe || "reclaim"}-${format}.png`;
}

// Paints the card. Takes any 2D-context-shaped object, which is what makes this
// testable at all — same contract as drawRecap.
function drawReclaim(ctx, { story, format = "story" }) {
  const shape = RECAP_FORMATS[format] ?? RECAP_FORMATS.story;
  const { width, height } = shape;

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  const measure = (text) => ctx.measureText(text).width;
  const inner = width - PAD * 2;
  const square = format === "square";

  // --- Who did this ---------------------------------------------------------
  let y = square ? 130 : 190;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = ORANGE;
  ctx.fillText("MY AGENT WENT LOOKING", PAD, y);

  // --- The number -----------------------------------------------------------
  // The count is the whole poster. It is set at a size that reads at thumbnail
  // scale in a story tray, which is the only size most people will ever see.
  // Measured, not guessed: a baseline is not a top edge, and a 260px numeral
  // ascends most of its own size above the y it is painted at. The overlap
  // card shipped a collision here that a recording context could not see, so
  // both cards now ask the font. The fallback covers the test double, whose
  // measureText reports width only.
  const numeralSize = square ? 200 : 260;
  const numeral = String(story.nights);
  ctx.font = `600 ${numeralSize}px ${DISPLAY}`;
  ctx.fillStyle = GREEN;
  y += (square ? 28 : 38) + (ctx.measureText(numeral).actualBoundingBoxAscent || numeralSize * 0.78);
  ctx.fillText(numeral, PAD, y);

  const numeralWidth = measure(numeral);
  ctx.font = `700 28px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("REBUILT FROM MY CAMERA ROLL", PAD + numeralWidth + 28, y - 12);

  // --- The claim ------------------------------------------------------------
  y += square ? 96 : 120;
  ctx.font = `600 ${square ? 62 : 76}px ${DISPLAY}`;
  ctx.fillStyle = CREAM;
  for (const line of wrapLines(story.headline, inner, measure, 2)) {
    ctx.fillText(line, PAD, y);
    y += square ? 72 : 88;
  }

  if (story.oldestLabel) {
    ctx.font = `400 ${square ? 32 : 38}px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`Oldest: ${story.oldestLabel}`, PAD, y + 4);
    y += square ? 60 : 70;
  }

  // --- The acts -------------------------------------------------------------
  // Named, because "14 nights" is a statistic and "Fred again.., MUNA, Jamie
  // xx" is a life. Capped by what fits rather than by a magic number.
  const rows = story.names ?? [];
  if (rows.length) {
    // Centre this block in the space between the claim and the invitation.
    //
    // Top-flowing it left a large void on any card with only a night or two,
    // which is the common case and the one a first-time member sees. The
    // geometry probe cannot see that: nothing overlapped and nothing left the
    // canvas, it was simply badly balanced, and it took a human looking at the
    // exported PNG to notice.
    const headerHeight = square ? 58 + 50 : 74 + 60;
    const rowHeight = square ? 52 : 62;
    const blockHeight = headerHeight + rows.length * rowHeight + (story.shows > 0 ? 40 : 0);
    const gapTop = y + (square ? 24 : 40);
    const gapBottom = height - (square ? 150 : 190) - (square ? 70 : 90);
    y = gapTop + Math.max(0, (gapBottom - gapTop - blockHeight) / 2);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(PAD, y, inner, 2);
    y += square ? 58 : 74;

    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = ORANGE;
    ctx.fillText("NIGHTS I GOT BACK", PAD, y);
    y += square ? 50 : 60;

    const lineHeight = square ? 52 : 62;
    const floor = height - (square ? 220 : 280);
    ctx.font = `600 ${square ? 38 : 44}px ${DISPLAY}`;
    for (const name of rows) {
      if (y > floor) break;
      ctx.fillStyle = CREAM;
      const [clipped] = wrapLines(name, inner, measure, 1);
      ctx.fillText(clipped ?? "", PAD, y);
      y += lineHeight;
    }
  }

  // --- The invitation -------------------------------------------------------
  // Anchored to the bottom rather than following the flow: it is the one line
  // that must survive every length of card above it.
  const ctaY = height - (square ? 150 : 190);
  ctx.font = `400 ${square ? 30 : 34}px ${SANS}`;
  ctx.fillStyle = GREEN;
  for (const [index, line] of wrapLines(CARD_CTA, inner, measure, 2).entries()) {
    ctx.fillText(line, PAD, ctaY + index * (square ? 40 : 44));
  }

  // --- Footer ---------------------------------------------------------------
  ctx.font = `400 28px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(story.handle ? `@${story.handle}` : "", PAD, height - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = ORANGE;
  ctx.fillText("showtonic", width - PAD, height - PAD);
  ctx.textAlign = "left";
  ctx.restore();

  return shape;
}

export { buildReclaimStory, drawReclaim, monthYear, reclaimFilename };
