export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type OnboardingProfile = {
  completed: boolean;
  handle: string;
  favoriteArtists: string[];
};

export type OnboardingIntent = "explore" | "log";

export type OnboardingShow = {
  artistNames?: readonly string[];
};

export const ONBOARDING_ARTISTS: readonly string[];

export function normalizeOnboardingHandle(value: string): string;
export function validateOnboardingHandle(value: string): {
  handle: string;
  error: string;
};
export function normalizeFavoriteArtists(values: readonly string[]): string[];
export function readOnboardingProfile(storage?: StorageLike | null): OnboardingProfile;
export function writeOnboardingProfile(
  storage: StorageLike | null | undefined,
  profile: Pick<OnboardingProfile, "handle" | "favoriteArtists">,
): OnboardingProfile;
export function prioritizeShowsByArtists<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T[];
export function findFirstPreferredShow<T extends OnboardingShow>(
  shows: readonly T[],
  favoriteArtists: readonly string[],
): T | undefined;
