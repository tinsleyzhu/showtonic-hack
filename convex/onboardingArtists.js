// Which artists to offer a member during onboarding.
//
// The first version weighted by city (home ×4, elsewhere ×1) and did not
// filter. Weighting is the right tool for ranking people WITHIN a city and the
// wrong tool for deciding whether to show someone at all, and the catalog made
// that concrete: the New York Philharmonic has 234 upcoming New York shows and
// zero in San Francisco. 234 × 1 beats any 4× multiplier an SF artist could
// earn — they would need 59 upcoming SF shows — so the orchestra topped the
// list for San Franciscans permanently, as an artist they could not go and see
// if they wanted to.
//
// So: when we know the member's city, PRESENCE is a gate, not a bonus. Rank
// the survivors afterwards. When we do not know it, fall back to the global
// ranking — that is the honest degraded state, not a broken one.

function normalize(value) {
  return tidy(value).toLowerCase();
}

// Display form: the catalog has names with leading spaces ("  Live Band
// Country Karaoke") and doubled inner spaces, straight from the listing feeds.
function tidy(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// The catalog's "artists" are whatever the listing feeds put in the artist
// slot, and some of them are not people. A San Franciscan opening the picker
// today is offered "Karaoke Tuesday" first and "Open Mic Night" second,
// because a weekly night genuinely does have more upcoming dates than any
// touring act — the presence ranking is working, it is just ranking things
// that cannot answer the question the step asks ("artists you'd cross town to
// see").
//
// So this filters by the vocabulary of a recurring EVENT FORMAT, not by a
// blocklist of names. A room's karaoke night is not an artist in San
// Francisco or in Osaka; "Sofar Sounds NYC Secret Concert" is a series.
// Deliberately narrow: it hides cards in one picker and changes nothing else
// about the catalog, so a false positive costs one suggestion and a false
// negative costs a strange card. Bare weekday names are NOT a rule — the
// catalog holds "Sunday Saari" and "Ruby Tuesday" is a band.
const EVENT_FORMATS = [
  /\bkaraoke\b/,
  /\bopen mic\b/,
  /\bopen-mic\b/,
  /\bopen deck\b/,
  /\btrivia\b/,
  /\bbingo\b/,
  /\bbottomless brunch\b/,
  /\bhappy hour\b/,
  /\bsecret concert\b/,
  /\bsecret show\b/,
  /\bevery week\b/,
  /\bweekly\b/,
  /\bnightly\b/,
];

export function isEventNotAnArtist(name) {
  const value = normalize(name);
  return EVENT_FORMATS.some((pattern) => pattern.test(value));
}

// One card per artist.
//
// The same act arrives from more than one feed and lands as more than one row:
// two Becks, two Oseeses, two Courtney Barnetts, and in New York roughly half
// the grid. That is not only ugly. Selection in the picker is BY NAME, so
// tapping one Beck lights up both cards and still counts as one of the five
// picks — a member taps five faces and the counter says three.
//
// Merged on the casefolded name, which also settles "Vince Giordano and the
// Nighthawks" against "...and The Nighthawks". Counts add up, because both
// rows describe the same person playing that many nights. The row with a
// picture wins the display name; a grid of letter-tiles is the thing the
// picture was for.
export function mergeArtistDuplicates(entries) {
  const byName = new Map();

  for (const entry of entries) {
    const key = normalize(entry.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { ...entry, name: tidy(entry.name) });
      continue;
    }
    const winner = betterRepresentative(existing, entry);
    byName.set(key, {
      ...winner,
      name: betterName(existing.name, entry.name),
      homeCityShows: (existing.homeCityShows ?? 0) + (entry.homeCityShows ?? 0),
      otherCityShows: (existing.otherCityShows ?? 0) + (entry.otherCityShows ?? 0),
    });
  }

  return [...byName.values()];
}

// The picture and the spelling are separate questions. A feed that ships
// "beck" in lower case may well be the row that also ships the photograph, and
// a member should not be offered a lower-case Beck because of it. Any capital
// beats none; when every variant is lower case we keep it, because
// "mary in the junkyard" spells itself that way on purpose.
function betterName(left, right) {
  const leftName = tidy(left);
  const rightName = tidy(right);
  const capitalised = (value) => /[A-Z]/.test(value);
  if (capitalised(leftName) === capitalised(rightName)) return leftName;
  return capitalised(leftName) ? leftName : rightName;
}

function betterRepresentative(left, right) {
  const score = (entry) => [entry.image ? 1 : 0, (entry.genres ?? []).length];
  const [leftImage, leftGenres] = score(left);
  const [rightImage, rightGenres] = score(right);
  if (rightImage !== leftImage) return rightImage > leftImage ? right : left;
  if (rightGenres !== leftGenres) return rightGenres > leftGenres ? right : left;
  return left;
}

/**
 * @param entries one per artist:
 *   { name, image?, genres?, homeCityShows, otherCityShows }
 *   where `homeCityShows` counts upcoming shows in the member's city.
 * @param options `homeCity` empty means the member skipped the step.
 */
export function rankOnboardingArtists(entries, options = {}) {
  const { homeCity = "", limit = 18 } = options;
  const scoped = normalize(homeCity).length > 0;

  return mergeArtistDuplicates(entries.filter((entry) => !isEventNotAnArtist(entry.name)))
    // The gate. An artist with nothing upcoming in your city is not a weak
    // suggestion, it is a wrong one.
    .filter((entry) => (scoped ? entry.homeCityShows > 0 : true))
    .map((entry) => ({
      ...entry,
      // Once everyone left is reachable, rank by how present they are: in your
      // city if we know it, in the catalog at large if we do not.
      rank: scoped ? entry.homeCityShows : entry.homeCityShows + entry.otherCityShows,
    }))
    .sort((left, right) => right.rank - left.rank || left.name.localeCompare(right.name))
    .slice(0, Math.max(1, Math.min(limit, 48)));
}
