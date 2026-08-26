// Bearer-token auth for Showtonic's agent surface.
//
// The token is hashed here, at the edge, and only the hash is sent to Convex —
// which is also all Convex ever stored. Scope enforcement happens before any
// tool runs, so an under-scoped agent is refused rather than half-served.

export type AgentIdentity = {
  tokenId: string;
  userId: string;
  handle: string;
  label: string;
  scopes: string[];
};

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function hasScope(identity: AgentIdentity, scope: string): boolean {
  return identity.scopes.includes(scope);
}
