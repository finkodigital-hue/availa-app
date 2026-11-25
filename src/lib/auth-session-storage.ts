import type { Session } from "@supabase/supabase-js";

export const AUTH_STORAGE_KEY = "bookzenvo-auth";
export const AUTH_COMMIT_LOCK = `${AUTH_STORAGE_KEY}:commit`;
export const AUTH_EPOCH_KEY = `${AUTH_STORAGE_KEY}:epoch`;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Locks = Pick<LockManager, "request">;
type Snapshot = { raw: string; epoch: string; session: Session };
type Guard = { snapshot: Snapshot; signal?: AbortSignal; used: boolean };

export class AuthSessionChangedError extends Error {
  constructor() {
    super("Your sign-in changed. Please refresh the page and try again.");
  }
}

function readSession(raw: string | null): Session | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value &&
      typeof value.access_token === "string" &&
      typeof value.refresh_token === "string" &&
      typeof value.user?.id === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

/** All current website/native primary-session writers share this commit lock.
 * The random, nonsecret epoch detects remove/re-add of the very same session.
 * Old already-open website versions do not participate; reload them on release.
 */
export function createAuthSessionStorage(storage: StorageLike, locks?: Locks) {
  const guards = new Map<string, Guard>();
  const locked = <T>(operation: () => T): Promise<T> =>
    locks
      ? locks.request(AUTH_COMMIT_LOCK, { mode: "exclusive" }, operation)
      : Promise.resolve().then(operation);
  const advance = () => storage.setItem(AUTH_EPOCH_KEY, crypto.randomUUID());
  const run = (write: () => void): Promise<void> =>
    locked(() => {
      advance();
      // Native callbacks must remain synchronous inside the shared lock.
      write();
    });
  return {
    getItem: (key: string) => storage.getItem(key),
    setItem: async (key: string, value: string) => {
      if (key !== AUTH_STORAGE_KEY) return storage.setItem(key, value);
      await locked(() => {
        const candidate = readSession(value);
        const guard = candidate
          ? guards.get(candidate.access_token)
          : undefined;
        if (
          guard &&
          (guard.used ||
            guard.signal?.aborted ||
            storage.getItem(AUTH_STORAGE_KEY) !== guard.snapshot.raw ||
            storage.getItem(AUTH_EPOCH_KEY) !== guard.snapshot.epoch ||
            candidate?.user.id !== guard.snapshot.session.user.id)
        ) {
          throw new AuthSessionChangedError();
        }
        if (guard) guard.used = true;
        advance();
        // Use normal methods: native's prototype hooks relay successful writes.
        storage.setItem(key, value);
        // Native sign-out deliberately ignores later writes. Do not report a
        // commit, or let the SDK emit SIGNED_IN, if its hook rejected this one.
        if (storage.getItem(key) !== value) throw new AuthSessionChangedError();
      });
    },
    removeItem: async (key: string) => {
      if (key !== AUTH_STORAGE_KEY) return storage.removeItem(key);
      await run(() => storage.removeItem(key));
    },
    run,
    capture: async (): Promise<Snapshot> => {
      if (!locks)
        throw new Error(
          "This browser cannot safely complete this security check. Please use an up-to-date browser and try again.",
        );
      return locked(() => {
        const raw = storage.getItem(AUTH_STORAGE_KEY);
        const session = readSession(raw);
        if (!raw || !session) throw new AuthSessionChangedError();
        if (!storage.getItem(AUTH_EPOCH_KEY)) advance();
        return { raw, session, epoch: storage.getItem(AUTH_EPOCH_KEY)! };
      });
    },
    guard: (candidate: Session, snapshot: Snapshot, signal?: AbortSignal) => {
      if (
        candidate.user.id !== snapshot.session.user.id ||
        guards.has(candidate.access_token)
      )
        throw new AuthSessionChangedError();
      const guard: Guard = { snapshot, signal, used: false };
      guards.set(candidate.access_token, guard);
      return () => {
        if (guards.get(candidate.access_token) === guard)
          guards.delete(candidate.access_token);
      };
    },
    isCurrent: (
      session: Pick<Session, "access_token" | "user"> | null,
    ): boolean => {
      try {
        const current = readSession(storage.getItem(AUTH_STORAGE_KEY));
        return session
          ? current?.access_token === session.access_token &&
              current.user.id === session.user.id
          : current === null;
      } catch {
        return false;
      }
    },
  };
}

export type AuthSessionStorage = ReturnType<typeof createAuthSessionStorage>;

declare global {
  interface Window {
    __bookzenvoAuthCommit?: { run: (write: () => void) => Promise<void> };
  }
}

let browserStorage: AuthSessionStorage | undefined;
export function getBrowserAuthStorage(): AuthSessionStorage | undefined {
  if (typeof window === "undefined") return undefined;
  if (!browserStorage) {
    browserStorage = createAuthSessionStorage(
      window.localStorage,
      window.navigator.locks,
    );
    window.__bookzenvoAuthCommit = { run: browserStorage.run };
  }
  return browserStorage;
}

export function isCurrentBrowserAuthSession(session: Session | null): boolean {
  try {
    return getBrowserAuthStorage()?.isCurrent(session) ?? false;
  } catch {
    return false;
  }
}
