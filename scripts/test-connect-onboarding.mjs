import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import * as policy from "../src/lib/stripe-connect-policy.server.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/lib/stripe-connect.functions.ts")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
  .replace(/export const /g, "const ")
  .replaceAll(
    'import("@/lib/stripe-connect-policy.server")',
    "Promise.resolve(policy)",
  )
  .replaceAll(
    'import("@/integrations/supabase/client.server")',
    "Promise.resolve(adminModule)",
  );
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const managed = {
  id: "acct_fixture",
  charges_enabled: false,
  details_submitted: false,
  controller: {
    fees: { payer: "account" },
    losses: { payments: "stripe" },
    requirement_collection: "stripe",
    stripe_dashboard: { type: "full" },
  },
};

function fixture(overrides = {}) {
  const state = {
    business: { id: "salon-fixture", stripe_account_id: null },
    env: { STRIPE_SECRET_KEY: "sk_test_fixture" },
    account: managed,
    reads: [],
    writes: [],
    calls: [],
    ...overrides,
  };
  const db = {
    from: (table) => ({
      select: (columns) => ({
        eq: (column, value) => ({
          maybeSingle: async () => {
            state.reads.push({ table, columns, column, value });
            return { data: state.business, error: state.readError };
          },
        }),
      }),
    }),
  };
  const supabaseAdmin = {
    from: (table) => ({
      update: (values) => {
        const filters = [];
        const query = {
          eq: (column, value) => {
            filters.push(["eq", column, value]);
            return query;
          },
          is: (column, value) => {
            filters.push(["is", column, value]);
            return query;
          },
          select: () => query,
          maybeSingle: async () => {
            state.writes.push({ table, values, filters });
            return {
              data: state.zeroWrite ? null : { id: "salon-fixture" },
              error: state.writeError,
            };
          },
        };
        return query;
      },
    }),
  };
  const provider = async (url, init) => {
    state.calls.push({ path: new URL(url).pathname, init });
    const link = url.endsWith("/account_links");
    return {
      ok: !state.providerError,
      json: async () =>
        state.providerError
          ? { error: { message: "Fixture provider unavailable" } }
          : link
            ? { url: "https://connect.stripe.com/fixture" }
            : state.account,
    };
  };
  const createServerFn = () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn) => fn,
    };
    return chain;
  };
  const handlers = new Function(
    "createServerFn",
    "requireSupabaseAuth",
    "process",
    "policy",
    "adminModule",
    "fetch",
    "trustedAppOrigin",
    js +
      ";return {startStripeOnboarding,getStripeEnvironment,refreshStripeAccount};",
  )(
    createServerFn,
    {},
    { env: state.env },
    policy,
    { supabaseAdmin },
    provider,
    () => "https://bookzenvo.com",
  );
  const context = { userId: "owner-fixture", supabase: db };
  return {
    state,
    run: () => handlers.startStripeOnboarding({ context }),
    environment: () => handlers.getStripeEnvironment({ context }),
    refresh: () => handlers.refreshStripeAccount({ context }),
  };
}

for (const [key, mode] of [
  ["sk_test_fixture", "test"],
  ["rk_test_fixture", "test"],
  ["sk_live_fixture", "live"],
  ["rk_live_fixture", "live"],
  ["", "unconfigured"],
  ["pk_test_fixture", "unconfigured"],
]) {
  const { state, environment } = fixture({ env: { STRIPE_SECRET_KEY: key } });
  assert.deepEqual(
    await environment(),
    { mode },
    "Payment status only exposes verified mode, never a secret",
  );
  assert.equal(state.calls.length, 0);
}
await assert.rejects(
  fixture({ business: null }).environment,
  /Only the business owner/,
);

for (const env of [
  { STRIPE_SECRET_KEY: "sk_live_fixture" },
  {
    STRIPE_SECRET_KEY: "rk_live_fixture",
    ENABLE_STRIPE_LIVE_ONBOARDING: "false",
  },
  {
    STRIPE_SECRET_KEY: "sk_live_fixture",
    ENABLE_STRIPE_LIVE_ONBOARDING: "TRUE",
  },
  {
    STRIPE_SECRET_KEY: "pk_live_fixture",
    ENABLE_STRIPE_LIVE_ONBOARDING: "true",
  },
  {},
]) {
  const { state, run } = fixture({ env });
  await assert.rejects(run);
  assert.equal(
    state.calls.length,
    0,
    "Disabled/invalid configuration must make no Stripe requests",
  );
  assert.equal(state.writes.length, 0);
}
for (const overrides of [
  { business: null },
  { readError: new Error("Read failed") },
]) {
  const { state, run } = fixture(overrides);
  await assert.rejects(run);
  assert.equal(
    state.calls.length,
    0,
    "Tenant ownership must be resolved before Stripe calls",
  );
}

