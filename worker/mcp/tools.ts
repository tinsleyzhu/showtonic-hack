// Tool definitions and dispatch. Every tool declares the scope it needs, and
// the dispatcher refuses before doing any work if the caller lacks it.
//
// The External track's failure mode is "an MCP server that only reads, because
// reading is not using". Five of these seven write.

import { ConvexHttpClient } from "convex/browser";
import type { AgentIdentity } from "./auth";

export type ToolDef = {
  name: string;
  scope: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (client: ConvexHttpClient, me: AgentIdentity, args: Record<string, any>) => Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });

export const TOOLS: ToolDef[] = [
  {
    name: "search_shows",
    scope: "read:shows",
    description:
      "Search Showtonic's live San Francisco catalog by artist, venue, city or title. Returns upcoming and past shows with dates, venues and ticket links.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Artist, venue, or title. Accent- and case-insensitive."),
        upcoming_only: { type: "boolean", description: "Only shows on or after today." },
        limit: { type: "number", description: "Max results, default 20." },
      },
      required: ["query"],
    },
    run: async (client, me, args) => {
      const shows: any[] = await client.query("discovery:search" as any, {
        userId: me.userId,
        query: String(args.query ?? ""),
      });
      const today = new Date().toISOString().slice(0, 10);
      const filtered = args.upcoming_only ? shows.filter((s) => s.date >= today) : shows;
      return filtered.slice(0, Math.min(Number(args.limit) || 20, 50)).map((s) => ({
        showId: s.id,
        title: s.title,
        artists: s.artistNames,
        date: s.date,
        time: s.time,
        venue: s.venueName,
        city: s.city,
        rating: s.rating || null,
        ticketUrl: s.ticketUrl ?? null,
        yourStatus: s.attendanceStatus ?? null,
      }));
    },
  },
  {
    name: "get_taste_profile",
    scope: "read:taste",
    description:
      "The token owner's taste, derived from the shows they actually logged and rated — not a self-declared preference list. Use it before arguing for a show on their behalf.",
    inputSchema: { type: "object", properties: {} },
    run: (client, me) => client.query("agents:tasteProfile" as any, { userId: me.userId }),
  },
  {
    name: "reclaim_camera_roll",
    scope: "write:candidates",
    description:
      "Hand over camera-roll METADATA and get back the nights it reconstructs. Send timestamps (local wall-clock, no timezone suffix) and coordinates where the photo still has them. Pixels are never accepted. Returns scored candidates with human-readable evidence, plus the nights the catalog could not explain. Nothing enters the diary until a human approves it.",
    inputSchema: {
      type: "object",
      properties: {
        photos: {
          type: "array",
          description: "Photo metadata. 3+ evening photos on one night form a cluster.",
          items: {
            type: "object",
            properties: {
              takenAt: str("Local wall-clock ISO, e.g. 2025-11-15T22:41:00 — no Z, no offset."),
              name: str("Optional filename."),
              latitude: { type: "number" },
              longitude: { type: "number" },
            },
            required: ["takenAt"],
          },
        },
      },
      required: ["photos"],
    },
    run: (client, me, args) =>
      client.mutation("agents:reclaimCameraRoll" as any, {
        userId: me.userId,
        photos: (args.photos ?? []).slice(0, 2000),
      }),
  },
  {
    name: "get_pending_candidates",
    scope: "write:candidates",
    description: "Reconstructed nights awaiting the human's yes or no, newest and most confident first.",
    inputSchema: { type: "object", properties: {} },
    run: (client, me) => client.query("backfill:pending" as any, { userId: me.userId }),
  },
  {
    name: "resolve_candidate",
    scope: "write:candidates",
    description:
      "Accept or reject one reconstructed night. Accepting writes a real diary entry, which changes the owner's taste profile.",
    inputSchema: {
      type: "object",
      properties: {
        candidateId: str("From get_pending_candidates."),
        action: { type: "string", enum: ["accept", "reject"] },
        rating: { type: "number", description: "Optional 0.5-5 in half steps." },
      },
      required: ["candidateId", "action"],
    },
    run: (client, me, args) =>
      client.mutation("agents:resolveCandidate" as any, {
        userId: me.userId,
        candidateId: args.candidateId,
        action: args.action,
        ...(args.rating !== undefined ? { rating: Number(args.rating) } : {}),
      }),
  },
  {
    name: "set_attendance",
    scope: "write:attendance",
    description:
      "Mark the owner interested in or going to a show. This is the transaction a coordinating fleet completes once it has agreed on a night.",
    inputSchema: {
      type: "object",
      properties: {
        showId: str("From search_shows."),
        status: { type: "string", enum: ["interested", "going"] },
      },
      required: ["showId", "status"],
    },
    run: async (client, me, args) => {
      await client.mutation("attendance:set" as any, {
        userId: me.userId,
        showId: args.showId,
        status: args.status,
      });
      return { ok: true, showId: args.showId, status: args.status, handle: me.handle };
    },
  },
  {
    name: "log_show",
    scope: "write:logs",
    description:
      "Write a rated diary entry for a show the owner attended. Ratings are 0.5-5 in half-star steps.",
    inputSchema: {
      type: "object",
      properties: {
        showId: str("From search_shows."),
        rating: { type: "number", description: "0.5-5, half steps." },
        vibes: { type: "array", items: { type: "string" }, description: "From the app's fixed vocabulary." },
        note: str("Optional review text."),
      },
      required: ["showId", "rating"],
    },
    run: (client, me, args) =>
      client.mutation("logs:create" as any, {
        userId: me.userId,
        showId: args.showId,
        rating: Number(args.rating),
        vibes: Array.isArray(args.vibes) ? args.vibes : [],
        ...(args.note ? { note: String(args.note) } : {}),
        source: "live",
      }),
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));
