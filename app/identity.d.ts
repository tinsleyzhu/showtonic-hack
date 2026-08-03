export type KeyedIdentity<T> = {
  handle?: string;
  user: T | null;
  error: string;
};

export function selectIdentityForHandle<T>(
  handle: string | undefined,
  identity: KeyedIdentity<T>,
): Pick<KeyedIdentity<T>, "user" | "error">;
