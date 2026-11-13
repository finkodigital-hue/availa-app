import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { hasExpectedBearer } from "../src/lib/internal-auth.server.ts";

const now = Date.parse("2026-11-13T10:00:00Z");
class Clock extends Date {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
}
const heartbeat = {
  last_started_at: new Date(now - 60_000).toISOString(),
  last_completed_at: new Date(now - 30_000).toISOString(),
  last_success_at: new Date(now - 30_000).toISOString(),
};
const countKeys = [
  "client_errors",
  "notification_deliveries",
  "booking_change_email_outbox",
  "booking_payment_issues",
  "balance_checkout_attempts",
  "gift_card_refunds",
  "stripe_refund_reviews",
  "customer_erasure_storage_jobs:failed",
  "customer_erasure_storage_jobs:pending",
];
let overrides = {},
  rejected = new Set(),
  calls = [],
  logged = [];
const env = {
  MONITORING_SECRET: "legacy-fixture-token",
  MONITORING_CRON_SECRET: "cron-fixture-token",
};
const db = {
  from(table) {
    const filters = [];
    const query = {
      then(resolve, reject) {
        const status = filters.find(
          (f) => f[0] === "eq" && f[1] === "status",
        )?.[2];
        const key =
          table === "customer_erasure_storage_jobs"
            ? `${table}:${status}`
            : table;
        calls.push({ table, key, filters });
        if (rejected.has(key))
          return Promise.reject(new Error("PRIVATE_DB_FAILURE_BODY")).then(
            resolve,
            reject,
          );
        const result =
          overrides[key] ??
          (table === "operational_job_heartbeats"
            ? { data: heartbeat, error: null }
            : { count: 0, error: null });
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    for (const method of ["select", "gte", "eq", "in", "lt", "maybeSingle"])
      query[method] = (...args) => {
        filters.push([method, ...args]);
        return query;
      };
    return query;
  },
};
const exports = {};
const modules = {
  "@tanstack/react-router": { createFileRoute: () => (config) => config },
  "@/integrations/supabase/client.server": { supabaseAdmin: db },
  "@/lib/internal-auth.server": { hasExpectedBearer },
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/routes/api/monitoring/client-errors.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports,
    require: (n) => {
      assert.ok(n in modules);
      return modules[n];
    },
    process: { env },
    Request,
    Response,
    Date: Clock,
    console: { error: (...args) => logged.push(args) },
  },
);
const handler = exports.Route.server.handlers.GET;
let checks = 0;
async function check(
  expectedCode,
  expectedStatus,
  token = "legacy-fixture-token",
) {
  const response = await handler({
    request: new Request(
      "https://example.invalid/api/monitoring/client-errors",
      { headers: token === null ? {} : { authorization: `Bearer ${token}` } },
    ),
  });
  const result = await response.json();
  assert.equal(response.status, expectedCode);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.checkedAt, new Date(now).toISOString());
  if (expectedStatus) assert.equal(result.status, expectedStatus);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_DB_FAILURE_BODY"));
  checks++;
  return result;
}
await check(200, "ok");
await check(200, "ok", "cron-fixture-token");
for (const token of [null, "wrong", ""]) {
  calls = [];
  await check(404, undefined, token);
  assert.equal(calls.length, 0);
}
env.MONITORING_SECRET = "";
await check(200, "ok", "cron-fixture-token");
env.MONITORING_CRON_SECRET = "";
await check(404, undefined, "cron-fixture-token");
env.MONITORING_SECRET = "legacy-fixture-token";
env.MONITORING_CRON_SECRET = "cron-fixture-token";
for (const key of countKeys) {
  for (const count of [
    null,
    -1,
    0.5,
    NaN,
    Infinity,
    "0",
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    overrides = { [key]: { count, error: null } };
    await check(503, "error");
  }
  overrides = {
    [key]: { count: key === "client_errors" ? 5 : 1, error: null },
  };
  await check(503, "alert");
  overrides = {
    [key]: { count: 0, error: { message: "PRIVATE_DB_FAILURE_BODY" } },
  };
  await check(503, "error");
}
for (const field of Object.keys(heartbeat)) {
  for (const value of [
    "bad-date",
    "2026-02-31T10:00:00Z",
    new Date(now + 1).toISOString(),
    123,
    true,
    {},
    undefined,
  ]) {
    overrides = {
      operational_job_heartbeats: {
        data: { ...heartbeat, [field]: value },
        error: null,
      },
    };
    await check(503, "error");
  }
}
overrides = { operational_job_heartbeats: { data: null, error: null } };
assert.equal((await check(503, "alert")).reminderCronStale, true);
overrides = {
  operational_job_heartbeats: {
    data: { ...heartbeat, last_success_at: null },
    error: null,
  },
};
await check(503, "alert");
overrides = {
  operational_job_heartbeats: {
    data: {
      ...heartbeat,
      last_success_at: new Date(now - 41 * 60_000).toISOString(),
    },
    error: null,
  },
};
await check(503, "alert");
for (const data of [[], "bad", undefined]) {
  overrides = { operational_job_heartbeats: { data, error: null } };
  await check(503, "error");
}
overrides = {};
for (const key of [
  "client_errors",
  "notification_deliveries",
  "operational_job_heartbeats",
]) {
  rejected = new Set([key]);
  await check(503, "error");
}
rejected.clear();
overrides = {
  client_errors: { count: 4, error: null },
  operational_job_heartbeats: {
    data: { ...heartbeat, last_started_at: "2026-11-13T10:00:00.000000+00:00" },
    error: null,
  },
};
const healthy = await check(200, "ok");
assert.equal(healthy.count, 4);
assert.equal(healthy.threshold, 5);
assert.equal(healthy.windowMinutes, 20);
assert.equal(logged.length, 0, "No raw provider/database failure is logged");
console.log(
  `${checks} actual monitoring handler scenarios passed: both tokens, no-store, invalid counters/dates, exceptions, stale alerts and healthy aggregates.`,
);
