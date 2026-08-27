"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Bot, Check, Copy, Lock, ShieldAlert, Snowflake, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Hiring your concierge — the employment contract.
//
// This screen used to read as a developer surface: "Connect your agent",
// "Create token", a checklist of scope strings. That framing quietly asks the
// wrong question. A person is not configuring an integration; they are deciding
// how much of their life a piece of software gets to touch, and they should be
// reading TERMS, in their own language, before they sign.
//
// So: plain-language duties, `pay` fenced off on its own as the one line that
// is never on by default, and the technical guarantees kept fully visible but
// told as promises rather than as protocol. The hashing, the frozen scopes and
// the revoke are not implementation notes — they ARE the trust story, and they
// are the reason the answer to "what can it do" is knowable at all.
//
// The token is still generated and hashed HERE, in the browser. Only the
// SHA-256 reaches Convex, so the plaintext exists in exactly one place — this
// screen, once.

type Term = {
  id: string;
  duty: string; // what it may do, in the language a person would use
  terms: string; // the honest limit — or the honest absence of one
};

// Copy checked against worker/mcp/tools.ts rather than against the vibe. Two of
// these lines are less comfortable than the obvious phrasing, and both are
// deliberate:
//
//   · `write:logs` really does write straight to the diary. Saying "only after
//     you confirm" here would be a lie on the one screen that cannot afford one.
//   · `write:candidates` used to cover proposing a night AND resolving it, so
//     an agent could accept its own proposal. Writing that down here is what
//     got it split: `resolve:candidates` now exists, is never granted by
//     default, and is fenced below next to `pay` for the same reason — it is
//     the duty where a mistake writes something false into a person's history.
const TERMS: Term[] = [
  {
    id: "read:shows",
    duty: "Can look up any show",
    terms: "Reads the public catalog. Nothing about you.",
  },
  {
    id: "read:taste",
    duty: "Can learn what you like",
    terms: "Reads the artists, venues and genres in nights you have already logged.",
  },
  {
    id: "write:attendance",
    duty: "Can plan nights",
    terms: "Marks you interested or going, and records a night your group agreed on. It never buys anything.",
  },
  {
    id: "write:candidates",
    duty: "Can rebuild your past nights",
    terms: "Turns photo timestamps into proposed nights. Every one of them waits for your yes.",
  },
  {
    id: "write:logs",
    duty: "Can write your diary directly",
    terms: "Adds rated entries itself, with no stop at your desk. Hire for this only what you would let sign your name.",
  },
];

