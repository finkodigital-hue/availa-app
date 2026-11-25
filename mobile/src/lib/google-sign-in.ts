export const GOOGLE_CALLBACK = "bookzenvo://auth/google";
const MAX_AGE_MS = 10 * 60_000;
type Pending = { state: string; verifier: string; createdAt: number };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Auth = {
  getSession(): Promise<{ data: { session: unknown }; error: unknown }>;
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>;
  signOut(options: { scope: "local" }): Promise<unknown>;
};
type Dependencies = {
  enabled: boolean;
  gateway: string;
  storageKey: string;
  storage: Storage;
  auth: Auth;
  randomBytes(): Promise<Uint8Array>;
  sha256Base64(value: string): Promise<string>;
  openBrowser(url: string, callback: string): Promise<{ type: string; url?: string }>;
  fetch: typeof fetch;
  now?: () => number;
};

export function parseGoogleCallback(value: string) {
  try {
    if (value.length > 8192) return null;
    const url = new URL(value);
    if (url.protocol !== "bookzenvo:" || url.hostname !== "auth" || url.pathname !== "/google" ||
        url.username || url.password || url.port || url.hash) return null;
    const allowed = new Set(["native_state", "code", "error", "error_code", "error_description"]);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return null;
    }
    const state = url.searchParams.get("native_state");
    const code = url.searchParams.get("code");
    const failed = url.searchParams.has("error") || url.searchParams.has("error_code");
    if (!state || !/^[a-f0-9]{64}$/.test(state) || (!!code === failed) || (code && code.length > 2048)) return null;
    return { state, code, failed };
  } catch {
    return null;
  }
}

/** OAuth's temporary verifier is separate from the normal password/recovery session.
 * S256 uses native cryptography; it never falls back to plain PKCE or Math.random.
 * Supabase's public /authorize and /token?grant_type=pkce endpoints perform the
 * exchange; the normal SDK then verifies and persists the resulting session.
 */
export function createGoogleSignIn(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const pendingKey = `${deps.storageKey}.google-pkce`;
  let revision = 0;
  let browserOpen = false;
  let adopting = false;
  let active: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(action: () => Promise<T>) => {
    const result = queue.catch(() => undefined).then(action);
    queue = result;
    return result;
  };
  const readPending = async (): Promise<Pending | null> => {
    const raw = await deps.storage.getItem(pendingKey);
    if (!raw) return null;
    try {
      const item = JSON.parse(raw) as Pending;
      if (/^[a-f0-9]{64}$/.test(item.state) && /^[a-f0-9]{64}$/.test(item.verifier) &&
          Number.isFinite(item.createdAt) && now() >= item.createdAt && now() - item.createdAt <= MAX_AGE_MS) return item;
    } catch { /* A malformed attempt cannot authorise a sign-in. */ }
    await deps.storage.removeItem(pendingKey);
    return null;
  };
  const finish = (value: string) => {
    const requestRevision = revision;
    return enqueue(async () => {
      if (!deps.enabled || requestRevision !== revision) return false;
      const callback = parseGoogleCallback(value);
      if (!callback) throw new Error("The Google sign-in link was not recognised. Please try signing in again.");
      const pending = await readPending();
      if (!pending || requestRevision !== revision) return false;
      if (callback.state !== pending.state) throw new Error("This sign-in link belongs to a different attempt. Please try again.");
      // Consume before exchanging: duplicate OS/browser deliveries cannot replay it.
      await deps.storage.removeItem(pendingKey);
      if (callback.failed) throw new Error("Google sign-in was not completed. Please try again.");
      if (requestRevision !== revision) return false;
      const existing = await deps.auth.getSession();
      if (existing.error || existing.data.session || requestRevision !== revision) return false;
      const response = await deps.fetch(`${deps.gateway}/auth/v1/token?grant_type=pkce`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: "sb_publishable_browser_proxy" },
        body: JSON.stringify({ auth_code: callback.code, code_verifier: pending.verifier }),
      });
      if (!response.ok) throw new Error("Google sign-in has expired or could not connect. Please start again.");
      const tokens = await response.json() as { access_token?: unknown; refresh_token?: unknown };
      if (requestRevision !== revision) return false;
      if (typeof tokens.access_token !== "string" || typeof tokens.refresh_token !== "string" ||
          !tokens.access_token || !tokens.refresh_token || tokens.access_token.length > 200_000 || tokens.refresh_token.length > 8192) {
        throw new Error("Google sign-in could not be verified. Please try again.");
      }
      const current = await deps.auth.getSession();
      if (current.error || current.data.session || requestRevision !== revision) return false;
      adopting = true;
      try {
        const { error } = await deps.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
        if (requestRevision !== revision) {
          // Sign-out during the SDK's pending write must be the final operation.
          await deps.auth.signOut({ scope: "local" });
          return false;
        }
        if (error) throw new Error("Google sign-in could not be verified. Please try again.");
        return true;
      } finally {
        adopting = false;
      }
    });
  };
  const cancel = () => {
    revision++;
    return enqueue(() => deps.storage.removeItem(pendingKey));
  };
  return {
    isAdopting: () => adopting,
    isBrowserOpen: () => browserOpen,
    cancel,
    // The auth browser owns warm callbacks. This handler only recovers a callback
    // after the operating system has restarted the app.
    handleColdCallback: (value: string) => browserOpen ? Promise.resolve(false) : finish(value),
    start() {
      if (active) return active;
      const requestRevision = ++revision;
      active = (async () => {
        if (!deps.enabled || new URL(deps.gateway).protocol !== "https:") throw new Error("Google sign-in is not available in this build.");
        const hex = (bytes: Uint8Array) => {
          if (bytes.length !== 32) throw new Error("Secure sign-in could not start.");
          return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
        };
        const verifier = hex(await deps.randomBytes());
        const state = hex(await deps.randomBytes());
        const challenge = (await deps.sha256Base64(verifier)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error("Secure sign-in could not start.");
        if (requestRevision !== revision) return;
        await enqueue(async () => {
          if (requestRevision !== revision) return;
          await deps.storage.setItem(pendingKey, JSON.stringify({ state, verifier, createdAt: now() }));
        });
        if (requestRevision !== revision) return;
        const callback = `${GOOGLE_CALLBACK}?native_state=${state}`;
        const url = new URL(`${deps.gateway}/auth/v1/authorize`);
        url.search = new URLSearchParams({ provider: "google", redirect_to: callback, code_challenge: challenge, code_challenge_method: "s256", prompt: "select_account" }).toString();
        browserOpen = true;
        const result = await deps.openBrowser(url.href, GOOGLE_CALLBACK);
        browserOpen = false;
        if (requestRevision !== revision) return;
        if (result.type === "success" && result.url) {
          if (!await finish(result.url)) throw new Error("This sign-in attempt has expired. Please try again.");
        } else {
          await cancel();
        }
      })().finally(async () => {
        browserOpen = false;
        // Remove unsuccessful/cancelled attempts before a subsequent flow starts.
        try {
          if (requestRevision === revision) await enqueue(() => deps.storage.removeItem(pendingKey));
        } finally {
          active = null;
        }
      });
      return active;
    },
  };
}
