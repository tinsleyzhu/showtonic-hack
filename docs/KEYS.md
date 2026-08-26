# Keys and accounts

Every credential Showtonic uses is an **HTTP API key held server-side in Convex**.
None of them is an MCP server, and none belongs in the browser — the app calls
these from Convex actions, which is the only place `fetch` is allowed.

```bash
npx convex env set <NAME> '<value>'
npx convex env list          # names only; values are not printed by our tooling
```

## Set today

| Var | Powers | Status |
|---|---|---|
| `JAMBASE_API_KEY` | Catalog sync (`convex/jambase.ts`) | ✅ set — trial tier, **rate-limits at 429** and the previous key expired outright |
| `TAVILY_API_KEY` | Catalog-gap agent: web search for nights the catalog cannot explain | ✅ set — event code `26HACK`, **valid 26–27 Aug only** |
| `AISA_API_KEY` | Agent payments (`checkout_tickets`) | ✅ set and **funded** — settles real metered transactions. The first key issued had no balance and returned `recharge_required`; if settlement starts reporting that again, the balance is out. |
| `TENKI_API_KEY` | Sandboxes; not yet wired to anything | ✅ set |

## Worth setting, in value order

| Var | Powers | Account | Cost |
|---|---|---|---|
| `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` | Artist genres, images, preview links | developer.spotify.com → create app → client credentials | free |
| `TICKETMASTER_API_KEY` | Future shows, venue geo, genre — the actual JamBase replacement | developer.ticketmaster.com | free, 5,000/day, 5 req/s |
| `SETLISTFM_API_KEY` | Historical shows **and setlists** | api.setlist.fm | free, ~2 req/s |
| `BANDSINTOWN_APP_ID` | Non-Ticketmaster future dates (small clubs, DICE/AXS) | artists.bandsintown.com | free, **off by default** |

**Spotify is the highest-value one right now.** Artist enrichment currently falls
through to MusicBrainz, which is capped at ~1 request/second; Spotify runs at
~120 ms and returns richer genre tags. That is the difference between ~2.4 hours
and ~15 minutes to enrich 7,000 artists — and genre-first onboarding cannot ship
until enough artists carry genres.

**Bandsintown carries a caveat, not just a key:** their terms restrict commercial
redistribution. Read them before enabling `includeBandsintown: true`.

## Needs nothing

- **MusicBrainz** — no key, no account. Rate-limited to ~1 req/s and requires a
  descriptive `User-Agent`, both of which `convex/freeEvents.ts` already respects.
- **OpenStreetMap Nominatim** — no key. Used by `npm run geocode:venues` to fill
  venue coordinates JamBase did not supply. Same 1 req/s courtesy limit.

### A note on AIsa

AIsa is a metered machine-transaction network with one key across many models —
it is **not** a ticketing rail, and nothing here sells concert tickets to an
agent. So `squad.settle` puts the coordination fee through AIsa as a genuine
billable transaction and keeps its id, while recording the ticket purchase as
simulated. `AISA_SETTLEMENT_MODEL` overrides which model carries the
transaction (default `claude-haiku-4-5-20251001`, the cheapest that works).

## What is *not* an API key

The MCP servers in the Claude Code session (`immersive-commons`, `codegraph`)
are developer tooling for the agent building this, not runtime dependencies of
the product. Showtonic's own MCP server needs no third-party key at all: it
authenticates callers with tokens it mints itself.
