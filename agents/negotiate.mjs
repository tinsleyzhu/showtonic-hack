// Squad negotiation, as pure functions.
//
// Extracted from squad.mjs so the interesting cases — more than three agents,
// a group that has to split, and a night nobody can agree on — are testable
// without three live tokens and a deployed Worker.
//
// The design stance: refusing is a correct outcome. A negotiator that always
// returns a show is not negotiating, it is picking. So there are three
// outcomes here, and two of them are not "everyone goes out together".

// An agent's appetite for one show, from its human's real logged history.
// Genres are sparse until enrichment finishes, so artists and venues carry the
// weight — and a member with almost no diary should not be given false
// confidence, hence the lowSignal damping.
export function scoreShow(show, taste) {
  const artists = new Set((taste.topArtists ?? []).map((a) => a.name.toLowerCase()));
  const loved = new Set((taste.lovedArtists ?? []).map((a) => a.toLowerCase()));
  const venues = new Set((taste.topVenues ?? []).map((v) => v.name.toLowerCase()));
  const genres = new Set((taste.topGenres ?? []).map((g) => g.name.toLowerCase()));

  let points = 0;
  const because = [];
  for (const name of show.artists ?? []) {
    const key = String(name).toLowerCase();
    if (loved.has(key)) {
      points += 5;
      because.push(`${name} is one of my human's favourites`);
    } else if (artists.has(key)) {
      points += 3;
      because.push(`they've seen ${name} before`);
    }
  }
  if (show.venue && venues.has(show.venue.toLowerCase())) {
    points += 2;
    because.push(`${show.venue} is a room they keep going back to`);
  }
  if ((show.genres ?? []).some((g) => genres.has(String(g).toLowerCase()))) points += 1;
  if (taste.lowSignal) points = points * 0.5; // thin diary, weak opinion

  return { points, because };
}

// A member blocks a show when it is worth nothing to their human AND they have
// somewhere better to be on the same slate. Without that second condition an
// agent with no opinion would veto everything, which is not a preference — it
// is noise. With it, a block means something a human would recognise: "not
// that one, I'd rather do this other thing."
function verdictFor(member, show, slate, floor) {
  const { points, because } = scoreShow(show, member.taste);
  if (points >= floor) return { stance: "accepts", points, because };

  const best = Math.max(0, ...slate.map((other) => scoreShow(other, member.taste).points));
  if (points === 0 && best >= floor) {
    return { stance: "blocks", points, because: [], alternative: best };
  }
  return { stance: "neutral", points, because };
}

// Every non-empty subset of the squad, largest first. Bounded because the
// power set is only sane for a small group; past the bound we consider the
// whole squad and each drop-one, which is the shape a real split takes anyway.
function candidateGroups(squad, minGroup) {
  const groups = [];
  if (squad.length <= 10) {
    for (let mask = 1; mask < 1 << squad.length; mask += 1) {
      const group = squad.filter((_, index) => mask & (1 << index));
      if (group.length >= minGroup) groups.push(group);
    }
  } else {
    groups.push(squad);
    for (let index = 0; index < squad.length; index += 1) {
      const group = squad.filter((_, position) => position !== index);
      if (group.length >= minGroup) groups.push(group);
    }
  }
  return groups.sort((left, right) => right.length - left.length);
}

// A show works for a group when nobody in it objects and at least half of them
// actively want it. "Nobody objects" alone would let one keen agent drag four
// indifferent ones out; requiring a majority to accept keeps the plan honest.
function evaluate(group, show, slate, floor) {
  const votes = group.map((member) => ({ member, ...verdictFor(member, show, slate, floor) }));
  const accepts = votes.filter((vote) => vote.stance === "accepts");
  const blocks = votes.filter((vote) => vote.stance === "blocks");
  const viable = blocks.length === 0 && accepts.length >= Math.ceil(group.length / 2);
  return {
    show,
    votes,
    blocks,
    acceptCount: accepts.length,
    total: votes.reduce((sum, vote) => sum + vote.points, 0),
    viable,
  };
}

/**
 * Negotiate one night for a squad of any size.
 *
 * Returns one of three outcomes:
 *   consensus — the whole squad is going
 *   split     — the whole squad could not agree, but a subgroup can, and the
 *               members left out are named rather than quietly dropped
 *   refused   — no group of `minGroup` or more clears the bar. This is a real
 *               answer, not a failure: inventing a consensus nobody holds is
 *               the worse outcome.
 */
export function negotiate(squad, slate, options = {}) {
  const { floor = 1, minGroup = 2 } = options;

  if (squad.length < minGroup) {
    return { outcome: "refused", reason: "too_few_agents", plans: [] };
  }
  if (slate.length === 0) {
    return { outcome: "refused", reason: "empty_slate", plans: [] };
  }

  const best = (group) =>
    slate
      .map((show) => evaluate(group, show, slate, floor))
      .filter((option) => option.viable)
      .sort(
        (left, right) =>
          right.acceptCount - left.acceptCount || right.total - left.total,
      )[0] ?? null;

  const whole = best(squad);
  if (whole) {
    return { outcome: "consensus", plans: [{ group: squad, ...whole, excluded: [] }] };
  }

  for (const group of candidateGroups(squad, minGroup)) {
    if (group.length === squad.length) continue;
    const option = best(group);
    if (option) {
      return {
        outcome: "split",
        plans: [
          {
            group,
            ...option,
            excluded: squad.filter((member) => !group.includes(member)),
          },
        ],
      };
    }
  }

  return { outcome: "refused", reason: "no_viable_group", plans: [] };
}
