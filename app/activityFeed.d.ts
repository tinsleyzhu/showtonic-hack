import type { AgentActivityItem } from "./briefing";

export type ActivityKind = {
  label: string;
  restraint: boolean;
};

export const ACTIVITY_KINDS: Record<string, ActivityKind>;

export function describeActivityKind(kind: string): ActivityKind;

export function orderActivity(items: readonly AgentActivityItem[]): AgentActivityItem[];

export function describeElapsed(at: number, now: number): string;

export function absoluteTime(at: number): string;

export function refusalReason(item: Pick<AgentActivityItem, "detail">): string;
