// Snapshot every surface that points AT a show row, so a dedup migration can
// be judged by a diff instead of an impression.
//
// The dedup sweep merges duplicate show and artist rows. Everything downstream
// holds ids into those rows — diary logs, recap counts, briefing finds, pending
// candidates, taste matches. A merge that misses a referrer does not throw; it
// quietly renders a diary entry with no show, or a recap that counts 7 nights
// and lists 6. That is the failure mode worth catching, and it is only visible
// by comparing before with after.
//
//   node scripts/catalog-refs-snapshot.mjs before
//   ... run the migration ...
//   node scripts/catalog-refs-snapshot.mjs after
//   node scripts/catalog-refs-snapshot.mjs diff
//
// Read-only. Every call here is a Convex query; this script never mutates.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? readEnvUrl();
const OUT_DIR = join(process.cwd(), ".snapshots");

// The accounts the demo actually shows, plus the throwaway.
const HANDLES = ["tinsley", "walkthrough"];
// The agent surface, checked only when a token is supplied. An external
// judge-agent reads the app through here, and it goes through the same tables
// by a different path — so it can disagree with the screen, which is the whole
// reason to check it separately.
const MCP_ORIGIN = process.env.SHOWTONIC_APP_URL ?? "https://showtonic-hack.showtonic.workers.dev";
const MCP_TOKEN = process.env.SHOWTONIC_MCP_TOKEN ?? "";
const MCP_HANDLE = process.env.SHOWTONIC_MCP_HANDLE ?? "walkthrough";
const CITIES = ["San Francisco", "New York"];

// Rooms that must stay APART. L1's venue merge folds aliases for one room
// together; these two are a genuinely different pair at one address, and a
// normalizer that folds them silently moves 1,537 shows into the wrong room.
// L1 ships an enumerated list with this as its own refusal test — this is the
// independent check that the refusal actually held in the data afterwards.
const MUST_STAY_DISTINCT = [["Birdland Jazz Club", "Birdland Theater"]];
const TODAY = process.env.SNAPSHOT_TODAY ?? new Date().toISOString().slice(0, 10);

function readEnvUrl() {
  try {
    const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    return /NEXT_PUBLIC_CONVEX_URL=(\S+)/.exec(env)?.[1] ?? "";
  } catch {
    return "";
  }
}

