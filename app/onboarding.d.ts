export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type OnboardingProfile = {
  completed: boolean;
  handle: string;
  favoriteArtists: string[];
  homeCity: string;
  visibility: "public" | "private";
};

export type OnboardingIntent = "explore" | "log" | "backfill";

export type OnboardingStep = "welcome" | "identity" | "taste" | "homebase" | "handoff";

export type OnboardingShow = {
  artistNames?: readonly string[];
  date?: string;
};

export const ONBOARDING_ARTISTS: readonly string[];
export const ONBOARDING_STEPS: readonly OnboardingStep[];
export const TASTE_SEED_MIN: number;

export function normalizeOnboardingHandle(value: string): string;
export function validateOnboardingHandle(value: string): {
  handle: string;
  error: string;
};
export function normalizeFavoriteArtists(values: readonly string[]): string[];
export function onboardingStepIndex(step: string): number;
export function nextOnboardingStep(step: string): OnboardingStep;
export function previousOnboardingStep(step: string): OnboardingStep;
export function canLeaveOnboardingStep(
  step: string,
  draft?: { handle?: string; favoriteArtists?: readonly string[] },
): { ok: boolean; reason: string };
export function describeTasteSelection(count: number): string;
export function readOnboardingProfile(storage?: StorageLike | null): OnboardingProfile;
export function writeOnboardingProfile(
  storage: StorageLike | null | undefined,
  profile: Partial<Pick<OnboardingProfile, "handle" | "favoriteArtists" | "homeCity" | "visibility">>,
): OnboardingProfile;
export function writeLoginProfile(
  storage: StorageLike | null | undefined,
  handle: string,
  favoriteArtists?: readonly string[],
): OnboardingProfile;
export function markOnboardingSignedOut(
  storage: StorageLike | null | undefined,
  profile: Partial<Pick<OnboardingProfile, "handle" | "favoriteArtists" | "homeCity" | "visibility">>,
): OnboardingProfile;
export function prioritizeShowsByArtists<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T[];
export function findFirstPreferredShow<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T | undefined;
export function findFirstHistoricalPreferredShow<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
  today: string,
): T | undefined;
