"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, Check, Copy, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// "Connect your agent" (docs/agent-hack/DESIGN.md §3).
//
// The token is generated and hashed HERE, in the browser. Only the SHA-256
// reaches Convex, so the plaintext exists in exactly one place — this screen,
// once. That is also what the published manifest promises, and the manifest is
// the thing an outside agent reads before it trusts us.

const SCOPES: { id: string; label: string; blurb: string; dangerous?: boolean }[] = [
  { id: "read:shows", label: "Search shows", blurb: "Read the catalog." },
  { id: "read:taste", label: "Read your taste", blurb: "Genres, artists and venues from shows you logged." },
  { id: "write:attendance", label: "RSVP for you", blurb: "Mark you interested or going." },
  { id: "write:candidates", label: "Reclaim your nights", blurb: "Rebuild past nights from photo metadata, for you to approve." },
  { id: "write:logs", label: "Write diary entries", blurb: "Add rated entries to your diary." },
  { id: "pay", label: "Buy tickets", blurb: "Spend money on your behalf.", dangerous: true },
];

const DEFAULTS = new Set(["read:shows", "read:taste", "write:attendance", "write:candidates"]);

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `sho_${base64url}`;
}

export function AgentAccess({ userId }: { userId: Id<"users"> }) {
  const tokens = useQuery(api.agents.listMine, { userId });
  const mint = useMutation(api.agents.mint);
  const revoke = useMutation(api.agents.revoke);

  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set(DEFAULTS));
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setScopes((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const token = newToken();
      await mint({
        userId,
        tokenHash: await sha256Hex(token),
        label: label.trim() || "my agent",
        scopes: [...scopes],
      });
      setIssued(token);
      setCopied(false);
      setLabel("");
    } catch (mintError) {
      setError(mintError instanceof Error ? mintError.message : "Could not create the token");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#12303a]">
          <Bot className="h-4 w-4 text-[#4EC98F]" />
        </span>
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Connect your agent</h2>
          <p className="text-xs text-[#8A8177]">Your agent can search shows, read your taste and fill your diary. You approve anything it logs.</p>
        </div>
      </div>

      {issued && (
        <div className="mt-5 border border-[#4EC98F]/40 bg-[#0f2119] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#4EC98F]">Copy this now</p>
          <p className="mt-1 text-xs text-[#8A8177]">This is the only time it is shown. We store a hash, so we cannot show it again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-black/40 px-3 py-2 font-mono text-xs text-[#F5F1E8]">{issued}</code>
            <button
              className="flex shrink-0 items-center gap-1 border border-[#2A2521] px-3 py-2 text-xs font-black"
              onClick={() => { void navigator.clipboard.writeText(issued).then(() => setCopied(true)); }}
              type="button"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#4EC98F]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button className="mt-3 text-xs font-black text-[#4EC98F]" onClick={() => setIssued(null)} type="button">Done</button>
        </div>
      )}

      {error && <p className="mt-4 border border-red-400/60 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}

      <div className="mt-5 border border-[#2A2521] bg-[#141210] p-4">
        <label className="block text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]" htmlFor="agent-label">Name this agent</label>
        <input
          className="mt-2 w-full border border-[#2A2521] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#4EC98F]"
          id="agent-label"
          maxLength={60}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="laptop claude"
          value={label}
        />

        <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">What it may do</p>
        <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
          {SCOPES.map((scope) => (
            <label className="flex cursor-pointer items-start gap-3 py-3" key={scope.id}>
              <input
                checked={scopes.has(scope.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-[#4EC98F]"
                onChange={() => toggle(scope.id)}
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <b className={`block text-sm ${scope.dangerous ? "text-[#FF7A50]" : ""}`}>
                  {scope.label}
                  {scope.dangerous && <ShieldAlert className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />}
                </b>
                <small className="text-[#8A8177]">{scope.blurb}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-[#8A8177]">Scopes are fixed when the token is made. To change them, make a new one and revoke this.</p>

        <button
          className="mt-4 w-full bg-[#FF7A50] px-5 py-3 text-sm font-black text-black disabled:opacity-60"
          disabled={busy || scopes.size === 0}
          onClick={() => void create()}
          type="button"
        >
          <KeyRound className="mr-1 inline h-4 w-4 align-[-3px]" />
          {busy ? "Creating..." : "Create token"}
        </button>
      </div>

      {tokens && tokens.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">Your agents</p>
          <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
            {tokens.map((token) => (
              <div className="flex items-center gap-3 py-3" key={String(token._id)}>
                <span className="min-w-0 flex-1">
                  <b className={`block truncate text-sm ${token.revoked ? "text-[#6B6258] line-through" : ""}`}>{token.label}</b>
                  <small className="text-[#8A8177]">
                    {token.scopes.length} {token.scopes.length === 1 ? "permission" : "permissions"}
                    {token.scopes.includes("pay") && <span className="text-[#FF7A50]"> · can pay</span>}
                    {token.lastUsedAt ? " · used" : " · never used"}
                  </small>
                </span>
                {!token.revoked && (
                  <button
                    aria-label={`Revoke ${token.label}`}
                    className="flex shrink-0 items-center gap-1 border border-[#2A2521] px-3 py-2 text-xs font-black text-[#8A8177]"
                    onClick={() => void revoke({ userId, tokenId: token._id as Id<"agentTokens"> })}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
