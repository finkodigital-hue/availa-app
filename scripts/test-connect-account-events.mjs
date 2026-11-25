import assert from "node:assert/strict";
import fs from "node:fs";
import { createHmac, webcrypto } from "node:crypto";
import ts from "typescript";
import { readBodyWithLimit } from "../src/lib/request-limits.ts";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
// Execute the actual signed webhook handler. Replace only router registration
// and the database/network boundaries; no provider credential or request is used.
const source = read("src/routes/api.stripe-webhook.ts")
  .replace('import { createFileRoute } from "@tanstack/react-router";', "")
  .replace('import { readBodyWithLimit } from "@/lib/request-limits";', "")
  .replace("export const Route", "const Route")
  .replaceAll('await import("@/integrations/supabase/client.server")', "({ supabaseAdmin: database })");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

let assertions = 0;
const same = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions++;
};
const account = (overrides = {}) => ({
  object: "account", id: "acct_fictionalA", charges_enabled: true,
  details_submitted: true, ...overrides,
});
const event = (overrides = {}) => ({
  object: "event", id: "evt_fictionalA", type: "account.updated",
  account: "acct_fictionalA", livemode: false,
  created: Math.floor(Date.now() / 1000), data: { object: account() }, ...overrides,
});
const deauthorized = (overrides = {}) => event({
  type: "account.application.deauthorized", data: { object: { object: "application", id: "ca_fictional" } }, ...overrides,
});
const lostAccess = {
  status: 403, body: { error: { type: "invalid_request_error", code: "account_invalid" } },
};

