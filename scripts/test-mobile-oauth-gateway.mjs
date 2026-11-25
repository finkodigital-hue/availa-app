// Native OAuth helper + actual website gateway; every upstream/provider/browser
// adapter is inert. No network, real credentials or account writes.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import ts from "typescript";
import { readBodyWithLimit } from "../src/lib/request-limits.ts";
import {
  createGoogleSignIn,
  GOOGLE_CALLBACK,
} from "../mobile/src/lib/google-sign-in.ts";

const source = fs
  .readFileSync(
    new URL("../src/routes/api/supabase/$.ts", import.meta.url),
    "utf8",
  )
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
  .replace("export const Route", "const Route");
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const calls = [],
  limits = [],
  adopted = [],
  values = new Map();
let limited = false,
  checks = 0;
const same = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
const handlers = new Function(
  "createFileRoute",
  "readBodyWithLimit",
  "consumePublicRequest",
  "publicRequestLimitResponse",
  "fetch",
  "process",
  code + ";return Route.server.handlers;",
)(
  () => (x) => x,
  readBodyWithLimit,
  async (scope) => {
    limits.push(scope);
    if (limited) throw new Error("Fixture quota exceeded");
  },
  () => new Response(null, { status: 429 }),
  async (url, options) => {
    calls.push({ url: new URL(url), options });
    return String(url).includes("/authorize")
      ? new Response(null, {
          status: 302,
          headers: { location: "https://accounts.google.com/fixture-oauth" },
        })
      : Response.json({
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
        });
  },
  {
    env: {
      SUPABASE_URL: "https://database.example.invalid",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_server_fixture",
    },
  },
);
const flow = createGoogleSignIn({
  enabled: true,
  gateway: "https://bookzenvo.com/api/supabase",
  storageKey: "fixture-auth",
  storage: {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  },
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    setSession: async (tokens) => {
      adopted.push(tokens);
      return { error: null };
    },
    signOut: async () => {},
  },
  randomBytes: async () => randomBytes(32),
  sha256Base64: async (value) =>
    createHash("sha256").update(value).digest("base64"),
  openBrowser: async (url, callback) => {
    same(
      callback,
      GOOGLE_CALLBACK,
      "System browser return uses the exact app callback",
    );
    const request = new Request(url);
    same(
      request.headers.get("origin"),
      null,
      "Top-level system browser navigation has no fetch Origin",
    );
    const response = await handlers.GET({ request });
    same(response.status, 302, "Provider redirect passes through gateway");
    same(
      response.headers.get("location"),
      "https://accounts.google.com/fixture-oauth",
    );
    const target = new URL(url).searchParams.get("redirect_to");
    return { type: "success", url: `${target}&code=fixture-code` };
  },
  fetch: async (url, init) => {
    const request = new Request(url, init);
    same(
      request.headers.get("origin"),
      null,
      "Native exchange does not require browser Origin/CORS",
    );
    return handlers.POST({ request });
  },
});

await flow.start();
same(calls.length, 2, "Only authorize and token reach inert upstream");
same(calls[0].url.origin, "https://database.example.invalid");
same(calls[0].url.pathname, "/auth/v1/authorize");
same(calls[0].url.searchParams.get("provider"), "google");
same(calls[0].url.searchParams.get("code_challenge_method"), "s256");
const callback = new URL(calls[0].url.searchParams.get("redirect_to"));
same(
  `${callback.protocol}//${callback.hostname}${callback.pathname}`,
  GOOGLE_CALLBACK,
);
same(
  /^[a-f0-9]{64}$/.test(callback.searchParams.get("native_state")),
  true,
  "Custom callback state survives proxy query forwarding",
);
same(calls[0].options.redirect, "manual");
same(calls[0].options.headers.get("apikey"), "sb_publishable_server_fixture");
same(calls[1].url.pathname, "/auth/v1/token");
same(calls[1].url.searchParams.get("grant_type"), "pkce");
const exchange = JSON.parse(new TextDecoder().decode(calls[1].options.body));
same(exchange.auth_code, "fixture-code");
same(
  calls[0].url.searchParams.get("code_challenge"),
  createHash("sha256").update(exchange.code_verifier).digest("base64url"),
  "Native S256 verifier/challenge survives gateway exchange",
);
same(calls[1].options.headers.get("apikey"), "sb_publishable_server_fixture");
same(limits, ["auth"], "Native PKCE exchange keeps the auth quota");
same(adopted, [
  { access_token: "fixture-access", refresh_token: "fixture-refresh" },
]);
same(values.size, 0, "Successful attempt has no retained verifier");

limited = true;
await assert.rejects(flow.start(), /expired or could not connect/);
checks++;
same(calls.length, 3, "Quota blocks second token request before upstream");
same(adopted.length, 1, "Denied exchange cannot adopt another session");
same(values.size, 0, "Denied attempt also consumes its verifier");
console.log(
  `Native Google/gateway integration: ${checks} assertions passed; real helper and proxy, inert provider/browser/upstream. Hosted callback allowlist and signed-device acceptance remain separate.`,
);
