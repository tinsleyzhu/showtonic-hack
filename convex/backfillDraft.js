// Draft-writer v1 — pure logic behind the pre-filled confirm sheet (designs
// 08–11, SPEC.md workstream B). No I/O, no Convex, no model call: everything
// here is a function of its arguments, so the app path (`backfill.saveCandidates`)
// and the agent path (`agents.reclaimCameraRoll`) draft identically and the
// eval harness can measure both.
//
// The discipline is the evidence card's, restated as prose: a caption may only
// restate facts already on the candidate (venue, date, capture window, photo
// count), and a vibe may only be a chip the human log sheet already renders.
// See docs/agent-hack/TEAM.md — copy written against an imagined state is the
// defect this module exists to avoid.

// The tap-only chips the human log sheet offers ("What did it feel like?",
// app/data.ts `vibes`, design 18). validateLogInput's VIBE_VOCABULARY
// (`convex/showtonicUtils.js`) is the server-side superset; a draft may only
// ever suggest a chip from the sheet itself, because a suggestion the human
// could not have tapped is not a suggestion — it is a fabrication wearing one.
const MAX_SUGGESTED_VIBES = 3;

// Genre families mapped to the chips they are honest evidence FOR. Genre tags
// are exact-matched case-insensitively against the show's own genre strings —
// the values below cover the catalog's ingested vocabulary (app/data.ts,
// convex/seedData.ts) plus the common spellings the ingesters return.
//
// Three chips are deliberately absent: "great sound", "too packed", and
// "surprise guest" are facts about the ROOM and the NIGHT — sound quality,
// crowd density, an unannounced guest — and no genre list is evidence for any
// of them. A genre can say what kind of music it was; only the night itself
// can say what happened in it. An empty mapping is the honest empty answer.
const VIBE_CHIP_GENRES = [
  {
    vibe: "danced nonstop",
    genres: [
      "amapiano",
      "club",
      "dance",
      "dance-pop",
      "dancehall",
      "disco",
      "drum and bass",
      "edm",
      "electro",
      "electropop",
      "footwork",
      "house",
      "deep house",
      "tech house",
      "hyperpop",
      "indie dance",
      "indie electronic",
      "jungle",
      "nu-disco",
      "techno",
      "uk garage",
    ],
  },
  {
    vibe: "transcendent",
    genres: [
      "ambient",
      "classical",
      "dream-pop",
      "dreampop",
      "drone",
      "experimental",
      "instrumental",
      "orchestral",
      "post-rock",
      "psychedelic",
      "shoegaze",
    ],
  },
];

// ---------------------------------------------------------------------------
// Vibes — genres → chips, in the sheet's own chip order
// ---------------------------------------------------------------------------

function suggestVibes(genres) {
  const present = new Set(
    (Array.isArray(genres) ? genres : [])
      .map((genre) => String(genre).trim().toLowerCase())
      .filter(Boolean),
  );
  if (!present.size) return [];
  return VIBE_CHIP_GENRES
    .filter((chip) => chip.genres.some((genre) => present.has(genre)))
    .map((chip) => chip.vibe)
    .slice(0, MAX_SUGGESTED_VIBES);
}

// ---------------------------------------------------------------------------
// Caption — the evidence card's facts, restated as one sentence
// ---------------------------------------------------------------------------

// "2026-06-27" → "Jun 27, 2026". Pinned to UTC and noon so the calendar day is
// the same in every runtime, and to the app's existing short-month style
// (BackfillFlow.longDate).
function formatShowDate(clusterDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(clusterDate ?? ""))) return "";
  const parsed = new Date(`${clusterDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

function captionFrom(candidate) {
  const show = candidate.show ?? null;
  const clauses = [];

  if (Number.isFinite(candidate.photoCount) && candidate.photoCount > 0) {
    const photoWord = candidate.photoCount === 1 ? "photo" : "photos";
    clauses.push(`${candidate.photoCount} ${photoWord}`);
  }
  if (candidate.captureWindow) clauses.push(`from ${candidate.captureWindow}`);
  if (show?.venueName) clauses.push(`at ${show.venueName}`);
  const when = formatShowDate(candidate.clusterDate);
  if (when) clauses.push(`on ${when}`);

  return clauses.length ? `${clauses.join(" ")}.` : "";
}

// ---------------------------------------------------------------------------
// Draft assembly
// ---------------------------------------------------------------------------

// candidate: { clusterDate, photoCount, captureWindow?, show?: { venueName?,
//              genres? } } → { caption, vibes }.
//
// Every caption clause names a field that exists on the candidate row; a fact
// that is not there is left out, never bridged with an adjective.
function writeDraft(candidate) {
  const source = candidate ?? {};
  return {
    caption: captionFrom({
      captureWindow: source.captureWindow,
      clusterDate: source.clusterDate,
      photoCount: source.photoCount,
      show: source.show ?? null,
    }),
    vibes: suggestVibes(source.show?.genres),
  };
}

// Server gap-fill: a caller's draft is kept field-by-field; anything it left
// unset is filled from writeDraft's deterministic answer, so every insert
// leaves with a complete draft whether or not the client wrote one. This is
// the seam that keeps the app and MCP paths identical — both fill from the
// same pure function.
function completeDraft(provided, computed) {
  return {
    caption: provided?.caption ?? computed?.caption ?? "",
    vibes: provided?.vibes ?? computed?.vibes ?? [],
  };
}

export { MAX_SUGGESTED_VIBES, VIBE_CHIP_GENRES, completeDraft, writeDraft };
