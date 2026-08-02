import { action } from "./_generated/server";
import { v } from "convex/values";
import { normalizeUpcomingEvents } from "./jambaseUtils.js";

export const fetchUpcoming = action({
  args: {
    sourceUrl: v.string(),
    festivalId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.JAMBASE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing JAMBASE_API_KEY environment variable");
    }

    const response = await fetch(args.sourceUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "User-Agent": "ShowtonicHack/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`JamBase fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return normalizeUpcomingEvents(payload, args.festivalId);
  },
});
