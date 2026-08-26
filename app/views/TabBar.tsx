"use client";

import type { ReactNode } from "react";
import { Bell, CircleUserRound, Library, Sparkles, SquarePlus } from "lucide-react";
import { activeTab, tabDestination, visibleTabs } from "../navigation.js";
import type { CatalogMode, View } from "./shared";

const tabIcons: Record<string, ReactNode> = {
  discover: <Sparkles key="discover" />,
  diary: <Library key="diary" />,
  log: <SquarePlus key="log" />,
  activity: <Bell key="activity" />,
};

export function Header({ handle, onLogo, onProfile }: { handle: string; onLogo: () => void; onProfile: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0908]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <button className="flex items-center gap-2 text-left" onClick={onLogo} type="button">
          <span aria-hidden className="h-6 w-2 bg-[#FF7A50]" />
          <h1 className="text-xl font-black uppercase tracking-[0.28em]">Showtonic</h1>
        </button>
        <button
          aria-label={`Open @${handle} profile`}
          className="flex items-center gap-2 border border-[#2A2521] px-3 py-2 text-xs"
          onClick={onProfile}
          type="button"
        >
          <CircleUserRound className="h-4 w-4 text-[#FF7A50]" /> @{handle}
        </button>
      </nav>
    </header>
  );
}

export function TabBar({
  view,
  catalogMode,
  cameFrom,
  hasSocialContent,
  socialEnabled,
  onTab,
}: {
  view: View;
  catalogMode: CatalogMode;
  cameFrom: string;
  hasSocialContent: boolean;
  socialEnabled: boolean;
  onTab: (destination: { view: View; catalogMode: CatalogMode }, tab: string) => void;
}) {
  const tabs = visibleTabs({ socialEnabled, hasSocialContent });
  const current = activeTab(view, { catalogMode, cameFrom });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0A0908]/95 backdrop-blur">
      <div
        className="mx-auto grid max-w-6xl p-2"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <button
            aria-current={current === item.tab ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-1 text-[10px] ${current === item.tab ? "text-[#FF7A50]" : "text-[#8A8177]"}`}
            key={item.tab}
            onClick={() => onTab(tabDestination(item.tab) as { view: View; catalogMode: CatalogMode }, item.tab)}
            type="button"
          >
            <span className="[&>svg]:h-5 [&>svg]:w-5">{tabIcons[item.tab]}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
