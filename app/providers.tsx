"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#14181C] px-6 text-[#F4F6F8]">
        <section className="max-w-xl border border-[#42505D] bg-[#202830] p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#20D6AA]">
            Convex setup required
          </p>
          <h1 className="mt-3 text-3xl font-black">Connect the Showtonic backend</h1>
          <p className="mt-4 leading-7 text-[#B8C2CC]">
            Run the command below to create or select a Convex deployment and write
            NEXT_PUBLIC_CONVEX_URL into .env.local.
          </p>
          <code className="mt-5 block bg-[#14181C] p-4 text-sm text-[#47B7EF]">
            npx convex dev
          </code>
        </section>
      </main>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
