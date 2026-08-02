import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    JAMBASE_API_KEY: v.string(),
  },
});

export default app;