const fresh = fixture();
assert.deepEqual(await fresh.run(), {
  url: "https://connect.stripe.com/fixture",
});
assert.deepEqual(fresh.state.reads[0], {
  table: "businesses",
  columns: "id, stripe_account_id",
  column: "owner_id",
  value: "owner-fixture",
});
assert.deepEqual(
  fresh.state.calls.map((c) => c.path),
  ["/v1/accounts", "/v1/account_links"],
);
const create = fresh.state.calls[0].init;
assert.equal(create.body.get("controller[fees][payer]"), "account");
assert.equal(create.body.get("controller[losses][payments]"), "stripe");
assert.equal(create.body.get("controller[requirement_collection]"), "stripe");
assert.equal(create.body.get("controller[stripe_dashboard][type]"), "full");
assert.equal(create.body.get("metadata[business_id]"), "salon-fixture");
assert.equal(create.body.get("type"), null);
assert.equal(create.body.get("country"), "GB");
assert.equal(fresh.state.writes[0].values.stripe_account_id, "acct_fixture");
assert.deepEqual(fresh.state.writes[0].filters, [
  ["eq", "id", "salon-fixture"],
  ["eq", "owner_id", "owner-fixture"],
  ["is", "stripe_account_id", null],
]);
assert.equal(
  fresh.state.calls[1].init.body.get("return_url"),
  "https://bookzenvo.com/settings?tab=payments&stripe=return",
);

const persistedFailure = fixture({
  writeError: new Error("Storage unavailable"),
});
await assert.rejects(persistedFailure.run, /Storage unavailable/);
assert.equal(
  persistedFailure.state.calls.length,
  1,
  "No onboarding link before durable account association",
);
const zeroWrite = fixture({ zeroWrite: true });
await assert.rejects(zeroWrite.run, /setup changed/);
assert.equal(
  zeroWrite.state.calls.length,
  1,
  "Removed/transferred/relinked businesses cannot receive an orphan onboarding link",
);
const retry = fixture();
await retry.run();
assert.equal(
  retry.state.calls[0].init.headers["Idempotency-Key"],
  create.headers["Idempotency-Key"],
);
assert.notEqual(
  create.headers["Idempotency-Key"],
  "bookzenvo-connect-account-salon-fixture",
  "Changed account parameters require a new idempotency namespace",
);

const legacy = fixture({
  business: { id: "salon-fixture", stripe_account_id: "acct_legacy_test" },
});
await legacy.run();
assert.deepEqual(
  legacy.state.calls.map((c) => c.path),
  ["/v1/account_links"],
);
assert.equal(
  legacy.state.calls[0].init.body.get("account"),
  "acct_legacy_test",
);
assert.equal(
  legacy.state.writes.length,
  0,
  "Existing test ledgers/accounts must not be replaced",
);

const live = {
  STRIPE_SECRET_KEY: "sk_live_fixture",
  ENABLE_STRIPE_LIVE_ONBOARDING: "true",
};
const existingLive = fixture({
  env: live,
  business: { id: "salon-fixture", stripe_account_id: "acct_fixture" },
});
await existingLive.run();
assert.deepEqual(
  existingLive.state.calls.map((c) => c.path),
  ["/v1/accounts/acct_fixture", "/v1/account_links"],
);
assert.equal(existingLive.state.writes.length, 0);
const mismatched = {
  ...managed,
  controller: { ...managed.controller, losses: { payments: "application" } },
};
for (const overrides of [
  { account: mismatched },
  { account: { id: "acct_missing_controller" } },
  {
    env: live,
    business: { id: "salon-fixture", stripe_account_id: "acct_fixture" },
    account: mismatched,
  },
]) {
  const { state, run } = fixture(overrides);
  await assert.rejects(run, /setup review/);
  assert.equal(state.calls.length, 1);
  assert.equal(
    state.writes.length,
    0,
    "Unexpected liability settings must not be attached or silently changed",
  );
}
const unavailable = fixture({ providerError: true });
await assert.rejects(unavailable.run, /Fixture provider unavailable/);
assert.equal(unavailable.state.writes.length, 0);
const linked = { id: "salon-fixture", stripe_account_id: "acct_fixture" };
const refreshed = fixture({ business: linked });
assert.deepEqual(await refreshed.refresh(), {
  chargesEnabled: false,
  detailsSubmitted: false,
});
assert.deepEqual(
  refreshed.state.writes[0].filters,
  [
    ["eq", "id", "salon-fixture"],
    ["eq", "owner_id", "owner-fixture"],
    ["eq", "stripe_account_id", "acct_fixture"],
  ],
  "Refresh must never attach old-account readiness to a relinked or transferred business",
);
const staleRefresh = fixture({ business: linked, zeroWrite: true });
await assert.rejects(staleRefresh.refresh, /setup changed/);
const wrongAccount = fixture({
  business: linked,
  account: { ...managed, id: "acct_wrong" },
});
await assert.rejects(wrongAccount.refresh, /could not be verified/);
assert.equal(wrongAccount.state.writes.length, 0);
const failedRefreshSave = fixture({
  business: linked,
  writeError: new Error("Refresh write failed"),
});
await assert.rejects(failedRefreshSave.refresh, /Refresh write failed/);
console.log(
  "Connect onboarding passed: owner isolation, default-off live gate, Stripe-managed account settings, legacy test ledger preservation, controller validation, persistence/provider failures and stable versioned retry key. All Stripe requests mocked.",
);
