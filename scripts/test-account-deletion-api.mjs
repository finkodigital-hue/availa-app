// Actual server handlers and identity helper, inert provider/database/router.
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import * as identity from "../src/lib/verified-identity.server.ts";
import * as validation from "../src/lib/account-deletion.ts";

// Freeze freshness boundaries: elapsed compilation/test time must not turn a
// deliberately future AMR timestamp into an allowed clock-skew timestamp.
const now = Math.floor(Date.now() / 1000);
class FixtureClock extends Date {
  static now() {
    return now * 1000;
  }
}
let checks = 0;
const same = (a, b) => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(a)),
    JSON.parse(JSON.stringify(b)),
  );
  checks++;
};
const rejects = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
  checks++;
};
const load = (path, modules) => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(path, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (name) => {
        assert.ok(name in modules, name);
        return modules[name];
      },
      Date: FixtureClock,
      Error,
      Math,
      Number,
      Set,
    },
  );
  return exports;
};
const verifier = load("../src/lib/verified-account-deletion.server.ts", {
  "@/lib/verified-identity.server": identity,
});
const id = (n) => `99000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const baseUser = {
  id: id(1),
  email: "current@example.invalid",
  email_confirmed_at: "2026-01-01",
};
const baseClaims = {
  sub: id(1),
  email: "old@example.invalid",
  aal: "aal1",
  amr: [{ method: "password", timestamp: now }],
};
let user,
  claims,
  userError,
  claimsError,
  providerReads,
  calls,
  rpcError,
  rpcThrows,
  rpcData,
  token;
const reset = () => {
  user = { ...baseUser };
  claims = { ...baseClaims };
  userError = null;
  claimsError = null;
  providerReads = [];
  calls = [];
  rpcError = null;
  rpcThrows = false;
  token = "fixture-token";
  rpcData = {
    id: id(21),
    status: "requested",
    requested_at: new Date().toISOString(),
    completion_target_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
};
const client = {
  auth: {
    getUser: async (jwt) => {
      providerReads.push(["user", jwt]);
      return { data: { user }, error: userError };
    },
    getClaims: async (jwt) => {
      providerReads.push(["claims", jwt]);
      return { data: { claims }, error: claimsError };
    },
  },
};
const auth = {};
const factory = () => {
  let validate = (value) => value;
  const chain = {
    middleware: (list) => {
      assert.equal(list.length, 1);
      assert.equal(list[0], auth);
      checks++;
      return chain;
    },
    validator: (fn) => {
      validate = fn;
      return chain;
    },
    handler: (fn) => async (input) =>
      fn({ ...input, data: validate(input?.data) }),
  };
  return chain;
};
const functions = load("../src/lib/account-deletion.functions.ts", {
  "@tanstack/react-start": { createServerFn: factory },
  "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: auth },
  "@/lib/account-deletion": validation,
  "@tanstack/react-start/server": {
    getRequest: () =>
      new Request("https://example.invalid", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
  },
  "@/lib/verified-account-deletion.server": verifier,
  "@/integrations/supabase/client.server": {
    supabaseAdmin: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (rpcThrows) throw rpcError;
        return { data: rpcData, error: rpcError };
      },
    },
  },
});
const context = { userId: id(1), supabase: client };
const request = (data = { confirmation: "DELETE", requestKey: id(11) }) =>
  functions.requestMyAccountDeletion({ context, data });
const cancel = (data = { requestId: id(21) }) =>
  functions.cancelMyAccountDeletionRequest({ context, data });
const status = () => functions.getMyAccountDeletionRequest({ context });

reset();
await request();
same(calls, [
  {
    name: "request_account_deletion_server",
    args: {
      p_user_id: id(1),
      p_contact_email: "current@example.invalid",
      p_request_key: id(11),
    },
  },
]);
same(providerReads, [
  ["user", "fixture-token"],
  ["claims", "fixture-token"],
]);
reset();
await cancel();
same(calls, [
  {
    name: "cancel_account_deletion_request_server",
    args: { p_user_id: id(1), p_request_id: id(21) },
  },
]);
reset();
claims = { ...baseClaims, amr: [{ method: "oauth", timestamp: now - 20 }] };
await request();
same(calls.length, 1);
reset();
claims = { ...baseClaims, amr: [{ method: "password", timestamp: now - 700 }] };
await status();
same(calls, [
  { name: "get_account_deletion_status_server", args: { p_user_id: id(1) } },
]);

for (const bad of [
  undefined,
  null,
  [],
  {},
  { confirmation: "delete", requestKey: id(11) },
  { confirmation: "DELETE", requestKey: "bad" },
  { confirmation: "DELETE", requestKey: id(11), userId: id(2) },
  { confirmation: "DELETE", requestKey: id(11), businessId: id(101) },
]) {
  reset();
  await rejects(
    () => request(bad === undefined ? {} : bad),
    /Invalid|Type DELETE/,
  );
  same(calls.length + providerReads.length, 0);
}
reset();
await rejects(() => cancel({ requestId: id(21), userId: id(2) }), /Invalid/);
same(calls.length, 0);
for (const mutate of [
  () => {
    token = "";
  },
  () => {
    user = null;
  },
  () => {
    userError = new Error("revoked");
  },
  () => {
    claimsError = new Error("expired");
  },
  () => {
    claims = { ...baseClaims, sub: id(2) };
  },
  () => {
    user = { ...baseUser, id: id(2) };
    claims = { ...baseClaims, sub: id(2) };
  },
  () => {
    user = { ...baseUser, email_confirmed_at: null };
  },
  () => {
    user = { ...baseUser, is_anonymous: true };
  },
  () => {
    user = {
      ...baseUser,
      banned_until: new Date(Date.now() + 60000).toISOString(),
    };
  },
  () => {
    user = { ...baseUser, deleted_at: new Date().toISOString() };
  },
  () => {
    user = { ...baseUser, factors: [{ status: "verified" }] };
  },
]) {
  for (const action of [request, cancel, status]) {
    reset();
    mutate();
    await rejects(
      () => action(),
      /sign in|Unauthorized|verified|verification|Two-factor/i,
    );
    same(calls.length, 0);
  }
}
for (const amr of [
  [],
  [{ method: "token_refresh", timestamp: now }],
  [{ method: "anonymous", timestamp: now }],
  [{ method: "recovery", timestamp: now }],
  [{ method: "totp", timestamp: now }],
  [{ method: "password", timestamp: now - 601 }],
  [{ method: "oauth", timestamp: now + 61 }],
  [{ method: "password", timestamp: String(now) }],
]) {
  for (const action of [request, cancel]) {
    reset();
    claims = { ...baseClaims, amr };
    await rejects(() => action(), /sign out and sign in again/);
    same(calls.length, 0);
  }
}
reset();
user = { ...baseUser, factors: [{ status: "verified" }] };
claims = { ...baseClaims, aal: "aal2" };
await request();
same(calls.length, 1);
reset();
rpcError = new Error("Internal queue detail owner@example.invalid");
await rejects(
  request,
  /^Error: We couldn't confirm your account request\. Please try again\.$/,
);
reset();
rpcThrows = true;
rpcError = new Error("Rejected database promise with private details");
await rejects(
  request,
  /^Error: We couldn't confirm your account request\. Please try again\.$/,
);
for (const safeMessage of [
  "Deletion request is no longer available. Please refresh.",
  "Deletion processing has started. Contact support if you need to change your request.",
]) {
  reset();
  rpcError = { message: safeMessage };
  try {
    await cancel();
    assert.fail("Expected cancellation error");
  } catch (error) {
    same(error.message, safeMessage);
  }
}
reset();
rpcData = null;
await rejects(request, /could not be confirmed/);
reset();
rpcData = null;
await rejects(cancel, /could not be confirmed/);
reset();
rpcData = null;
same(await status(), null);
console.log(
  `Account deletion API: ${checks} assertions passed; real identity/provider-claims verification, current email, fresh password/OAuth, configured MFA, invalid/revoked/other users, strict body, status/cancel isolation and storage errors. No network or deletion.`,
);
