// Real SDK and browser storage/locks; only the remote provider is inert.
import { createClient } from "@supabase/supabase-js";
import {
  AUTH_STORAGE_KEY,
  getBrowserAuthStorage,
  createAuthSessionStorage,
} from "../../src/lib/auth-session-storage";
import { verifyMfaSession } from "../../src/lib/mfa-session";

const w = window as any;
const storage = getBrowserAuthStorage()!;
const now = Math.floor(Date.now() / 1000);
const token = (id: string, aal: string, variant = "one", exp = now + 3600) =>
  btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })) +
  "." +
  btoa(JSON.stringify({ sub: id, iat: now, exp, aal, variant })).replaceAll(
    "=",
    "",
  ) +
  ".fixture";
const session = (
  id = "owner",
  aal = "aal1",
  variant = "one",
  exp = now + 3600,
) => ({
  access_token: token(id, aal, variant, exp),
  refresh_token: `fixture-${id}-${variant}`,
  expires_at: exp,
  expires_in: exp - now,
  token_type: "bearer",
  user: { id, email: `${id}@example.invalid`, aud: "authenticated" },
});
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
const pause = (name: string) =>
  new Promise<void>((resolve) => {
    w[name + "Started"] = true;
    w[name + "Release"] = resolve;
  });
const fetcher =
  (isolated: boolean): typeof fetch =>
  async (input, init) => {
    const path = new URL(String(input)).pathname;
    w.calls.push({ path, isolated });
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    if (path.endsWith("/user")) {
      const token = new Headers(init?.headers).get("authorization")!.slice(7);
      const claims = JSON.parse(atob(token.split(".")[1]));
      if (!isolated && claims.aal === "aal2" && w.pauseCommit)
        await pause("commit");
      return json(session(claims.sub).user);
    }
    if (path.endsWith("/challenge"))
      return json({
        id: "fixture-challenge",
        type: "totp",
        expires_at: now + 300,
      });
    if (path.endsWith("/verify")) {
      if (w.pauseVerify) await pause("verify");
      if (w.providerError)
        return json({ msg: "PRIVATE_PROVIDER_TOKEN_BODY" }, 400);
      const value = session(
        w.wrongUser ? "other" : "owner",
        w.wrongAal ? "aal1" : w.missingAal ? undefined : "aal2",
        "verified",
        w.expired ? now - 100 : now + 3600,
      );
      if (w.wrongSubject)
        value.access_token = token("other", "aal2", "verified");
      if (w.missingAal)
        value.access_token = token("owner", undefined as any, "verified");
      if (w.malformed) value.access_token = "PRIVATE_MALFORMED_TOKEN";
      const { expires_at: _expiresAt, ...response } = value;
      return json(response);
    }
    throw new Error("Unexpected inert provider path " + path);
  };
w.calls = [];
w.events = [];
w.accepted = [];
const shared = createClient("https://provider.invalid", "fixture-key", {
  global: { fetch: fetcher(false) },
  auth: {
    storage: {
      ...storage,
      setItem: async (key, value) => {
        await storage.setItem(key, value);
        if (
          key === AUTH_STORAGE_KEY &&
          w.pauseNotify &&
          JSON.parse(value).access_token ===
            session("owner", "aal2", "verified").access_token
        )
          await pause("notify");
      },
    },
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
shared.auth.onAuthStateChange((event, value) => {
  w.events.push({ event, user: value?.user.id ?? null });
  if (storage.isCurrent(value))
    w.accepted.push({ event, user: value?.user.id ?? null });
});
w.seed = async () => {
  await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session()));
};
w.signIn = async (id: string, variant = "one") => {
  const { error } = await shared.auth.setSession(session(id, "aal1", variant));
  if (error) throw error;
};
w.signOut = async () => {
  const { error } = await shared.auth.signOut();
  if (error) throw error;
};
w.current = () => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};
w.begin = (noLocks = false) => {
  w.status = "pending";
  w.error = null;
  w.abort = new AbortController();
  const isolated = createClient("https://provider.invalid", "fixture-key", {
    global: { fetch: fetcher(true) },
    auth: {
      storageKey: `isolated-${crypto.randomUUID()}`,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  void verifyMfaSession(
    { factorId: "fixture-factor", code: "123456", signal: w.abort.signal },
    shared.auth,
    isolated.auth,
    noLocks ? createAuthSessionStorage(localStorage) : storage,
  ).then(
    () => {
      w.status = "done";
    },
    (error) => {
      w.status = "rejected";
      w.error = error.message;
    },
  );
};
w.storage = storage;
await shared.auth.initialize();
w.ready = true;
