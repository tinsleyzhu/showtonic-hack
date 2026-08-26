import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleDiscovery, handleMcp } from "./mcp/handler";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
  CONVEX_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Agent surface, ahead of the app router. An agent arriving with nothing
    // but the domain name finds the manifest first, then the MCP endpoint.
    const discovery = handleDiscovery(request);
    if (discovery) return discovery;
    if (url.pathname === "/api/agent/mcp") {
      const convexUrl = env.CONVEX_URL;
      if (!convexUrl) {
        return new Response(
          JSON.stringify({ error: "server_misconfigured", message: "CONVEX_URL is not set on this deployment." }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
      return handleMcp(request, convexUrl);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
