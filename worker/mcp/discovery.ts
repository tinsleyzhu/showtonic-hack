import { TOOLS } from "./tools";

// Discovery surfaces. An agent that has only a domain name has to be able to
// find its way in without a human pasting a URL — so the manifest, the agent
// card and llms.txt all describe the same server and all say plainly that
// writes exist and what credential reaches them.

// Derived from the tool registry itself, never hand-maintained. A parallel list
// drifts the moment a lane adds a tool — and it drifts SILENTLY, because
// tools/list keeps working while the manifest quietly under-reports. The
// manifest is what an agent reads before it has a credential, so a tool missing
// here is a tool that effectively does not exist to a stranger.
const TOOL_SUMMARY: [string, string, string][] = TOOLS.map((tool) => [
  tool.name,
  tool.scope,
  tool.description.split(". ")[0].replace(/\.$/, "") + ".",
]);

export function mcpManifest(origin: string) {
  return {
    schema_version: "2025-06-18",
    name: "showtonic",
    title: "Showtonic",
    description:
      "A diary for live music. Agents can search the catalog, read their owner's taste profile, reconstruct past nights from camera-roll metadata, and write attendance and diary entries.",
    transport: { type: "streamable-http", url: `${origin}/api/agent/mcp` },
    authentication: {
      type: "http",
      scheme: "bearer",
      token_format: "sho_<base64url-32>",
      header_example: "Authorization: Bearer sho_...",
      how_to_obtain:
        "The token is minted by the human who owns the account, from the Connect your agent screen in the app. An agent cannot self-mint. Only the SHA-256 is stored server-side; the plaintext is shown once.",
      scopes: [
        { id: "read:shows", description: "Search the show catalog." },
        { id: "read:taste", description: "Read the owner's taste profile." },
        { id: "write:attendance", description: "Set interested/going on the owner's behalf." },
        { id: "write:logs", description: "Write diary entries." },
        { id: "write:candidates", description: "Reconstruct nights from photo metadata and resolve them." },
        { id: "pay", description: "Buy tickets. Never granted by default." },
      ],
    },
    tools: TOOL_SUMMARY.map(([name, scope, description]) => ({ name, required_scope: scope, description })),
    privacy:
      "Photo pixels are never accepted or stored. reclaim_camera_roll takes timestamps and coordinates only, and returns derived evidence strings.",
  };
}

export function llmsTxt(origin: string) {
  return `# Showtonic

A diary for live music — log the shows you went to, rate them, and find people
whose taste matches yours. Catalog: San Francisco, via JamBase.

## For agents

MCP server (streamable HTTP): ${origin}/api/agent/mcp
Manifest: ${origin}/.well-known/mcp.json
Agent card: ${origin}/.well-known/ai-agent.json

Auth: Authorization: Bearer sho_...
Tokens are minted by the account's human owner in the app, under "Connect your
agent". An agent cannot mint its own. Scopes are fixed at mint and cannot be
widened later. \`pay\` is never granted by default.

This surface writes as well as reads. Reading a catalog is not using a product.

## Tools

${TOOL_SUMMARY.map(([name, scope, description]) => `- ${name} (${scope}) — ${description}`).join("\n")}

## Privacy

reclaim_camera_roll accepts photo METADATA only — timestamps, and coordinates
where the photo still carries them. Pixels are never uploaded, and the raw
coordinates are not stored: what persists is a derived evidence string such as
"6 photos within a block of The Midway".
`;
}

export function agentCard(origin: string) {
  return {
    name: "Showtonic",
    description: "Live-music diary with an agent-native surface.",
    url: origin,
    provider: { organization: "Showtonic" },
    capabilities: { streaming: false, push_notifications: false },
    interfaces: [
      { type: "mcp", transport: "streamable-http", url: `${origin}/api/agent/mcp` },
    ],
    authentication: { schemes: ["bearer"], token_format: "sho_<base64url-32>" },
    skills: TOOL_SUMMARY.map(([name, scope, description]) => ({
      id: name,
      name,
      description,
      required_scope: scope,
    })),
  };
}