// Kept out of the list above on purpose. These are not two more checkboxes:
// they are the two duties where a wrong move costs money or rewrites a life,
// and neither is ever on by default.
const FENCED_TERMS: Term[] = [
  {
    id: "resolve:candidates",
    duty: "Can accept its own proposals",
    terms:
      "Files a rebuilt night into your diary without asking. Without this, it can propose all night and change nothing — which is how an agent should arrive.",
  },
  {
    id: "pay",
    duty: "Can spend your money",
    terms:
      "Buys tickets for a plan your group has agreed on. An agent that can plan a night is not thereby one that can pay for it, so this never comes switched on — you turn it on yourself, every time you hire.",
  },
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

function TermRow({
  checked,
  onToggle,
  term,
}: {
  checked: boolean;
  onToggle: () => void;
  term: Term;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3">
      <input
        aria-describedby={`term-${term.id}`}
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-[#4EC98F]"
        onChange={onToggle}
        type="checkbox"
      />
      <span className="min-w-0 flex-1">
        <b className="block text-sm">{term.duty}</b>
        <small className="block text-[#8A8177]" id={`term-${term.id}`}>
          {term.terms}
        </small>
      </span>
    </label>
  );
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
  // Dismissing was one unconfirmed tap that permanently kills a key you cannot
  // be shown again. Two taps, with the consequence stated in between.
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function revokeToken(tokenId: Id<"agentTokens">) {
    setRevoking(String(tokenId));
    setError("");
    try {
      await revoke({ userId, tokenId });
      setConfirmingRevoke(null);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not dismiss that agent. It is still working — try again.");
    } finally {
      setRevoking(null);
    }
  }

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
      setError(mintError instanceof Error ? mintError.message : "Could not sign that contract. Nothing was hired — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#12303a]">
          <Bot aria-hidden className="h-4 w-4 text-[#4EC98F]" />
        </span>
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">Hire your concierge</h2>
          <p className="text-xs text-[#8A8177]">
            You are writing its job description. It can only ever do what you agree to here.
          </p>
        </div>
      </div>

      {issued && (
        <div className="mt-5 border border-[#4EC98F]/40 bg-[#0f2119] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#4EC98F]">Its key — copy it now</p>
          <p className="mt-1 text-xs text-[#C9C1B4]">
            This is the only time anyone sees it. We kept a fingerprint, not the key, so we could not show it to you
            again if you asked — or hand it to anyone who asked us for it.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-black/40 px-3 py-2 font-mono text-xs text-[#F5F1E8]">{issued}</code>
            <button
              className="flex shrink-0 items-center gap-1 border border-[#2A2521] px-3 py-2 text-xs font-black"
              onClick={() => { void navigator.clipboard.writeText(issued).then(() => setCopied(true)); }}
              type="button"
            >
              {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-[#4EC98F]" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p aria-live="polite" className="sr-only">{copied ? "Key copied to your clipboard." : ""}</p>
          <button className="mt-3 text-xs font-black text-[#4EC98F]" onClick={() => setIssued(null)} type="button">Done</button>
        </div>
      )}

      {error && <p aria-live="assertive" className="mt-4 border border-red-400/60 bg-red-950/30 p-3 text-xs text-red-200" role="alert">{error}</p>}

      <div className="mt-5 border border-[#2A2521] bg-[#141210] p-4">
        <label className="block text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]" htmlFor="agent-label">Who are you hiring</label>
        <input
          className="mt-2 w-full border border-[#2A2521] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#4EC98F]"
          id="agent-label"
          maxLength={60}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="laptop claude"
          value={label}
        />

        <fieldset className="mt-5">
          <legend className="text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">The job</legend>
          <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
            {TERMS.map((term) => (
              <TermRow checked={scopes.has(term.id)} key={term.id} onToggle={() => toggle(term.id)} term={term} />
            ))}
          </div>
        </fieldset>

        {/* Fenced, not listed. `pay` is the one duty that changes what a mistake
            costs, so it does not get to sit in a row with "can look up a show"
            and inherit the same glance. */}
        <fieldset className="mt-5 border border-[#FF7A50]/50 bg-[#1A1713] p-4">
          <legend className="flex items-center gap-1.5 px-2 text-xs font-black uppercase tracking-[0.16em] text-[#FF7A50]">
            <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
            Never on by default
          </legend>
          <div className="divide-y divide-white/10">
            {FENCED_TERMS.map((term) => (
              <TermRow checked={scopes.has(term.id)} key={term.id} onToggle={() => toggle(term.id)} term={term} />
            ))}
          </div>
        </fieldset>

        <ul className="mt-5 space-y-2 text-xs leading-5 text-[#C9C1B4]">
          <li className="flex items-start gap-2">
            <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4EC98F]" />
            <span>Its key is made on this device and hashed before it leaves. We hold a fingerprint, never the key itself.</span>
          </li>
          <li className="flex items-start gap-2">
            <Snowflake aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4EC98F]" />
            <span>These terms freeze at signing. Changing the job means hiring again and dismissing this one.</span>
          </li>
          <li className="flex items-start gap-2">
            <BadgeCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4EC98F]" />
            <span>You can dismiss it in one move, whenever you like. It stops mid-sentence and its key never works again.</span>
          </li>
        </ul>

        <button
          className="mt-4 w-full bg-[#FF7A50] px-5 py-3 text-sm font-black text-black disabled:opacity-60"
          disabled={busy || scopes.size === 0}
          onClick={() => void create()}
          type="button"
        >
          {busy ? "Signing…" : "Sign and hire"}
        </button>
        {scopes.size === 0 && (
          <p className="mt-2 text-xs text-[#8A8177]">Agree to at least one duty — an agent with no job cannot be hired.</p>
        )}
      </div>

      {tokens && tokens.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">Who works for you</p>
          <p className="mt-1 text-xs text-[#8A8177]">Dismissing is permanent — the agent stops immediately and its key cannot be reissued.</p>
          <div className="mt-2 divide-y divide-white/10 border-y border-white/10">
            {tokens.map((token) => (
              <div className="flex items-center gap-3 py-3" key={String(token._id)}>
                <span className="min-w-0 flex-1">
                  <b className={`block truncate text-sm ${token.revoked ? "text-[#8A8177] line-through" : ""}`}>{token.label}</b>
                  <small className="text-[#8A8177]">
                    {token.revoked ? "Dismissed" : `${token.scopes.length} ${token.scopes.length === 1 ? "duty" : "duties"}`}
                    {!token.revoked && token.scopes.includes("resolve:candidates") && <span className="text-[#FF7A50]"> · files its own</span>}
                    {!token.revoked && token.scopes.includes("pay") && <span className="text-[#FF7A50]"> · can spend</span>}
                    {!token.revoked && (token.lastUsedAt ? " · has worked" : " · not started yet")}
                  </small>
                </span>
                {!token.revoked && (
                  confirmingRevoke === String(token._id) ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        className="border border-[#FF7A50] px-3 py-2 text-xs font-black text-[#FF7A50] disabled:opacity-60"
                        disabled={revoking === String(token._id)}
                        onClick={() => void revokeToken(token._id as Id<"agentTokens">)}
                        type="button"
                      >
                        {revoking === String(token._id) ? "Dismissing…" : "Dismiss for good"}
                      </button>
                      <button className="text-xs font-black text-[#8A8177]" onClick={() => setConfirmingRevoke(null)} type="button">Keep</button>
                    </span>
                  ) : (
                    <button
                      aria-label={`Dismiss ${token.label}`}
                      className="flex shrink-0 items-center gap-1 border border-[#2A2521] px-3 py-2 text-xs font-black text-[#8A8177]"
                      onClick={() => setConfirmingRevoke(String(token._id))}
                      type="button"
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" /> Dismiss
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
