import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run the real handlers against isolated database/provider doubles. No network
// requests, credentials or live subscription changes are involved.
const source = readFileSync(new URL("../src/lib/billing.functions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(rows, responses = []) {
  const calls = [];
  const database = { from() {
    const filters = [];
    let update;
    const query = {
      select() { return query; },
      update(value) { update = value; return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; },
      async maybeSingle() {
        const data = rows.find((row) => filters.every(([key, value]) => row[key] === value));
        if (data && update) Object.assign(data, update);
        return { data: data ?? null, error: null };
      },
    };
    return query;
  } };
  const modules = {
    "@tanstack/react-start": { createServerFn() {
      const builder = { middleware(items) { assert.equal(items.length, 1); return builder; }, validator() { return builder; }, handler(fn) { return fn; } };
      return builder;
    } },
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@/lib/app-origin.server": { trustedAppOrigin: () => "https://example.test" },
    "@/integrations/supabase/client.server": { supabaseAdmin: database },
  };
  const exports = {};
  new Function("require", "exports", "fetch", "process", compiled)(
    (name) => { assert.ok(modules[name], name); return modules[name]; }, exports,
    async (url, init) => {
      calls.push({ url, body: init.body });
      assert.ok(responses.length, `Unexpected provider request: ${url}`);
      return { ok: true, json: async () => responses.shift() };
    }, { env: { STRIPE_SECRET_KEY: "fake-test-key" } },
  );
  return { exports, calls, context: { userId: "owner", supabase: database } };
}

for (const overrides of [
  { owner_id: "someone-else" },
  { stripe_subscription_id: "sub_paid" },
  { stripe_billing_customer_id: "cus_paid" },
  { plan: "free" },
]) {
  const row = { id: "business", owner_id: "owner", plan: "studio", stripe_subscription_id: null, stripe_billing_customer_id: null, ...overrides };
  const before = { ...row };
  const f = fixture([row]);
  await assert.rejects(f.exports.switchManagedStudioToSolo({ context: f.context }));
  assert.deepEqual(row, before);
}
const row = { id: "business", owner_id: "owner", plan: "studio", stripe_subscription_id: null, stripe_billing_customer_id: null };
const managed = fixture([row]);
await managed.exports.switchManagedStudioToSolo({ context: managed.context });
assert.equal(row.plan, "free");
assert.equal(managed.calls.length, 0);

const portal = fixture([{ id: "business", owner_id: "owner", stripe_subscription_id: "sub_paid", stripe_billing_customer_id: null }], [
  { customer: "cus_recovered" }, { data: [] }, { id: "bpc_new" }, { url: "https://billing.stripe.com/test" },
]);
await portal.exports.openBillingPortal({ context: portal.context });
assert.equal(portal.calls[2].body.get("features[subscription_cancel][enabled]"), "true");
assert.equal(portal.calls[2].body.get("features[subscription_cancel][mode]"), "at_period_end");
assert.equal(portal.calls[3].body.get("customer"), "cus_recovered");
assert.equal(portal.calls[3].body.get("configuration"), "bpc_new");

const stranger = fixture([{ owner_id: "someone-else", stripe_billing_customer_id: "cus_other" }]);
await assert.rejects(stranger.exports.openBillingPortal({ context: stranger.context }));
assert.equal(stranger.calls.length, 0);
console.log("Subscription controls: owner checks, paid-plan guards, managed downgrade and cancellation portal passed.");
