import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const workflow = fs.readFileSync(
  ".github/workflows/production-error-alerts.yml",
  "utf8",
);
const match = workflow.match(
  /node --input-type=module <<'EOF'\r?\n([\s\S]*?)\r?\n\s*EOF/,
);
assert.ok(match, "Execute the actual workflow's inline script");
let source = match[1]
  .split(/\r?\n/)
  .map((line) => line.replace(/^ {10}/, ""))
  .join("\n");
assert.equal(source.match(/process\.exit\(0\);/g)?.length, 1);
// Preserve success exit semantics without exiting this test process.
source = source.replace("process.exit(0);", "return;");
const now = Date.parse("2026-11-13T10:00:00Z");
class Clock extends Date {
  constructor(...args) {
    super(...(args.length ? args : [now]));
  }
  static now() {
    return now;
  }
}
const counters = [
  "count",
  "unresolvedDeliveries",
  "unresolvedChangeEmails",
  "unresolvedPayments",
  "unresolvedBalanceCheckouts",
  "unresolvedGiftRefunds",
  "unresolvedRefunds",
  "unresolvedErasureStorageJobs",
  "stalledErasureStorageJobs",
];
const healthy = {
  status: "ok",
  checkedAt: new Date(now).toISOString(),
  windowMinutes: 20,
  threshold: 5,
  ...Object.fromEntries(counters.map((field) => [field, 0])),
  reminderCronStale: false,
  reminderCronLastStartedAt: new Date(now - 60_000).toISOString(),
  reminderCronLastCompletedAt: new Date(now - 30_000).toISOString(),
  reminderCronLastSuccessAt: new Date(now - 30_000).toISOString(),
};
function response(
  body = healthy,
  status = 200,
  url = "https://bookzenvo.com/api/monitoring/client-errors",
  headers = {},
) {
  const r = new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers },
  );
  Object.defineProperty(r, "url", { value: url });
  Object.defineProperty(r, "text", {
    value() {
      throw Error("Unbounded body reader used");
    },
  });
  return r;
}
let checks = 0;
async function run(
  factory,
  expectedFailure,
  expectedCalls = expectedFailure ? 3 : 1,
) {
  const logs = [];
  let calls = 0,
    failure;
  const context = vm.createContext({
    process: { env: { MONITORING_SECRET: "PRIVATE_FIXTURE_TOKEN" } },
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, "https://bookzenvo.com/api/monitoring/client-errors");
      assert.equal(
        options.redirect,
        "error",
        "Authenticated monitor must reject redirects before following them",
      );
      assert.equal(
        options.headers.authorization,
        "Bearer PRIVATE_FIXTURE_TOKEN",
      );
      return factory(calls);
    },
    console: {
      log: (...args) => logs.push(args.join(" ")),
      error: (...args) => logs.push(args.join(" ")),
    },
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    AbortSignal: { timeout: () => new AbortController().signal },
    Date: Clock,
    URL,
    TextDecoder,
  });
  try {
    await vm.runInContext(`(async()=>{${source}\n})()`, context);
  } catch (error) {
    failure = error;
  }
  if (expectedFailure) {
    assert.ok(failure, expectedFailure);
    assert.equal(failure.message, expectedFailure);
  } else assert.equal(failure, undefined);
  assert.equal(calls, expectedCalls);
  assert.ok(
    !logs.join("\n").includes("PRIVATE_"),
    "Neither response/provider contents nor the token may be logged",
  );
  if (failure) assert.ok(!failure.message.includes("PRIVATE_"));
  checks++;
  return logs;
}
await run(() => response());
await run(
  (attempt) => {
    if (attempt === 1) throw Error("PRIVATE_PROVIDER_FAILURE");
    return response();
  },
  undefined,
  2,
);
await run(() => {
  throw Error("PRIVATE_PROVIDER_FAILURE");
}, "Incident request failed");
await run(
  () => response(healthy, 200, "https://elsewhere.invalid/PRIVATE_REDIRECT"),
  "Unexpected incident response origin",
);
await run(() => response("PRIVATE_HTML_BODY"), "Invalid incident response");
await run(
  () => response({ status: "PRIVATE_STATUS" }),
  "Invalid incident response",
);
await run(
  () =>
    response(
      {
        status: "error",
        checkedAt: healthy.checkedAt,
        private: "PRIVATE_DATABASE_BODY",
      },
      503,
    ),
  "Incident endpoint reported an error",
);
for (const field of counters) {
  for (const value of [
    null,
    -1,
    0.1,
    "PRIVATE_COUNTER",
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await run(
      () => response({ ...healthy, [field]: value }),
      "Invalid incident response",
    );
  }
}
for (const field of [
  "checkedAt",
  "reminderCronLastStartedAt",
  "reminderCronLastCompletedAt",
  "reminderCronLastSuccessAt",
]) {
  for (const value of [
    undefined,
    "PRIVATE_BAD_TIMESTAMP",
    "2026-02-31T00:00:00Z",
    new Date(now + 1).toISOString(),
  ]) {
    await run(
      () => response({ ...healthy, [field]: value }),
      "Invalid incident timestamp",
    );
  }
}
await run(
  () =>
    response({
      ...healthy,
      checkedAt: new Date(now - 6 * 60_000).toISOString(),
    }),
  "Invalid incident timestamp",
);
await run(
  () => response({ ...healthy, reminderCronStale: "false" }),
  "Invalid incident response",
);
await run(
  () => response({ ...healthy, threshold: -1 }),
  "Invalid incident response",
);
await run(
  () => response({ ...healthy, count: 5 }),
  "Incident endpoint reports a problem",
);
await run(
  () => response({ ...healthy, unresolvedDeliveries: 1 }),
  "Incident endpoint reports a problem",
);
await run(
  () => response({ ...healthy, reminderCronLastSuccessAt: null }),
  "Incident endpoint reports a problem",
);
await run(
  () =>
    response({
      ...healthy,
      reminderCronLastSuccessAt: new Date(now - 41 * 60_000).toISOString(),
    }),
  "Incident endpoint reports a problem",
);
await run(
  () => response({ ...healthy, status: "alert" }, 503),
  "Incident endpoint reports a problem",
);
await run(() => response(healthy, 503), "Incident endpoint reports a problem");
await run(
  () => response(healthy, 200, undefined, { "content-length": "65536" }),
  "Incident response too large",
);
let cancelled = 0,
  produced = 0;
await run(() => {
  let chunks = 0;
  const r = new Response(
    new ReadableStream({
      pull(controller) {
        chunks++;
        produced++;
        if (chunks <= 100) controller.enqueue(new Uint8Array(4096));
        else controller.close();
      },
      cancel() {
        cancelled++;
      },
    }),
  );
  Object.defineProperty(r, "url", {
    value: "https://bookzenvo.com/api/monitoring/client-errors",
  });
  return r;
}, "Incident response too large");
assert.equal(cancelled, 3);
assert.ok(
  produced <= 21,
  "Reader cancels early rather than consuming unbounded response",
);
console.log(
  `${checks} actual incident workflow scenarios passed: redirect rejection, bounded stream reading, strict schema/time checks, retry recovery and fixed safe logs.`,
);
