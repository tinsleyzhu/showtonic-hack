# Sponsor tooling — what to install, what only you can do

Researched 2026-08-26 against each vendor's own docs. Marked clearly where
something could not be verified. Install the ones you'll actually use; a demo
with four integrations doing real work reads better than ten logos doing none.

---

## Install these (highest value first)

### 1. Tavily — powers the catalog-gap agent (phase 3)
Hosted MCP server, OAuth.

```bash
claude mcp add tavily-remote-mcp --transport http https://mcp.tavily.com/mcp/
```

**You must:** create a free account and API key at https://www.tavily.com/.
Tip from their docs: naming the key `mcp_auth_default` in the dashboard makes
the OAuth flow pick it up automatically. Every hackathon builder gets 8,000
credits — claim yours on the day.

Key-in-URL alternative if OAuth misbehaves:
```bash
claude mcp add --transport http tavily "https://mcp.tavily.com/mcp/?tavilyApiKey=<key>"
```

### 2. Cotal — agent identity + replayable handoff log (phase 4, $300 prize)
Self-hosted mesh, no account, no API key, Apache-2.0. Needs Node 22+ (you have it).

```bash
curl -fsSL https://get.cotal.ai | sh     # or: npm i -g cotal-ai && cotal setup
cotal up --detach
cotal mint tinsley-agent --profile agent
```

`cotal setup` installs a Claude Code plugin exposing ~16 `cotal_*` tools
(`cotal_send`, `cotal_dm`, `cotal_inbox`, `cotal_spawn`, …).

⚠️ Their spawn path invokes Claude with `--dangerously-load-development-channels`.
That flag is real; know that you're accepting it before running `cotal spawn`.
Keep the 1-hour timebox — plain scoped tokens remain the fallback.

### 3. Immersive Commons — the hackathon platform itself
Hosted MCP at `https://www.immersivecommons.com/api/mcp` (Streamable HTTP).
Auth is a scoped `agt_...` token via device-code flow: your agent shows a code,
you approve in a browser.

```bash
npx skills add immersive-commons/ic-skills
# then ask Claude: "set me up on Immersive Commons"
```

**Budget time:** you start at an entry tier and an IC operator must approve a
bump before agent messaging and RSVPs unlock. That's human-in-the-loop — do it
tonight, not Wednesday morning. About 10 public tools work with no token at all.

*Unverified:* I could not confirm a specific hackathon registration/application
tool. It's likely under events/membership, but don't count on "my agent applied
for me" working without checking.

### 4. Hacker Bob — scan the MCP surface you're about to open (phase 5, ~15 min)
Apache-2.0, local MCP runtime. No account — uses your existing Anthropic auth.

```bash
npx -y hacker-bob@latest install .
# restart Claude Code, then: /bob-evaluate <your-worker-url>
```

Only ever point it at infrastructure you own. That's their rule and it's a good one.

---

## Optional / conditional

### Runtype — $500, the biggest cash prize
Hosted OAuth MCP. Signup is email + a 6-digit code, no browser needed.

```bash
npm install -g @runtypelabs/cli
runtype auth register --email <you@example.com>
runtype auth verify <code-from-email>
runtype install-mcp
```

Worth a **1-hour timeboxed spike with their engineer in the room**, morning
only, for building the draft-writer or negotiation agents as Runtype flows.
Walk away at the hour. Free-tier limits are not documented publicly.

Note: `docs.runtype.com/_mcp/server` is a *docs-search* MCP — different thing.

### AIsa — the payment step (phase 4)
**No MCP server found.** It's a plain REST gateway, OpenAI-compatible.

- Base: `https://api.aisa.one/v1`, auth `Authorization: Bearer $AISA_API_KEY`
- **You must:** sign up at https://console.aisa.one/ (email or Google/GitHub).
  A key is generated automatically. New accounts get **$2.00 free credit**.
- Integration is prompt/skill-based: their console hands you a setup prompt, and
  agent-facing instructions live at `https://aisa.one/docs/agent-quickstart.md`.

Put the key in Convex env, never the browser:
```bash
npx convex env set AISA_API_KEY <key>
```

---

## Skip

**Nebius** (GPU cloud — the Claude API covers the vision agent), **Mitosis**
(agent memory — your taste vectors in Convex *are* the memory), **HUD** (RL
environments; they're sending a judge, not a build target), **Tenki**
(sandboxes — only if you want the three negotiation agents visibly isolated,
which is polish rather than substance).

---

## Three things only a human can do

1. Tavily API key creation
2. AIsa console signup
3. Immersive Commons device-code browser approval **and** the operator tier bump

Everything else installs unattended.
