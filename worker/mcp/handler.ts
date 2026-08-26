// Streamable-HTTP MCP endpoint, hand-rolled JSON-RPC.
//
// Deliberately no SDK: this runs on Workers, it is ~150 lines, and a dependency
// that half-works in that runtime would be discovered on stage rather than here.
//
// Error style follows the surface it talks to: protocol problems are JSON-RPC
// errors; business refusals (no token, missing scope) come back as tool results
// with isError, so a caller reads the envelope rather than the status code.

import { ConvexHttpClient } from "convex/browser";
import { bearerFrom, hasScope, sha256Hex, type AgentIdentity } from "./auth";
import { agentCard, llmsTxt, mcpManifest } from "./discovery";
import { TOOLS, TOOLS_BY_NAME } from "./tools";

const PROTOCOL_VERSION = "2025-06-18";
const JSON_HEADERS = { "content-type": "application/json", "access-control-allow-origin": "*" };

const rpcError = (id: unknown, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status: 200,
    headers: JSON_HEADERS,
  });

const rpcResult = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: JSON_HEADERS,
  });

const toolText = (payload: unknown, isError = false) => ({
  content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

async function identify(request: Request, client: ConvexHttpClient): Promise<AgentIdentity | null> {
  const token = bearerFrom(request);
  if (!token) return null;
  const identity = await client.query("agents:verifyByHash" as any, { tokenHash: await sha256Hex(token) });
  return identity ?? null;
}

export async function handleMcp(request: Request, convexUrl: string): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
      },
    });
  }
  // A bare GET is how a curious agent pokes the endpoint. Point it at the
  // manifest instead of returning a naked 405.
  if (request.method === "GET") {
    return new Response(
      JSON.stringify({
        error: "This endpoint speaks MCP over POST (JSON-RPC).",
        manifest: new URL("/.well-known/mcp.json", request.url).toString(),
        llms_txt: new URL("/llms.txt", request.url).toString(),
      }),
      { status: 405, headers: JSON_HEADERS },
    );
  }
  if (request.method !== "POST") return rpcError(null, -32600, "Use POST");

  let body: any;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (Array.isArray(body)) return rpcError(null, -32600, "Batch requests are not supported");

  const { id, method, params } = body ?? {};

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "showtonic", version: "0.2.0" },
      instructions:
        "Showtonic is a live-music diary. Call get_taste_profile before recommending or agreeing to a show on the owner's behalf — it is derived from shows they actually logged. This surface writes: set_attendance and log_show change real state, and resolve_candidate puts an entry in a human's diary. Everything is scoped to the token's owner.",
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return new Response(null, { status: 202, headers: { "access-control-allow-origin": "*" } });
  }
  if (method === "ping") return rpcResult(id, {});

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description: `${tool.description} (requires scope: ${tool.scope})`,
        inputSchema: tool.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const client = new ConvexHttpClient(convexUrl);
    const name = params?.name;
    const tool = TOOLS_BY_NAME.get(name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);

    const me = await identify(request, client);
    if (!me) {
      return rpcResult(
        id,
        toolText(
          {
            error: "no_token",
            message:
              "This tool needs a Showtonic agent token. The account's human owner mints one in the app under 'Connect your agent' and pastes it to you; an agent cannot mint its own.",
            header: "Authorization: Bearer sho_...",
            manifest: new URL("/.well-known/mcp.json", request.url).toString(),
          },
          true,
        ),
      );
    }
    if (!hasScope(me, tool.scope)) {
      return rpcResult(
        id,
        toolText(
          {
            error: "missing_scope",
            required: tool.scope,
            granted: me.scopes,
            message: `Your token cannot reach ${tool.name}. Scopes are fixed at mint — the owner must issue a new token including "${tool.scope}".`,
          },
          true,
        ),
      );
    }

    try {
      const result = await tool.run(client, me, params?.arguments ?? {});
      // Best-effort last-used stamp; never let it fail the call.
      try { await client.mutation("agents:touch" as any, { tokenId: me.tokenId }); } catch { /* ignore */ }
      return rpcResult(id, toolText(result));
    } catch (error) {
      return rpcResult(id, toolText({ error: "tool_failed", message: String((error as Error)?.message ?? error) }, true));
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

// Static discovery routes. All public on purpose: an agent has to be able to
// learn what this is before it has a credential.
export function handleDiscovery(request: Request): Response | null {
  const url = new URL(request.url);
  const origin = url.origin;
  const send = (payload: unknown, type = "application/json") =>
    new Response(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2), {
      headers: { "content-type": type, "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
    });

  if (url.pathname === "/.well-known/mcp.json") return send(mcpManifest(origin));
  if (url.pathname === "/.well-known/ai-agent.json") return send(agentCard(origin));
  if (url.pathname === "/llms.txt") return send(llmsTxt(origin), "text/plain; charset=utf-8");
  return null;
}
