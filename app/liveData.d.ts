import type { Show } from "./data";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LiveMemory = {
  id: string;
  showId: string;
  rating: number;
  note: string;
  caption: string;
  song: string;
  vibes: string[];
  photo: string;
  date: string;
  artistNames: string[];
  artistGenres: string[];
  venueName: string;
  city: string;
};

export function filterMemories(memories: LiveMemory[], filter: string): LiveMemory[];
export function getStoredHandle(storage: StorageLike): string;
export function normalizeHandle(value: unknown): string;
export function parseUploadResponse(value: unknown): string;
export function resolveShowImage(image: unknown, artistNames?: string[]): string;
export function toShow(summary: Record<string, unknown>): Show;
export function toMemory(log: Record<string, unknown>): LiveMemory;
