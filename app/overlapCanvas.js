// The taste-overlap card — the only card that names a second person.
//
// That is the whole point of it: a recap gets posted to an audience, but a card
// with someone else's handle on it gets SENT to that someone. It is the one
// share in this app with a named recipient, which is what makes it a loop
// rather than a broadcast.
//
// It also means this is the card with a privacy rule, and the rule is the one
// already written down for the peer surfaces: **match strength and shared
// artist names only — never the other person's diary.** Nothing here reaches
// for their ratings, their venues, or the nights they went to without you.

import { CARD_CTA, CARD_THEME, RECAP_FORMATS, wrapLines } from "./recapCanvas.js";

const { INK, CREAM, MUTED, ORANGE, GREEN, PAD, DISPLAY, SANS } = CARD_THEME;

function cleanHandle(value) {
  return String(value ?? "").trim().replace(/^@+/, "");
}

// Counting and copy, pure, so the card and the screen cannot disagree.
function buildOverlapStory({ mine, theirs, matchPercent, sharedArtists, sharedShowCount } = {}) {
  const me = cleanHandle(mine);
  const them = cleanHandle(theirs);
  const percent = Math.max(0, Math.min(100, Math.round(Number(matchPercent) || 0)));

  // A card that names someone needs to name them. Without the other handle
  // there is no recipient and no loop, so there is no card.
  if (!them) return { empty: true };

  const names = (Array.isArray(sharedArtists) ? sharedArtists : [])
    .map((artist) => (typeof artist === "string" ? artist : artist?.name))
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  const shows = Math.max(0, Math.round(Number(sharedShowCount) || 0));
  const pair = me ? `@${me} + @${them}` : `@${them}`;

  const shareText = me
    ? `@${me} and @${them} hear music the same way — ${percent}% taste overlap.`
    : `${percent}% taste overlap with @${them}.`;

  return {
    empty: false,
    me,
    them,
    pair,
    percent,
    names,
    shows,
    headline: "We hear music the same way",
    shareText,
  };
}

function overlapFilename(theirs, format) {
  const safe = cleanHandle(theirs).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `showtonic-overlap-${safe || "match"}-${format}.png`;
}

function drawOverlap(ctx, { story, format = "story" }) {
  const shape = RECAP_FORMATS[format] ?? RECAP_FORMATS.story;
  const { width, height } = shape;
  const square = format === "square";

  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, width, height);

  const measure = (text) => ctx.measureText(text).width;
  const inner = width - PAD * 2;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  let y = square ? 130 : 190;
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = ORANGE;
  ctx.fillText("TASTE OVERLAP", PAD, y);

  // The pair, before the number: the card is about two people, and the reader
  // should know whose card it is before they know how strong it is.
  y += square ? 68 : 82;
  ctx.font = `400 ${square ? 36 : 42}px ${SANS}`;
  ctx.fillStyle = MUTED;
  for (const line of wrapLines(story.pair, inner, measure, 2)) {
    ctx.fillText(line, PAD, y);
    y += square ? 48 : 56;
  }

  // The numeral is set at 190-250px, and a baseline is not a top edge: it
  // ascends most of its own size ABOVE the y it is drawn at. Advancing by a
  // guessed gap put it straight through the pair of handles above — measured
  // in a browser, invisible to a recording context, and the second time this
  // lane has shipped exactly that mistake.
  //
  // So ask the font. `actualBoundingBoxAscent` is undefined on the test
  // double, which falls back to a conservative fraction of the size.
  const numeralSize = square ? 190 : 250;
  ctx.font = `600 ${numeralSize}px ${DISPLAY}`;
  ctx.fillStyle = GREEN;
  const percent = `${story.percent}%`;
  const ascent = ctx.measureText(percent).actualBoundingBoxAscent || numeralSize * 0.78;
  y += (square ? 26 : 36) + ascent;
  ctx.fillText(percent, PAD, y);

  y += square ? 80 : 100;
  ctx.font = `600 ${square ? 56 : 68}px ${DISPLAY}`;
  ctx.fillStyle = CREAM;
  for (const line of wrapLines(story.headline, inner, measure, 2)) {
    ctx.fillText(line, PAD, y);
    y += square ? 66 : 80;
  }

  // Shared artists — the receipts. Named, because a percentage on its own is
  // a claim and three names are evidence.
  if (story.names.length) {
    // Centred in the space between the headline and the invitation, for the
    // same reason as the reclaim card: this list is capped at three names, so
    // top-flowing it left a void on EVERY overlap card. Invisible to a
    // geometry probe, obvious in the exported image.
    const headerHeight = square ? 56 + 50 : 72 + 60;
    const rowHeight = square ? 52 : 62;
    const blockHeight = headerHeight + story.names.length * rowHeight + (story.shows > 0 ? 40 : 0);
    const gapTop = y + (square ? 20 : 34);
    const gapBottom = height - (square ? 150 : 190) - (square ? 70 : 90);
    y = gapTop + Math.max(0, (gapBottom - gapTop - blockHeight) / 2);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(PAD, y, inner, 2);
    y += square ? 56 : 72;

    ctx.font = `700 24px ${SANS}`;
    ctx.fillStyle = ORANGE;
    ctx.fillText("BOTH OF US HAVE SEEN", PAD, y);
    y += square ? 50 : 60;

    const lineHeight = square ? 52 : 62;
    const floor = height - (square ? 220 : 280);
    ctx.font = `600 ${square ? 38 : 44}px ${DISPLAY}`;
    for (const name of story.names) {
      if (y > floor) break;
      ctx.fillStyle = CREAM;
      const [clipped] = wrapLines(name, inner, measure, 1);
      ctx.fillText(clipped ?? "", PAD, y);
      y += lineHeight;
    }

    if (story.shows > 0 && y <= floor) {
      ctx.font = `400 ${square ? 28 : 32}px ${SANS}`;
      ctx.fillStyle = MUTED;
      const nights = `${story.shows} ${story.shows === 1 ? "night" : "nights"} we were both in the room`;
      ctx.fillText(nights, PAD, y + 8);
    }
  }

  const ctaY = height - (square ? 150 : 190);
  ctx.font = `400 ${square ? 30 : 34}px ${SANS}`;
  ctx.fillStyle = GREEN;
  for (const [index, line] of wrapLines(CARD_CTA, inner, measure, 2).entries()) {
    ctx.fillText(line, PAD, ctaY + index * (square ? 40 : 44));
  }

  ctx.font = `400 28px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(story.me ? `@${story.me}` : "", PAD, height - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = ORANGE;
  ctx.fillText("showtonic", width - PAD, height - PAD);
  ctx.textAlign = "left";
  ctx.restore();

  return shape;
}

export { buildOverlapStory, drawOverlap, overlapFilename };