function fixture() {
  const state = {
    env: { STRIPE_SECRET_KEY: "sk_test_fictional", STRIPE_WEBHOOK_SECRET: "whsec_fictional" },
    businesses: [
      { id: "businessA", stripe_account_id: "acct_fictionalA", stripe_charges_enabled: true, stripe_details_submitted: true },
      { id: "businessB", stripe_account_id: "acct_fictionalB", stripe_charges_enabled: true, stripe_details_submitted: true },
    ],
    provider: { status: 200, body: account() }, calls: [], reads: [], writes: [], errors: [],
    readError: null, writeError: null, onFetch: null, lookupOverride: undefined,
  };
  const database = {
    from(table) {
      assert.equal(table, "businesses", "Account events must never read/write a payment ledger");
      const filters = {};
      let values;
      const query = {
        select(columns) { assert.equal(columns, "id, stripe_account_id"); return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(patch) {
          values = patch;
          for (const [key, value] of Object.entries(patch)) {
            assert.ok(["stripe_charges_enabled", "stripe_details_submitted"].includes(key));
            assert.equal(value, false, "Webhook writes may only revoke readiness");
          }
          return query;
        },
        async maybeSingle() {
          state.reads.push({ ...filters });
          assert.deepEqual(Object.keys(filters), ["stripe_account_id"]);
          if (state.readError) return { data: null, error: state.readError };
          if (state.lookupOverride !== undefined) return { data: state.lookupOverride, error: null };
          const rows = state.businesses.filter(row => row.stripe_account_id === filters.stripe_account_id);
          return rows.length > 1 ? { error: new Error("Ambiguous account") } : { data: rows[0] ? { ...rows[0] } : null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            assert.ok(values, "Only an update may be awaited directly");
            assert.deepEqual(Object.keys(filters).sort(), ["id", "stripe_account_id"]);
            state.writes.push({ values: { ...values }, filters: { ...filters } });
            if (state.writeError) return { error: state.writeError };
            for (const row of state.businesses) {
              if (row.id === filters.id && row.stripe_account_id === filters.stripe_account_id) Object.assign(row, values);
            }
            return { error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const fetchMock = async (url, init) => {
    state.calls.push({ url, init });
    assert.equal(url, "https://api.stripe.com/v1/accounts/acct_fictionalA");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual", "Workers must not follow redirects with credentials");
    assert.equal(init.headers.Authorization, `Bearer ${state.env.STRIPE_SECRET_KEY}`);
    assert.ok(init.signal instanceof AbortSignal);
    const result = state.onFetch ? await state.onFetch() : state.provider;
    if (result instanceof Error) throw result;
    return result.raw === undefined ? Response.json(result.body, { status: result.status })
      : new Response(result.raw, { status: result.status });
  };
  const handler = new Function("createFileRoute", "readBodyWithLimit", "process", "fetch", "database", "crypto", "console",
    compiled + ";return Route.server.handlers.POST;")(
      () => value => value, readBodyWithLimit, { env: state.env }, fetchMock, database, webcrypto,
      { error: (...args) => state.errors.push(args) },
    );
  const send = (payload, options = {}) => {
    const body = options.raw ?? JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000) + (options.offset ?? 0);
    const signature = createHmac("sha256", options.secret ?? state.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${body}`).digest("hex");
    return handler({ request: new Request("https://example.invalid/api/stripe-webhook", {
      method: "POST", body,
      headers: options.unsigned ? {} : { "stripe-signature": `t=${timestamp},v1=${signature}` },
    }) });
  };
  return { state, send };
}

// Untrusted/malformed envelopes are rejected before database/provider access.
for (const options of [{ unsigned: true }, { secret: "wrong_secret" }, { offset: -601 }, { offset: 601 }]) {
  const f = fixture(); same((await f.send(event(), options)).status, 400);
  same(f.state.calls.length + f.state.reads.length + f.state.writes.length, 0);
}
for (const payload of [null, [], true, 42, {}, event({ object: "account" }), event({ id: "evt_bad/path" }),
  event({ created: null }), event({ created: -1 }), event({ created: 1.5 }), event({ livemode: "false" }),
  event({ account: undefined }), event({ account: "acct_bad/path" }), event({ data: null }),
  event({ data: { object: { ...account(), id: "acct_fictionalB" } } }),
  event({ data: { object: { ...account(), object: "customer" } } }),
  deauthorized({ data: { object: { object: "account", id: "acct_fictionalA" } } }),
  deauthorized({ data: { object: { object: "application", id: "ca_bad/path" } } }),
]) {
  const f = fixture(); same((await f.send(payload)).status, 400);
  same(f.state.calls.length + f.state.reads.length + f.state.writes.length, 0);
}
{
  const f = fixture(); same((await f.send(null, { raw: "{" })).status, 400);
  same(f.state.calls.length + f.state.reads.length, 0);
}
// Test/live separation is based on a signed boolean and the server key, not metadata.
for (const [key, livemode] of [["sk_test_fictional", true], ["rk_test_fictional", true], ["sk_live_fictional", false], ["rk_live_fictional", false]]) {
  const f = fixture(); f.state.env.STRIPE_SECRET_KEY = key;
  same((await f.send(event({ livemode }))).status, 200);
  same(f.state.calls.length + f.state.reads.length + f.state.writes.length, 0);
}
for (const key of [undefined, "pk_test_fictional", "unrecognised"]) {
  const f = fixture(); f.state.env.STRIPE_SECRET_KEY = key;
  same((await f.send(event())).status, 500); same(f.state.reads.length + f.state.calls.length, 0);
}
// A second valid signing secret still works; all matching key modes can revoke.
for (const key of ["sk_test_fictional", "rk_test_fictional", "sk_live_fictional", "rk_live_fictional"]) {
  const f = fixture(); f.state.env.STRIPE_SECRET_KEY = key;
  f.state.env.STRIPE_PLATFORM_WEBHOOK_SECRET = "whsec_second";
  f.state.env.ENABLE_STRIPE_LIVE_ONBOARDING = "false";
  f.state.provider.body = account({ charges_enabled: false });
  same((await f.send(event({ livemode: key.includes("_live_") }), { secret: "whsec_second" })).status, 200);
  same(f.state.businesses[0].stripe_charges_enabled, false);
  same(f.state.businesses[0].stripe_details_submitted, true);
  same(f.state.businesses[1].stripe_charges_enabled, true);
  same(f.state.writes[0].filters, { id: "businessA", stripe_account_id: "acct_fictionalA" });
}
// Metadata cannot redirect tenant selection or move the persisted account link.
{
  const f = fixture(); f.state.provider.body = account({ charges_enabled: false, details_submitted: false });
  const payload = event({ data: { object: account({ metadata: { business_id: "businessB" } }) } });
  same((await f.send(payload)).status, 200);
  same(f.state.businesses[0], { id: "businessA", stripe_account_id: "acct_fictionalA", stripe_charges_enabled: false, stripe_details_submitted: false });
  same(f.state.businesses[1].stripe_charges_enabled, true);
}
{
  const f = fixture(); f.state.businesses = [f.state.businesses[1]];
  same((await f.send(event())).status, 200); same(f.state.calls.length + f.state.writes.length, 0);
}
{
  const f = fixture(); f.state.lookupOverride = { id: "businessB", stripe_account_id: "acct_fictionalB" };
  same((await f.send(event())).status, 500); same(f.state.calls.length + f.state.writes.length, 0);
}
{
  const f = fixture(); f.state.businesses.push({ ...f.state.businesses[0], id: "ambiguous" });
  same((await f.send(event())).status, 500); same(f.state.calls.length + f.state.writes.length, 0);
}
// Fresh authoritative state wins over old payload flags in either direction.
{
  const f = fixture();
  same((await f.send(event({ data: { object: account({ charges_enabled: false }) } }))).status, 200);
  same(f.state.businesses[0].stripe_charges_enabled, true); same(f.state.writes.length, 0);
  f.state.provider.body = account({ charges_enabled: false });
  same((await f.send(event())).status, 200); same(f.state.businesses[0].stripe_charges_enabled, false);
  f.state.provider.body = account();
  same((await f.send(event({ created: 1 }))).status, 200);
  same(f.state.businesses[0].stripe_charges_enabled, false, "Even a healthy late reply cannot automatically re-enable readiness");
}
// Duplicate delivery converges to the same flags without clearing IDs or ledger.
{
  const f = fixture(); f.state.provider = lostAccess;
  same((await f.send(deauthorized())).status, 200);
  const afterFirst = structuredClone(f.state.businesses);
  same((await f.send(deauthorized())).status, 200); same(f.state.businesses, afterFirst);
  same(f.state.businesses[0].stripe_account_id, "acct_fictionalA");
  same(f.state.businesses[0].stripe_charges_enabled, false);
  same(f.state.businesses[0].stripe_details_submitted, false);
  same((await f.send(event({ created: 1 }))).status, 200);
  same(f.state.businesses, afterFirst);
}
// A delayed deauthorization after reconnection must not revoke a current account.
{
  const f = fixture(); same((await f.send(deauthorized({ created: 1 }))).status, 200);
  same(f.state.businesses[0].stripe_charges_enabled, true); same(f.state.writes.length, 0);
}
{
  const f = fixture(); f.state.provider.body = { object: "account", id: "acct_fictionalA", deleted: true };
  same((await f.send(event())).status, 200); same(f.state.businesses[0].stripe_charges_enabled, false);
}
// Failures must be retried; only Stripe's explicit account-invalid denial revokes.
for (const provider of [
  { status: 401, body: { error: { type: "invalid_request_error", code: "account_invalid" } } },
  { status: 403, body: { error: { type: "invalid_request_error", code: "permission_denied" } } },
  { status: 403, body: { error: { code: "account_invalid" } } },
  { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing" } } },
  { status: 429, body: { error: { code: "rate_limit" } } },
  { status: 500, body: { error: { code: "account_invalid" } } },
  { status: 302, body: {} }, { status: 200, raw: "not json" },
  { status: 200, body: null }, { status: 200, body: account({ id: "acct_fictionalB" }) },
  { status: 200, body: account({ object: "customer" }) },
  { status: 200, body: account({ charges_enabled: "false" }) },
  { status: 200, body: account({ details_submitted: undefined }) },
  { status: 200, body: account({ livemode: true }) },
  new Error("fictional network failure"), new DOMException("fictional timeout", "TimeoutError"),
]) {
  const f = fixture(); f.state.provider = provider;
  same((await f.send(deauthorized())).status, 500);
  same(f.state.writes.length, 0); same(f.state.businesses[0].stripe_charges_enabled, true);
  same(f.state.errors, [["Stripe connected account status reconciliation failed"]]);
}
{
  const f = fixture(); f.state.readError = new Error("fictional db outage");
  same((await f.send(event())).status, 500); same(f.state.calls.length, 0);
}
{
  const f = fixture(); f.state.provider = lostAccess; f.state.writeError = new Error("fictional write failure");
  same((await f.send(event())).status, 500); same(f.state.businesses[0].stripe_charges_enabled, true);
}
// A business relink during the provider read cannot revoke the replacement link.
{
  const f = fixture(); f.state.onFetch = () => {
    f.state.businesses[0].stripe_account_id = "acct_replacement";
    return lostAccess;
  };
  same((await f.send(event())).status, 200);
  same(f.state.businesses[0].stripe_account_id, "acct_replacement");
  same(f.state.businesses[0].stripe_charges_enabled, true);
}
// Concurrent late healthy responses cannot undo a newer readiness revocation.
{
  const f = fixture();
  let releaseOld, observedOld;
  const oldResponse = new Promise(resolve => { releaseOld = resolve; });
  const started = new Promise(resolve => { observedOld = resolve; });
  let reads = 0;
  f.state.onFetch = () => ++reads === 1 ? (observedOld(), oldResponse) : lostAccess;
  const oldDelivery = f.send(event({ created: 1 }));
  await started;
  same((await f.send(deauthorized())).status, 200);
  releaseOld({ status: 200, body: account() });
  same((await oldDelivery).status, 200);
  same(f.state.businesses[0].stripe_charges_enabled, false);
}

console.log(`Connect account lifecycle: ${assertions} assertions passed using signed fictional events and mocked provider/database boundaries; no external requests.`);
