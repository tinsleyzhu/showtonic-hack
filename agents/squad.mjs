#!/usr/bin/env node
// Act 3 — a squad of agents plans one night together.
//
//   node agents/squad.mjs [--base https://showtonic-hack.showtonic.workers.dev]
//
// Each agent holds ONLY its own scoped token and talks to Showtonic through the
// same public MCP endpoint anyone else would use. There is no privileged path:
// if our own fleet needed a back door, the front door would not be real.
//
// Scopes are deliberately uneven — only the payer holds `pay` — so the scope
// model does visible work here instead of merely existing in the manifest.
//
// The squad is however many members the roster has, not three. The negotiation
// itself lives in ./negotiate.mjs so its edge cases — a group that has to
// split, a night nobody can agree on — are unit-tested rather than hoped for.

import { readFileSync } from "node:fs";

import { negotiate } from "./negotiate.mjs";

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

// Where the squad can actually go. The catalog spans several cities and is not
// evenly sized — a broad search returns more from the biggest one — so an
// unscoped slate quietly imports another city's listings into this group's
// decision. Scope to the city the members share.
//
// Disagreement is a real case, not an error: a squad split across cities is
// answered by putting BOTH cities on the table and saying so out loud, then
// letting the negotiation do its job. If nobody can converge across a
// continent, refusing is the correct outcome and it already knows how.
const cities = [...new Set(squad.map((m) => m.taste.homeCity).filter(Boolean))];
const sharedCity = cities.length === 1 ? cities[0] : null;
if (sharedCity) {
  say(convener.agent, convener.taste.handle, `We're all in ${sharedCity}, so I'll look there.`);
} else if (cities.length > 1) {
  say(
    convener.agent,
    convener.taste.handle,
    `This group is split across ${cities.join(" and ")} — I'll put shows from each on the table rather than quietly picking one.`,
  );
} else {
  say(
    convener.agent,
    convener.taste.handle,
    "Nobody has set a home city, so I'm searching everywhere — the slate may lean toward whichever city has the bigger listing.",
  );
}

// `city: undefined` means everywhere, which is search_shows' documented
// default — we pass a city only when we have one to pass.
const searchCities = sharedCity ? [sharedCity] : cities.length > 1 ? cities : [undefined];

const byId = new Map();
for (const term of wanted) {
  for (const city of searchCities) {
    const hits = await call(convener.token, "search_shows", {
      query: term,
      upcoming_only: true,
      limit: 6,
      ...(city ? { city } : {}),
    });
    for (const show of hits) byId.set(show.showId, show);
  }
}
if (byId.size < 3) {
  for (const city of searchCities) {
    for (const show of await call(convener.token, "search_shows", {
      query: ROSTER.query ?? city ?? "San Francisco",
      upcoming_only: true,
      limit: 12,
      ...(city ? { city } : {}),
    })) {
      byId.set(show.showId, show);
    }
  }
}
const slate = [...byId.values()];
say(
  convener.agent,
  convener.taste.handle,
  `Searched ${wanted.length} things this group actually cares about; ${slate.length} upcoming shows on the table.`,
);

// 3. Negotiate. Three outcomes, and two of them are not "everyone goes out
//    together" — see negotiate.mjs. Refusing is a real answer.
const result = negotiate(squad, slate, { floor: ROSTER.floor ?? 1 });

if (result.outcome === "refused") {
  say(
    "orchestrator",
    "-",
    `No night clears the bar for this group (${result.reason}). Refusing to invent a consensus nobody holds.`,
  );
  process.exit(0);
}

const [agreed] = result.plans;
const going = agreed.group;

for (const vote of agreed.votes) {
  const reason = vote.because.length
    ? vote.because.join("; ")
    : vote.stance === "blocks"
      ? "nothing here for my human, and there is somewhere they'd rather be"
      : "no strong feelings, won't block";
  say(vote.member.agent, vote.member.taste.handle, `On "${agreed.show.title}": ${reason}.`);
}

if (result.outcome === "split") {
  // A subgroup going out is a better answer than dragging along someone who
  // would rather be elsewhere — but the ones left out get named, not dropped.
  for (const member of agreed.excluded) {
    say(
      member.agent,
      member.taste.handle,
      "Sitting this one out — my human would rather be somewhere else that night.",
    );
  }
  say(
    "orchestrator",
    "-",
    `No night worked for all ${squad.length}. ${going.length} are going to ${agreed.show.title}; ${agreed.excluded
      .map((m) => `@${m.taste.handle}`)
      .join(", ")} sitting out.`,
  );
} else {
  say(
    "orchestrator",
    "-",
    `Consensus across all ${going.length}: ${agreed.show.title} at ${agreed.show.venue} on ${agreed.show.date}.`,
  );
}

// 4. Each agent RSVPs for its OWN human. Nobody can RSVP for anyone else —
//    the token is per-person, so the boundary is enforced, not just agreed.
for (const member of going) {
  await call(member.token, "set_attendance", { showId: agreed.show.showId, status: "going" });
  say(member.agent, member.taste.handle, "RSVP'd going.");
}

// 5. Record the plan and its transcript so a human can read the reasoning.
const recorder = going.includes(convener) ? convener : going[0];
const plan = await call(recorder.token, "record_squad_plan", {
  showId: agreed.show.showId,
  userHandles: going.map((m) => m.taste.handle),
  transcript,
});
say("orchestrator", "-", `Plan recorded (${plan.planId}).`);

// 6. Only the payer holds `pay`. Prove the others cannot. The payer has to be
//    someone actually on the plan — settle refuses a payer who isn't.
const payer = going.find((m) => m.pays) ?? going[0];
for (const member of going) {
  if (member === payer) continue;
  try {
    await call(member.token, "checkout_tickets", { planId: plan.planId, amountCents: 1 });
    say(member.agent, member.taste.handle, "!! paid without the scope — that is a bug");
  } catch (error) {
    say(member.agent, member.taste.handle, `Tried to pay: refused (${error.detail?.error}). Good.`);
  }
}

const amount = (ROSTER.ticketPriceCents ?? 3500) * going.length;
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
