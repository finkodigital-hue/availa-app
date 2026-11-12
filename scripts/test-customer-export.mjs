// Real export handler, inert paginated PostgREST model; no network or real data.
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const own = "tenant-a",
  other = "tenant-b",
  customer = "customer-a";
const id = (i) => String(i).padStart(8, "0");
const makeRows = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: id(i),
    business_id: own,
    customer_id: customer,
    ...extra,
  }));
let state;
function database() {
  return {
    from(table) {
      const f = [],
        orders = [];
      let limit = 1000,
        updated = null;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          f.push([k, v]);
          return q;
        },
        in(k, v) {
          assert.ok(
            state.allowLargeQuery || v.length <= 100,
            "payment ids must stay below a practical URL limit",
          );
          f.push([k, v]);
          return q;
        },
        gt(k, v) {
          f.push([k, { gt: v }]);
          return q;
        },
        order(k, o = {}) {
          orders.push([k, o]);
          return q;
        },
        limit(n) {
          limit = n;
          return q;
        },
        update(v) {
          updated = v;
          return q;
        },
        maybeSingle() {
          return Promise.resolve(result(true));
        },
        then(a, b) {
          return Promise.resolve(result(false)).then(a, b);
        },
      };
      function result(single) {
        state.queries.push({ table, filters: f });
        if (updated) {
          state.completed++;
          return { data: null, error: null };
        }
        if (
          state.fail === table ||
          (state.failLater === table &&
            f.some(([k, v]) => k === "id" && typeof v === "object"))
        )
          return { data: null, error: new Error("injected unavailable page") };
        let rows = state.rows[table] ?? [];
        for (const [k, v] of f)
          rows = rows.filter((r) =>
            Array.isArray(v)
              ? v.includes(r[k])
              : typeof v === "object"
                ? state.repeatCursor || r[k] > v.gt
                : r[k] === v,
          );
        rows = [...rows].sort((a, b) => {
          for (const [k, o] of orders) {
            if (a[k] !== b[k])
              return (a[k] < b[k] ? -1 : 1) * (o.ascending === false ? -1 : 1);
          }
          return 0;
        });
        return {
          data: single
            ? (rows[0] ?? null)
            : rows.slice(0, Math.min(limit, state.cap)),
          error: null,
        };
      }
      return q;
    },
    rpc: async () => ({ data: { requests: [] }, error: null }),
  };
}
const db = database();
function load(file) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      exports,
      Date,
      console,
      require(name) {
        if (name === "@tanstack/react-start")
          return {
            createServerFn() {
              const b = {
                middleware() {
                  return b;
                },
                validator() {
                  return b;
                },
                handler(fn) {
                  return fn;
                },
              };
              return b;
            },
          };
        if (name.endsWith("auth-middleware"))
          return { requireSupabaseAuth: {} };
        if (name.endsWith("verified-identity.server"))
          return {
            requireRecentSensitiveSession() {
              if (state.stale) throw new Error("Recent sign-in required");
            },
          };
        if (name.endsWith("client.server")) return { supabaseAdmin: db };
        if (name.endsWith("customer-export"))
          return load("src/lib/customer-export.ts");
        throw new Error("Unexpected dependency " + name);
      },
    },
  );
  return exports;
}
const { generateCustomerDataExport: handler } = load(
  "src/lib/customer-data-requests.functions.ts",
);
function reset() {
  state = {
    cap: 1000,
    completed: 0,
    queries: [],
    rows: {
      businesses: [{ id: own, name: "Fictional", owner_id: "owner-a" }],
      customer_data_requests: [
        {
          id: "request-a",
          business_id: own,
          customer_id: customer,
          kind: "export",
          status: "pending",
        },
      ],
      customers: [{ id: customer, business_id: own, name: "Synthetic" }],
      bookings: makeRows(1205, { starts_at: "2026-01-01" }),
      payments: makeRows(1305).map((r, i) => ({
        ...r,
        booking_id: id(i % 1205),
      })),
      customer_reviews: makeRows(1005),
      consultation_submissions: makeRows(1010),
    },
  };
  for (const table of [
    "bookings",
    "payments",
    "customer_reviews",
    "consultation_submissions",
  ])
    state.rows[table].push({
      id: "foreign",
      business_id: other,
      customer_id: customer,
      booking_id: id(1),
    });
}
const call = () =>
  handler({
    data: { requestId: "request-a" },
    context: { supabase: db, userId: "owner-a", claims: {} },
  });
reset();
// Run once with no payment URL assertion so the pre-fix handler reveals truncation.
state.rows.payments = [];
state.allowLargeQuery = true;
let result = await call();
assert.equal(
  result.bookings.length,
  1205,
  "export must include records after the provider row cap",
);
reset();
result = await call();
assert.equal(result.bookings.length, 1205);
assert.equal(result.payments.length, 1305);
assert.equal(result.reviews.length, 1005);
assert.equal(result.consultations.length, 1010);
assert.equal(state.completed, 1);
for (const collection of [
  result.bookings,
  result.payments,
  result.reviews,
  result.consultations,
])
  assert.ok(
    collection.every((r) => r.business_id === own),
    "no foreign tenant rows",
  );
reset();
state.cap = 7;
result = await call();
assert.equal(
  result.consultations.length,
  1010,
  "a lower provider cap must not end the export early",
);
reset();
state.fail = "consultation_submissions";
await assert.rejects(call(), /unavailable/);
assert.equal(state.completed, 0, "failed exports remain pending");
reset();
state.failLater = "bookings";
await assert.rejects(call(), /unavailable/);
assert.equal(
  state.completed,
  0,
  "a failed later page must leave the request pending",
);
reset();
state.repeatCursor = true;
await assert.rejects(call(), /complete page/);
assert.equal(
  state.completed,
  0,
  "a repeated cursor must never silently complete",
);
reset();
state.rows.businesses[0].owner_id = "another-owner";
await assert.rejects(call(), /Business not found/);
assert.equal(state.completed, 0);
reset();
state.rows.customer_data_requests[0].business_id = other;
await assert.rejects(call(), /Request not found/);
assert.equal(state.completed, 0);
reset();
state.rows.customers[0].business_id = other;
await assert.rejects(call(), /record could not be found/);
assert.equal(state.completed, 0);
reset();
state.stale = true;
await assert.rejects(call(), /Recent sign-in/);
assert.equal(state.queries.length, 0);
console.log(
  "Customer exports include every page, limit payment query sizes, retain tenant filters and leave failed requests pending.",
);
