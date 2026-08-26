#!/usr/bin/env node
// Act 3 — three agents plan one night together.
//
//   node agents/squad.mjs [--base https://showtonic-hack.showtonic.workers.dev]
//
// Each agent holds ONLY its own scoped token and talks to Showtonic through the
// same public MCP endpoint anyone else would use. There is no privileged path:
// if our own fleet needed a back door, the front door would not be real.
//
// Scopes are deliberately uneven — only the payer holds `pay` — so the scope
// model does visible work here instead of merely existing in the manifest.

import { readFileSync } from "node:fs";

const BASE =
  process.argv.includes("--base")
    ? process.argv[process.argv.indexOf("--base") + 1]
    : "https://showtonic-hack.showtonic.workers.dev";
const ROSTER = JSON.parse(readFileSync(new URL("./squad.tokens.json", import.meta.url), "utf8"));

let rpcId = 0;
async function call(token, name, args = {}) {
  const response = await fetch(`${BASE}/api/agent/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = await response.json();
  const result = body.result ?? {};
  const text = (result.content ?? [{}])[0]?.text ?? JSON.stringify(body);
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (result.isError) throw Object.assign(new Error(`${name} refused`), { detail: parsed });
  return parsed;
}

const transcript = [];
function say(agent, handle, message) {
  transcript.push({ agent, handle, message });
  console.log(`  ${agent.padEnd(16)} ${message}`);
}

// How much an agent wants a show, from its human's real logged history.
// Genres are sparse until enrichment finishes, so artists and venues carry the
// weight — and a member with almost no diary should not be given false
// confidence, hence the lowSignal damping.
function score(show, taste) {
  const artists = new Set((taste.topArtists ?? []).map((a) => a.name.toLowerCase()));
  const loved = new Set((taste.lovedArtists ?? []).map((a) => a.toLowerCase()));
  const venues = new Set((taste.topVenues ?? []).map((v) => v.name.toLowerCase()));
  const genres = new Set((taste.topGenres ?? []).map((g) => g.name.toLowerCase()));

  let points = 0;
  const because = [];
  for (const name of show.artists ?? []) {
    const key = String(name).toLowerCase();
    if (loved.has(key)) { points += 5; because.push(`${name} is one of my human's favourites`); }
    else if (artists.has(key)) { points += 3; because.push(`they've seen ${name} before`); }
  }
  if (show.venue && venues.has(show.venue.toLowerCase())) {
    points += 2; because.push(`${show.venue} is a room they keep going back to`);
  }
  if ((show.genres ?? []).some((g) => genres.has(String(g).toLowerCase()))) points += 1;
  if (taste.lowSignal) points = points * 0.5; // thin diary, weak opinion

  return { points, because };
}

console.log(`Squad night · ${BASE}\n`);

// 1. Every agent reads its own human, and only its own.
const squad = [];
for (const member of ROSTER.members) {
  const taste = await call(member.token, "get_taste_profile");
  squad.push({ ...member, taste });
  say(
    member.agent,
    taste.handle,
    `I speak for @${taste.handle}. ${taste.showsLogged} shows logged${
      taste.lowSignal ? " — thin history, so I'll hold my opinions loosely" : ""
    }. Top: ${(taste.topArtists ?? []).slice(0, 3).map((a) => a.name).join(", ") || "nothing yet"}.`,
  );
}

// 2. The convener proposes a slate. Searching the city generically is how you
//    get twelve shows nobody wants; searching the SQUAD'S OWN taste is how you
//    get candidates worth arguing about. Union the per-artist hits, then fall
//    back to the city so there is always something on the table.
const convener = squad[0];
const wanted = [
  ...new Set(
    squad.flatMap((member) => [
      ...(member.taste.lovedArtists ?? []),
      ...(member.taste.topArtists ?? []).map((a) => a.name),
      ...(member.taste.topVenues ?? []).map((v) => v.name),
    ]),
  ),
].slice(0, 12);

const byId = new Map();
for (const term of wanted) {
  const hits = await call(convener.token, "search_shows", {
    query: term,
    upcoming_only: true,
    limit: 6,
  });
  for (const show of hits) byId.set(show.showId, show);
}
if (byId.size < 3) {
  for (const show of await call(convener.token, "search_shows", {
    query: ROSTER.query ?? "San Francisco",
    upcoming_only: true,
    limit: 12,
  })) {
    byId.set(show.showId, show);
  }
}
const slate = [...byId.values()];
say(
  convener.agent,
  convener.taste.handle,
  `Searched ${wanted.length} things this group actually cares about; ${slate.length} upcoming shows on the table.`,
);

// 3. Score independently, then eliminate anything someone actively refuses.
const tally = slate.map((show) => {
  const votes = squad.map((member) => ({ member, ...score(show, member.taste) }));
  return { show, votes, total: votes.reduce((sum, v) => sum + v.points, 0) };
});
const ranked = tally.sort((a, b) => b.total - a.total);
const winner = ranked[0];

if (!winner || winner.total === 0) {
  say("orchestrator", "-", "Nobody had a real preference. Refusing to invent consensus.");
  process.exit(0);
}

for (const vote of winner.votes) {
  const reason = vote.because.length ? vote.because.join("; ") : "no strong feelings, won't block";
  say(vote.member.agent, vote.member.taste.handle, `On "${winner.show.title}": ${reason}.`);
}
say(
  "orchestrator",
  "-",
  `Consensus: ${winner.show.title} at ${winner.show.venue} on ${winner.show.date}.`,
);

// 4. Each agent RSVPs for its OWN human. Nobody can RSVP for anyone else —
//    the token is per-person, so the boundary is enforced, not just agreed.
for (const member of squad) {
  await call(member.token, "set_attendance", { showId: winner.show.showId, status: "going" });
  say(member.agent, member.taste.handle, "RSVP'd going.");
}

// 5. Record the plan and its transcript so a human can read the reasoning.
const plan = await call(convener.token, "record_squad_plan", {
  showId: winner.show.showId,
  userHandles: squad.map((m) => m.taste.handle),
  transcript,
});
say("orchestrator", "-", `Plan recorded (${plan.planId}).`);

// 6. Only the payer holds `pay`. Prove the others cannot.
const payer = squad.find((m) => m.pays) ?? squad[0];
for (const member of squad) {
  if (member === payer) continue;
  try {
    await call(member.token, "checkout_tickets", { planId: plan.planId, amountCents: 1 });
    say(member.agent, member.taste.handle, "!! paid without the scope — that is a bug");
  } catch (error) {
    say(member.agent, member.taste.handle, `Tried to pay: refused (${error.detail?.error}). Good.`);
  }
}

const amount = (ROSTER.ticketPriceCents ?? 3500) * squad.length;
const receipt = await call(payer.token, "checkout_tickets", {
  planId: plan.planId,
  amountCents: amount,
});
say(
  payer.agent,
  payer.taste.handle,
  `Settled $${(amount / 100).toFixed(2)} via ${receipt.settlement} (${receipt.paymentRef}).`,
);
console.log(`\n  ${receipt.note}\n`);
console.log(`Open the app and the night is already there. ${transcript.length} messages on the record.`);
