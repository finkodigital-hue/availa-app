import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import * as rent from "../src/lib/rent.ts";
import { collectRequestPages } from "../src/lib/appointment-waitlist.ts";
const auth = {};
let calls = [],
  responses = [],
  planAllowed = true,
  checks = 0;
const same = (a, b) => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(a)),
    JSON.parse(JSON.stringify(b)),
  );
  checks++;
};
const rejects = async (fn, re) => {
  await assert.rejects(fn, re);
  checks++;
};
const supabase = {
  from(table) {
    const steps = [];
    const q = {
      then(resolve, reject) {
        calls.push({ table, steps });
        return Promise.resolve(responses.shift()).then(resolve, reject);
      },
    };
    for (const method of [
      "select",
      "eq",
      "in",
      "order",
      "range",
      "maybeSingle",
      "update",
      "insert",
    ])
      q[method] = (...args) => {
        steps.push([method, ...args]);
        return q;
      };
    return q;
  },
  rpc(name, args) {
    calls.push({ rpc: name, args });
    return Promise.resolve(responses.shift());
  },
};
const factory = () => {
  let validate = (x) => x;
  const builder = {
    middleware(list) {
      assert.equal(list.length, 1);
      assert.equal(list[0], auth);
      checks++;
      return builder;
    },
    validator(fn) {
      validate = fn;
      return builder;
    },
    handler(fn) {
      return async (input) => fn({ ...input, data: validate(input?.data) });
    },
  };
  return builder;
};
const modules = {
  "@tanstack/react-start": { createServerFn: factory },
  "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: auth },
  "@/lib/plan.server": {
    assertStudio: async () => {
      if (!planAllowed) throw new Error("Studio plan required");
    },
  },
  "@/lib/rent": rent,
  "@/lib/appointment-waitlist": { collectRequestPages },
};
const exports = {};
const source = fs.readFileSync(
  new URL("../src/lib/rent.functions.ts", import.meta.url),
  "utf8",
);
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports,
    require: (name) => {
      assert.ok(name in modules, name);
      return modules[name];
    },
    Date,
    Error,
  },
);
const id = (n) => `72000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { supabase, userId: id(1) },
  business = { data: { id: id(101) }, error: null },
  link = { data: { id: id(201) }, error: null };
const reset = (items) => {
  responses = items;
  calls = [];
  planAllowed = true;
};
reset([business, { data: null, error: null }]);
await rejects(
  () =>
    exports.setRentPaymentStatus({
      context,
      data: { id: id(301), linkId: id(201), status: "paid" },
    }),
  /Professional link not found/,
);
same(calls.length, 2);
assert.ok(
  calls[1].steps.some(
    (s) => s[0] === "eq" && s[1] === "salon_business_id" && s[2] === id(101),
  ),
);
checks++;
reset([business, link, { data: null, error: null }]);
await rejects(
  () =>
    exports.setRentPaymentStatus({
      context,
      data: { id: id(301), linkId: id(201), status: "paid" },
    }),
  /Rent payment not found/,
);
assert.ok(
  calls[2].steps.some(
    (s) =>
      s[0] === "eq" && s[1] === "salon_professional_id" && s[2] === id(201),
  ),
);
checks++;
reset([]);
await rejects(
  () =>
    exports.setRentPaymentStatus({
      context,
      data: { id: id(301), linkId: id(201), status: "deleted" },
    }),
  /valid rent status/,
);
same(calls.length, 0);
reset([business]);
planAllowed = false;
await rejects(
  () =>
    exports.generateNextRentPayment({
      context,
      data: { linkId: id(201), requestId: id(401) },
    }),
  /Studio plan/,
);
same(calls.length, 1);
reset([business, link, { error: null }]);
await exports.generateNextRentPayment({
  context,
  data: { linkId: id(201), requestId: id(401) },
});
same(calls[2], {
  rpc: "generate_rent_payment",
  args: { _link_id: id(201), _request_id: id(401) },
});
const input = {
  linkId: id(201),
  requestId: id(401),
  periodStart: "2026-11-01",
  periodEnd: "2026-11-08",
  dueDate: "2026-11-08",
  amountCents: 10001,
  alreadyPaid: false,
};
const existing = {
  id: id(401),
  salon_professional_id: id(201),
  period_start: input.periodStart,
  period_end: input.periodEnd,
  due_date: input.dueDate,
  amount_cents: input.amountCents,
};
reset([
  business,
  link,
  { error: { code: "23505" } },
  { data: existing, error: null },
]);
same(await exports.addRentPayment({ context, data: input }), { ok: true });
reset([
  business,
  link,
  { error: { code: "23505" } },
  { data: { ...existing, amount_cents: 999 }, error: null },
]);
await rejects(
  () => exports.addRentPayment({ context, data: input }),
  /different rent details/,
);
reset([
  business,
  link,
  { error: { code: "23505" } },
  { data: null, error: null },
]);
await rejects(
  () => exports.addRentPayment({ context, data: input }),
  /different rent details/,
);
reset([
  business,
  { data: [{ id: id(201) }], error: null },
  ...Array.from({ length: 2 }, (_, page) => ({
    data: Array.from({ length: 500 }, (_, n) => ({ id: page * 500 + n })),
    error: null,
  })),
  { data: [{ id: 1000 }], error: null },
]);
same((await exports.getRentPayments({ context })).length, 1001);
same(
  calls
    .filter((c) => c.table === "rent_payments")
    .map((c) => c.steps.find((s) => s[0] === "range")),
  [
    ["range", 0, 499],
    ["range", 500, 999],
    ["range", 1000, 1499],
  ],
);
console.log(
  `${checks} rent server boundary, retry, plan and pagination assertions passed; provider calls mocked`,
);
