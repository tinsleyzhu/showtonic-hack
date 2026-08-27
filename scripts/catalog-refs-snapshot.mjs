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
const CITIES = ["San Francisco", "New York"];
const TODAY = process.env.SNAPSHOT_TODAY ?? new Date().toISOString().slice(0, 10);

function readEnvUrl() {
  try {
    const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    return /NEXT_PUBLIC_CONVEX_URL=(\S+)/.exec(env)?.[1] ?? "";
  } catch {
    return "";
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

  for (const city of CITIES) {
    const stats = await query("shows:catalogStats", { city, since: "2000-01-01", today: TODAY });
    out.cities[city] = stats?.__error ? stats : stats;
  }

  return out;
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
  const alarms = changes.filter((c) => /dangling|missing|WithoutShow|WithoutEvidence|withoutReason|NO SHOW ROW/i.test(`${c.key}${c.after}`));
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
}