// One MCP tool call. Returns the parsed payload, or an { __error } marker —
// never throws, because a dead agent surface is a finding, not a crash.
async function mcpCall(name, args = {}) {
  try {
    const response = await fetch(`${MCP_ORIGIN}/api/agent/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MCP_TOKEN}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const body = await response.json();
    if (body.error) return { __error: String(body.error.message ?? body.error).slice(0, 160) };
    const text = body.result?.content?.[0]?.text;
    return typeof text === "string" ? JSON.parse(text) : body.result;
  } catch (error) {
    return { __error: String(error).slice(0, 160) };
  }
}

async function query(path, args) {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await response.json();
  if (body.status !== "success") return { __error: body.errorMessage?.slice(0, 200) ?? "failed" };
  return body.value;
}

// A diary entry whose show row vanished is the exact thing a bad merge leaves
// behind, so count them explicitly rather than trusting the totals to move.
function summariseDiary(diary) {
  const entries = diary?.memories ?? diary?.logs ?? [];
  return {
    entries: entries.length,
    danglingShow: entries.filter((entry) => !entry.showId).length,
    missingTitle: entries.filter((entry) => !(entry.artistNames?.length || entry.title || entry.caption)).length,
    showIds: entries.map((entry) => String(entry.showId ?? "")).sort(),
  };
}

async function snapshot() {
  const out = { takenFor: TODAY, convex: CONVEX_URL, users: {}, cities: {} };

  for (const handle of HANDLES) {
    const user = await query("users:getByHandle", { handle });
    if (!user || user.__error) {
      out.users[handle] = { missing: true, error: user?.__error };
      continue;
    }
    const userId = user._id;
    const [recap, diary, briefing, pending] = await Promise.all([
      query("recap:build", { userId }),
      query("diary:forUser", { userId }),
      query("briefing:forUser", { userId, today: TODAY }),
      query("backfill:pending", { userId }),
    ]);

    out.users[handle] = {
      userId,
      recap: recap?.empty
        ? { empty: true }
        : {
            shows: recap?.shows,
            artists: recap?.artists,
            venues: recap?.venues,
            cities: recap?.cities,
            headline: recap?.headline,
            // The recap counts and the diary rows are two different reads of
            // the same logs. After a merge they can disagree, and that
            // disagreement is the bug.
            topArtists: (recap?.topArtists ?? []).map((a) => `${a.name}:${a.count}`),
            highestRatedShow: recap?.highestRated?.showId ?? null,
          },
      diary: summariseDiary(diary),
      briefing: {
        decisionsOwed: briefing?.decisionsOwed,
        finds: (briefing?.finds ?? []).map((f) => `${f.showId}|${f.title}`),
        findsWithoutEvidence: (briefing?.finds ?? []).filter((f) => !(f.evidence ?? []).length).length,
        beliefs: (briefing?.beliefs ?? []).map((b) => b.statement),
        activity: (briefing?.activity ?? []).length,
        refusalsWithoutReason: (briefing?.activity ?? []).filter(
          (item) => item.kind === "refused" && !(item.detail ?? "").trim(),
        ).length,
      },
      pendingCandidates: (pending ?? []).map((c) => `${c.clusterDate}|${c.show?.title ?? "NO SHOW ROW"}`),
      pendingWithoutShow: (pending ?? []).filter((c) => !c.show).length,
    };
  }

  if (MCP_TOKEN) {
    const [recap, briefing, manifest] = await Promise.all([
      mcpCall("generate_recap"),
      mcpCall("get_briefing"),
      fetch(`${MCP_ORIGIN}/.well-known/mcp.json`).then((r) => r.json()).catch((e) => ({ __error: String(e) })),
    ]);
    const screen = out.users[MCP_HANDLE];
    out.mcp = {
      handle: MCP_HANDLE,
      toolsPublished: (manifest?.tools ?? []).length,
      recapShows: recap?.shows,
      recapArtists: recap?.artists,
      recapTopArtists: (recap?.topArtists ?? []).map((a) => `${a.name}:${a.count}`),
      briefingFinds: (briefing?.finds ?? []).length,
      briefingActivity: (briefing?.activity ?? []).length,
      error: recap?.__error ?? briefing?.__error ?? null,
      // The cross-surface check. The agent and the screen read the same logs by
      // different paths; a merge that desyncs them is exactly how you get a
      // recap claiming 7 nights above a list of 6, told to a judge's agent.
      agreesWithScreen:
        !screen || screen.missing || screen.recap?.empty
          ? "n/a"
          : recap?.shows === screen.recap.shows && recap?.artists === screen.recap.artists
            ? "yes"
            : "MISMATCH",
    };
  }

  for (const city of CITIES) {
    const stats = await query("shows:catalogStats", { city, since: "2000-01-01", today: TODAY });
    out.cities[city] = stats?.__error ? stats : stats;
  }

  out.venues = await venueIdentity();

  return out;
}

// Venue identity as the SHOW rows see it, which is the layer a person actually
// reads: a residency split across two alias rows renders as an artist changing
// rooms mid-run. Sampled over a forward window rather than counted exhaustively
// — enough to catch a name that maps to several ids, an id that answers to
// several names, or a show that lost its venue entirely.
async function venueIdentity() {
  const byName = new Map();
  const byId = new Map();
  let rows = 0;
  let missingVenue = 0;

  for (const city of CITIES) {
    for (let chunk = 0; chunk < 6; chunk += 1) {
      const from = shiftDays(TODAY, chunk * 45);
      const to = shiftDays(TODAY, chunk * 45 + 44);
      const shows = (await query("shows:listCatalog", { city, from, to, limit: 250 })) ?? [];
      if (shows.__error) continue;
      for (const show of shows) {
        rows += 1;
        const name = (show.venueName ?? "").trim();
        const id = String(show.venueId ?? "");
        if (!name || !id) {
          missingVenue += 1;
          continue;
        }
        if (!byName.has(name)) byName.set(name, new Set());
        byName.get(name).add(id);
        if (!byId.has(id)) byId.set(id, new Set());
        byId.get(id).add(name);
      }
    }
  }

  const coverage = await query("venues:coordinateCoverage", {});
  const splitNames = [...byName.entries()].filter(([, ids]) => ids.size > 1).map(([name, ids]) => `${name} -> ${ids.size} ids`);
  const sharedIds = [...byId.entries()].filter(([, names]) => names.size > 1).map(([, names]) => [...names].sort().join(" = "));

  // The refusal check. Same id for both rooms means the merge went too far.
  const refusalsBroken = [];
  for (const [a, b] of MUST_STAY_DISTINCT) {
    const idsA = byName.get(a);
    const idsB = byName.get(b);
    if (!idsA || !idsB) continue;
    const overlap = [...idsA].filter((id) => idsB.has(id));
    if (overlap.length) refusalsBroken.push(`MERGED WRONGLY: ${a} + ${b}`);
  }

  return {
    venueRowsTotal: coverage?.total,
    showRowsSampled: rows,
    showsWithNoVenue: missingVenue,
    distinctNames: byName.size,
    namesSplitAcrossIds: splitNames.sort(),
    idsAnsweringToSeveralNames: sharedIds.sort(),
    refusalsBroken,
  };
}

function shiftDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function flatten(value, prefix = "", into = {}) {
  if (value === null || typeof value !== "object") {
    into[prefix] = value;
    return into;
  }
  if (Array.isArray(value)) {
    into[prefix] = value.join(" ~ ");
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, into);
  }
  return into;
}

function diff(before, after) {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes = [];
  for (const key of keys) {
    if (key === "takenFor" || key === "convex") continue;
    if (String(a[key]) !== String(b[key])) {
      changes.push({ key, before: a[key], after: b[key] });
    }
  }
  return changes;
}

const [mode = "before"] = process.argv.slice(2);
mkdirSync(OUT_DIR, { recursive: true });

if (mode === "diff") {
  const before = JSON.parse(readFileSync(join(OUT_DIR, "before.json"), "utf8"));
  const after = JSON.parse(readFileSync(join(OUT_DIR, "after.json"), "utf8"));
  const changes = diff(before, after);
  if (!changes.length) {
    console.log("No change in any show-referencing surface.");
  } else {
    console.log(`${changes.length} change${changes.length === 1 ? "" : "s"}:\n`);
    for (const change of changes) {
      console.log(`  ${change.key}`);
      console.log(`    before: ${change.before}`);
      console.log(`    after:  ${change.after}`);
    }
  }
  // Anything that looks like a broken reference is called out separately,
  // because a count that merely moved is fine and a dangling row never is.
  const alarms = changes.filter((c) =>
    /dangling|missing|WithoutShow|WithoutEvidence|withoutReason|NO SHOW ROW|MISMATCH|__error|mcp\.error|refusalsBroken|MERGED WRONGLY|showsWithNoVenue/i.test(
      `${c.key}${c.after}`,
    ),
  );
  if (alarms.length) {
    console.log(`\n!! ${alarms.length} of those look like BROKEN REFERENCES, not just moved numbers.`);
    process.exitCode = 1;
  }
} else {
  if (!CONVEX_URL) {
    console.error("No NEXT_PUBLIC_CONVEX_URL — run from a worktree with .env.local, or export it.");
    process.exit(1);
  }
  const result = await snapshot();
  const file = join(OUT_DIR, `${mode}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`Wrote ${file}`);
  for (const [handle, user] of Object.entries(result.users)) {
    if (user.missing) {
      console.log(`  @${handle}: MISSING`);
      continue;
    }
    console.log(
      `  @${handle}: recap ${user.recap.empty ? "empty" : `${user.recap.shows} shows / ${user.recap.artists} artists`}` +
        `, diary ${user.diary.entries} (${user.diary.danglingShow} dangling)` +
        `, finds ${user.briefing.finds.length}, pending ${user.pendingCandidates.length}`,
    );
  }
  if (result.mcp) {
    console.log(
      `  MCP(@${result.mcp.handle}): ${result.mcp.toolsPublished} tools, recap ${result.mcp.recapShows} shows, ` +
        `agrees with screen: ${result.mcp.agreesWithScreen}${result.mcp.error ? ` — ${result.mcp.error}` : ""}`,
    );
  } else {
    console.log("  MCP: skipped (set SHOWTONIC_MCP_TOKEN to include the agent surface)");
  }
  if (result.venues) {
    const v = result.venues;
    console.log(
      `  venues: ${v.venueRowsTotal} rows, ${v.distinctNames} names over ${v.showRowsSampled} sampled shows, ` +
        `${v.namesSplitAcrossIds.length} names split across ids, ${v.showsWithNoVenue} shows with no venue` +
        `${v.refusalsBroken.length ? ` — ${v.refusalsBroken.join("; ")}` : ""}`,
    );
  }
}
