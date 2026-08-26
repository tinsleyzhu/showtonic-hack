export type TabItem = {
  tab: string;
  label: string;
  view: string;
  requiresSocial?: boolean;
};

export function visibleTabs(flags?: {
  socialEnabled?: boolean;
  hasSocialContent?: boolean;
}): TabItem[];

export function activeTab(
  view: string,
  context?: { catalogMode?: string; cameFrom?: string },
): string;

export function tabDestination(tab: string): {
  view: string;
  catalogMode: "upcoming" | "past";
};
