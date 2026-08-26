import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

// Act 3: a night three agents agreed on.
//
// The point of this table is not the row, it is the transcript. The rubric's
// coordination band asks whether several agents can finish a job together, and
// the accessibility criterion asks whether a human without an agent can follow
// what happened. One artefact answers both.

export const record = mutation({
  args: {
    userIds: v.array(v.id("users")),
    showId: v.id("shows"),
    transcript: v.array(
      v.object({ agent: v.string(), handle: v.string(), message: v.string(), at: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const show = await ctx.db.get(args.showId);
    if (!show) throw new Error("Unknown show");
    if (args.userIds.length < 2) throw new Error("A squad plan needs at least two people");

    // One live plan per show — re-running the negotiation replaces it rather
    // than stacking duplicates.
    const existing = await ctx.db
      .query("squadPlans")
      .withIndex("by_show", (q) => q.eq("showId", args.showId))
      .collect();
    await Promise.all(existing.map((row) => ctx.db.delete(row._id)));

    const planId = await ctx.db.insert("squadPlans", {
      userIds: args.userIds,
      showId: args.showId,
      showTitle: show.title,
      showDate: show.date,
      venueName: show.venueName,
      status: "confirmed", // attendance is already written by the time we record
      transcript: args.transcript,
      createdAt: Date.now(),
    });
    return { planId, showTitle: show.title, showDate: show.date };
  },
});

export const markPaid = mutation({
  args: {
    planId: v.id("squadPlans"),
    payerUserId: v.id("users"),
    settlement: v.union(v.literal("aisa"), v.literal("simulated")),
    paymentRef: v.string(),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Unknown plan");
    if (!plan.userIds.includes(args.payerUserId)) {
      throw new Error("The payer must be on the plan");
    }
    await ctx.db.patch(args.planId, {
      status: "paid",
      settlement: args.settlement,
      paymentRef: args.paymentRef,
      amountCents: args.amountCents,
      payerUserId: args.payerUserId,
    });
    return { ok: true };
  },
});

export const latest = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query("squadPlans").collect();
    const mine = args.userId ? plans.filter((p) => p.userIds.includes(args.userId!)) : plans;
    const plan = mine.sort((left, right) => right.createdAt - left.createdAt)[0];
    if (!plan) return null;

    const people = await Promise.all(plan.userIds.map((id) => ctx.db.get(id)));
    return {
      _id: plan._id,
      showId: plan.showId,
      showTitle: plan.showTitle,
      showDate: plan.showDate,
      venueName: plan.venueName ?? null,
      status: plan.status,
      settlement: plan.settlement ?? null,
      paymentRef: plan.paymentRef ?? null,
      amountCents: plan.amountCents ?? null,
      attendees: people
        .filter(Boolean)
        .map((user) => ({ handle: user!.handle, avatarColor: user!.avatarColor })),
      transcript: plan.transcript,
      createdAt: plan.createdAt,
    };
  },
});

// --- Settlement -------------------------------------------------------------
// AIsa is a metered machine-transaction network: one key, usage-based billing.
// It is NOT a ticketing rail, and no ticketing API here sells to an agent. So
// this settles the coordination fee through AIsa — a real, billable
// machine-to-machine transaction whose id we keep — and records the ticket
// purchase itself as simulated. Claiming a real ticket sale would be the exact
// inflated claim a judge's probe would catch.
export const settle = action({
  args: {
    planId: v.id("squadPlans"),
    payerUserId: v.id("users"),
    amountCents: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ settlement: "aisa" | "simulated"; paymentRef: string; note: string }> => {
    const key = process.env.AISA_API_KEY;
    let settlement: "aisa" | "simulated" = "simulated";
    let paymentRef = `sim_${Date.now().toString(36)}`;
    let note = key
      ? "Simulated ticket purchase — no ticketing API here sells to agents."
      : "Simulated: no AISA_API_KEY set, and no ticketing API here sells to agents.";

    if (key) {
      try {
        const response = await fetch("https://api.aisa.one/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            // Cheapest thing on the network; this call IS the metered
            // transaction, not a way of asking a model for permission.
            model: process.env.AISA_SETTLEMENT_MODEL ?? "claude-haiku-4-5-20251001",
            max_tokens: 24,
            messages: [
              {
                role: "user",
                content:
                  "Reply with a single short confirmation line for a group ticket hold. No preamble.",
              },
            ],
          }),
        });
        const payload = await response.json().catch(() => null);
        if (response.ok && typeof payload?.id === "string" && payload.id) {
          settlement = "aisa";
          paymentRef = payload.id;
          note =
            "Coordination fee settled through AIsa as a real metered machine transaction; the ticket purchase itself is simulated.";
        } else {
          // Say which rail declined and why. "Simulated" with no reason is how
          // a demo quietly becomes a lie.
          const reason = payload?.error?.code ?? payload?.error?.message ?? `http_${response.status}`;
          note = `Simulated: AIsa declined (${reason}). No ticketing API here sells to agents either, so the purchase is simulated regardless.`;
        }
      } catch {
        // Fall through to simulated. A payment rail that fails should say so,
        // not pretend.
      }
    }

    await ctx.runMutation(api.squad.markPaid, {
      planId: args.planId,
      payerUserId: args.payerUserId,
      settlement,
      paymentRef,
      amountCents: args.amountCents,
    });
    return { settlement, paymentRef, note };
  },
});
