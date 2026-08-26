import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const { d1, r2 } = hostingConfig;
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [{ binding: d1, database_name: "showtonic-d1", database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID }]
    : [],
  r2_buckets: r2 ? [{ binding: r2, bucket_name: "showtonic-r2" }] : [],
  // Serve on <name>.<subdomain>.workers.dev. Without this the deploy succeeds
  // but the route is never enabled and every request returns Cloudflare 1042.
  workers_dev: true,
  // Public deployment URL, not a secret — the browser already ships it.
  vars: { CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://curious-corgi-815.convex.cloud" },
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // exifr is imported lazily inside the browser (app/photoMeta.js) to keep
    // Node built-ins out of the Workers SSR bundle. Vite's dependency scan
    // cannot see a dynamic import, so without this it optimizes exifr on first
    // scan and force-reloads the page — mid-flow, exactly when someone is
    // reclaiming their camera roll. Pre-bundling it keeps the scan atomic.
    optimizeDeps: { include: ["exifr"] },
    server: isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, config: localBindingConfig }),
    ],
  };
});
