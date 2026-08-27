import type { AgentFind, Briefing } from "./briefing";

export function visibleFinds(
  finds: readonly AgentFind[] | undefined,
  dismissed?: readonly string[],
): AgentFind[];

export function briefingIsEmpty(
  briefing: Briefing | undefined,
  dismissed?: readonly string[],
): boolean;

export function timeAgo(at: number, now: number): string;
