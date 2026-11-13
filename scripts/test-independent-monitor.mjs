import assert from "node:assert/strict";
import worker, {
  MonitorState,
  probeSuite,
  publicHealth,
  INTERVAL_MS,
  MAX_AGE_MS,
  DRILL_EXPIRY_MS,
  BACKUP_MAX_AGE_MS,
} from "../monitoring/worker.mjs";

const now = Date.parse("2026-11-13T12:00:00Z");
const secret = "test-only-monitor-secret-with-32-characters";
const checks = {
  configuration: { status: "ok" },
  supabase: { status: "ok" },
  database: { status: "ok" },
};
const incidents = {
  status: "ok",
  checkedAt: new Date(now).toISOString(),
  threshold: 5,
  windowMinutes: 20,
  count: 0,
  unresolvedDeliveries: 0,
  unresolvedChangeEmails: 0,
  unresolvedPayments: 0,
  unresolvedBalanceCheckouts: 0,
  unresolvedGiftRefunds: 0,
  unresolvedRefunds: 0,
  unresolvedErasureStorageJobs: 0,
  stalledErasureStorageJobs: 0,
  reminderCronStale: false,
  reminderCronLastSuccessAt: new Date(now).toISOString(),
};
const options = { timeoutMs: 100, attempts: 1, sleep: async () => {} };
let total = 0;
async function test(name, fn) {
  await fn();
  total++;
  console.log(`PASS ${name}`);
}
function fixture(transform = () => undefined, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, "https://bookzenvo.com");
    assert.equal(init.redirect, "manual");
    const path = new URL(url).pathname;
    assert.equal(
      init.headers.authorization,
      path === "/api/monitoring/client-errors" ? `Bearer ${secret}` : undefined,
    );
    const changed = await transform(path, url, init);
    if (changed !== undefined) return changed;
    if (path === "/")
      return new Response(
        '<html><body><script src="/assets/index-abc123.js"></script></body></html>',
        { headers: { "content-type": "text/html" } },
      );
    if (path.endsWith(".js"))
      return new Response("console.log(1)", {
        headers: { "content-type": "application/javascript" },
      });
    return Response.json(
      path === "/api/health"
        ? { status: "ok", checkedAt: new Date(now).toISOString(), checks }
        : incidents,
    );
  };
}
const resultFor = (transform, settings = options) =>
  probeSuite(fixture(transform), secret, now, settings);
const failed = (result, name, reason) => {
  assert.equal(result.healthy, false);
  assert.equal(
    result.checks.find((check) => check.name === name)?.reason,
    reason,
  );
};
await test("healthy four probes; secret only on fixed incident URL", async () => {
  const calls = [];
  assert.equal(
    (await probeSuite(fixture(undefined, calls), secret, now, options)).healthy,
    true,
  );
  assert.equal(calls.length, 4);
});
await test("missing secret fails incident probe without issuing privileged request", async () => {
  const calls = [];
  failed(
    await probeSuite(fixture(undefined, calls), "", now, options),
    "incidents",
    "configuration",
  );
  assert.equal(calls.length, 3);
});
await test("302 and307 redirects rejected without follow-up or secret forwarding", async () => {
  for (const status of [302, 307]) {
    const calls = [];
    const result = await probeSuite(
      fixture(
        (path) =>
          path === "/api/monitoring/client-errors"
            ? Response.redirect("https://attacker.invalid/", status)
            : undefined,
        calls,
      ),
      secret,
      now,
      options,
    );
    failed(result, "incidents", "redirect");
    assert.equal(calls.length, 4);
    assert.ok(
      calls.every(
        (call) => new URL(call.url).origin === "https://bookzenvo.com",
      ),
    );
    assert.equal(
      calls.filter((call) => call.init.headers.authorization).length,
      1,
    );
  }
});
await test("redirect response stream is cancelled and never fetched at Location", async () => {
  let cancelled = false;
  failed(
    await resultFor((path) =>
      path === "/api/monitoring/client-errors"
        ? new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            { status: 307, headers: { location: "https://attacker.invalid/" } },
          )
        : undefined,
    ),
    "incidents",
    "redirect",
  );
  assert.equal(cancelled, true);
});
await test("already-followed response is rejected defensively", async () => {
  failed(
    await resultFor((path) => {
      if (path !== "/api/health") return;
      const response = Response.json({ status: "ok" });
      Object.defineProperty(response, "url", {
        value: "https://other.invalid/",
      });
      return response;
    }),
    "dependencies",
    "redirect",
  );
});
await test("malformed JSON and missing health checks fail closed", async () => {
  failed(
    await resultFor((path) =>
      path === "/api/health"
        ? new Response("{", { headers: { "content-type": "application/json" } })
        : undefined,
    ),
    "dependencies",
    "json",
  );
  failed(
    await resultFor((path) =>
      path === "/api/health"
        ? Response.json({
            status: "ok",
            checkedAt: new Date(now).toISOString(),
          })
        : undefined,
    ),
    "dependencies",
    "health",
  );
});
await test("stale/future response timestamps and missing/negative/string counts fail closed", async () => {
  for (const change of [
    { checkedAt: new Date(now - INTERVAL_MS - 1).toISOString() },
    { checkedAt: new Date(now + 60_000).toISOString() },
    { unresolvedPayments: undefined },
    { count: -1 },
    { count: "0" },
    { reminderCronLastSuccessAt: "invalid" },
    { reminderCronLastSuccessAt: new Date(now - 41 * 60_000).toISOString() },
    { threshold: 1000 },
  ]) {
    failed(
      await resultFor((path) =>
        path === "/api/monitoring/client-errors"
          ? Response.json({ ...incidents, ...change })
          : undefined,
      ),
      "incidents",
      "incidents",
    );
  }
});
await test("actual incidents and degraded health fail", async () => {
  failed(
    await resultFor((path) =>
      path === "/api/monitoring/client-errors"
        ? Response.json({ ...incidents, unresolvedRefunds: 1 })
        : undefined,
    ),
    "incidents",
    "incidents",
  );
  failed(
    await resultFor((path) =>
      path === "/api/health"
        ? Response.json({ status: "degraded" }, { status: 503 })
        : undefined,
    ),
    "dependencies",
    "http",
  );
});
await test("body stream cap works without content-length", async () => {
  failed(
    await resultFor((path) =>
      path === "/api/health"
        ? new Response("x".repeat(16 * 1024 + 1), {
            headers: { "content-type": "application/json" },
          })
        : undefined,
    ),
    "dependencies",
    "oversize",
  );
});
await test("declared oversized body cancelled before reading", async () => {
  let cancelled = false;
  failed(
    await resultFor((path) =>
      path === "/"
        ? new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            {
              headers: {
                "content-type": "text/html",
                "content-length": String(1024 * 1024),
              },
            },
          )
        : undefined,
    ),
    "website",
    "oversize",
  );
  assert.equal(cancelled, true);
});
await test("timeouts bound an unresponsive fetch", async () => {
  const start = Date.now();
  failed(
    await resultFor(
      (path) => (path === "/api/health" ? new Promise(() => {}) : undefined),
      { ...options, timeoutMs: 10 },
    ),
    "dependencies",
    "timeout",
  );
  assert.ok(Date.now() - start < 1000);
});
await test("deadline also cancels a stalled response body", async () => {
  let cancelled = false;
  failed(
    await resultFor(
      (path) =>
        path === "/api/health"
          ? new Response(
              new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { "content-type": "application/json" } },
            )
          : undefined,
      { ...options, timeoutMs: 10 },
    ),
    "dependencies",
    "timeout",
  );
  assert.equal(cancelled, true);
});
await test("one retry recovers a transient fetch failure", async () => {
  let count = 0;
  const result = await resultFor(
    (path) => {
      if (path === "/api/health" && count++ === 0)
        throw new Error("secret customer payload");
    },
    { ...options, attempts: 2 },
  );
  assert.equal(result.healthy, true);
  assert.equal(count, 2);
});
await test("fixed reason code never records raw exception or response content", async () => {
  const result = await resultFor((path) => {
    if (path === "/api/health")
      throw new Error("customer@example.com Bearer TOPSECRET");
  });
  failed(result, "dependencies", "transport");
  assert.equal(JSON.stringify(result).includes("TOPSECRET"), false);
});
await test("malicious asset target is never fetched", async () => {
  for (const source of [
    "//attacker.invalid/index-a.js",
    "/assets/index-../escape.js",
    "/assets/index-a.js?secret=1",
  ]) {
    failed(
      await resultFor((path) =>
        path === "/"
          ? new Response(`<body><script src="${source}"></script>`, {
              headers: { "content-type": "text/html" },
            })
          : undefined,
      ),
      "website",
      "shell",
    );
  }
});
await test("unused bundle body is cancelled", async () => {
  let cancelled = false;
  assert.equal(
    (
      await resultFor((path) =>
        path.endsWith(".js")
          ? new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode("javascript"));
                },
                cancel() {
                  cancelled = true;
                },
              }),
              { headers: { "content-type": "application/javascript" } },
            )
          : undefined,
      )
    ).healthy,
    true,
  );
  assert.equal(cancelled, true);
});
await test("empty bundle without content-length is unhealthy", async () => {
  failed(
    await resultFor((path) =>
      path.endsWith(".js")
        ? new Response("", {
            headers: { "content-type": "application/javascript" },
          })
        : undefined,
    ),
    "website",
    "empty",
  );
});

function stateFixture() {
  const records = new Map();
  let lock = Promise.resolve();
  return {
    storage: {
      async get(key = "monitor") {
        return structuredClone(records.get(key));
      },
      async put(key, value) {
        records.set(key, structuredClone(value));
      },
    },
    blockConcurrencyWhile(fn) {
      const next = lock.then(fn);
      lock = next.catch(() => {});
      return next;
    },
  };
}
const runRequest = (timestamp, source = "cron") =>
  new Request("https://internal/run", {
    method: "POST",
    headers: { "x-scheduled-at": String(timestamp), "x-trigger": source },
  });
const successful = {
  healthy: true,
  checks: [{ name: "website", healthy: true, reason: "ok" }],
};
await test("never-run, stale and future completion are unhealthy", async () => {
  for (const record of [
    undefined,
    { history: [] },
    { history: [{ healthy: true, completedAt: now - MAX_AGE_MS - 1 }] },
    { history: [{ healthy: true, completedAt: now + 1 }] },
  ])
    assert.equal(publicHealth(record, now).status, 503);
});
await test("health GET does not refresh heartbeat; completed time is real finish", async () => {
  const state = stateFixture();
  let time = now;
  const monitor = new MonitorState(
    state,
    {},
    {
      now: () => time,
      probe: async () => {
        time += 45_000;
        return successful;
      },
    },
  );
  assert.equal((await monitor.fetch(runRequest(now))).status, 200);
  const record = await state.storage.get();
  assert.equal(record.history[0].completedAt, now + 45_000);
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    200,
  );
  time += MAX_AGE_MS + 1;
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
  assert.deepEqual(await state.storage.get(), record);
});
await test("overlapping run and duplicate completed slot do not probe twice", async () => {
  const state = stateFixture();
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const monitor = new MonitorState(
    state,
    {},
    {
      now: () => now,
      probe: () => {
        calls++;
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  );
  const first = monitor.fetch(runRequest(now));
  await ready;
  assert.equal((await monitor.fetch(runRequest(now))).status, 202);
  release(successful);
  await first;
  assert.equal((await monitor.fetch(runRequest(now))).status, 202);
  assert.equal(calls, 1);
});
await test("expired lease reclaimed; late old completion cannot overwrite new failure", async () => {
  const state = stateFixture();
  let time = now;
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const monitor = new MonitorState(
    state,
    {},
    {
      now: () => time,
      probe: () => {
        if (++calls === 1) {
          started();
          return new Promise((resolve) => {
            release = resolve;
          });
        }
        return Promise.resolve({ healthy: false, checks: [] });
      },
    },
  );
  const first = monitor.fetch(runRequest(time));
  await ready;
  time += INTERVAL_MS;
  await monitor.fetch(runRequest(time));
  release(successful);
  assert.equal((await first).status, 409);
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
  assert.equal((await state.storage.get()).history.length, 1);
});
await test("expired run cannot publish healthy completion even without a successor", async () => {
  const state = stateFixture();
  let time = now;
  const monitor = new MonitorState(
    state,
    {},
    {
      now: () => time,
      probe: async () => {
        time += 91_000;
        return successful;
      },
    },
  );
  assert.equal((await monitor.fetch(runRequest(now))).status, 409);
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
});
await test("manual runs cannot mask missing or stale scheduled execution", async () => {
  const state = stateFixture();
  let time = now;
  const monitor = new MonitorState(
    state,
    {},
    { now: () => time, probe: async () => successful },
  );
  await monitor.fetch(runRequest(time, "manual"));
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
  time += INTERVAL_MS;
  await monitor.fetch(runRequest(time));
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    200,
  );
  time += MAX_AGE_MS + 1;
  await monitor.fetch(runRequest(time, "manual"));
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
});
await test("failed run retained, next healthy run recovers, bounded history", async () => {
  const state = stateFixture();
  let time = now;
  let healthy = false;
  const monitor = new MonitorState(
    state,
    {},
    { now: () => time, probe: async () => ({ healthy, checks: [] }) },
  );
  await monitor.fetch(runRequest(time));
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    503,
  );
  time += INTERVAL_MS;
  healthy = true;
  await monitor.fetch(runRequest(time));
  assert.equal(
    (await monitor.fetch(new Request("https://internal/health"))).status,
    200,
  );
  assert.equal((await state.storage.get()).history[0].healthy, false);
  for (let index = 0; index < 290; index++) {
    time += INTERVAL_MS;
    await monitor.fetch(runRequest(time));
  }
  assert.equal((await state.storage.get()).history.length, 288);
});
await test("unreadable storage fails closed", async () => {
  const monitor = new MonitorState(
    {
      storage: {
        get: async () => {
          throw new Error("private");
        },
      },
    },
    {},
  );
  const response = await monitor.fetch(new Request("https://internal/health"));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("private"), false);
});
await test("public endpoint exposes no history/counts/secret; private actions require bearer", async () => {
  let forwarded = 0;
  const env = {
    MONITORING_CRON_SECRET: secret,
    MONITOR_STATE: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async (request) => {
          forwarded++;
          return request.url.endsWith("/health")
            ? publicHealth({
                lastScheduledCompletedAt: Date.now(),
                history: [
                  { ...successful, completedAt: Date.now(), privateCount: 44 },
                ],
              })
            : Response.json({ accepted: true });
        },
      }),
    },
  };
  const health = await worker.fetch(
    new Request("https://monitor.example/health"),
    env,
  );
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await health.json()).sort(), [
    "lastCompletedAt",
    "status",
  ]);
  for (const path of [
    "/run",
    "/status",
    "/health?target=https://other.invalid",
  ])
    assert.equal(
      (await worker.fetch(new Request(`https://monitor.example${path}`), env))
        .status,
      404,
    );
  assert.equal(forwarded, 1);
  assert.equal(
    (
      await worker.fetch(
        new Request("https://monitor.example/run", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(forwarded, 2);
});
await test("Durable Object network rejection yields uncached503", async () => {
  const response = await worker.fetch(
    new Request("https://monitor.example/health"),
    {
      MONITOR_STATE: {
        idFromName: (name) => name,
        get: () => ({
          fetch: async () => {
            throw new Error("private");
          },
        }),
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
function drillFixture() {
  const state = stateFixture();
  let time = now;
  const monitor = new MonitorState(
    state,
    {},
    {
      now: () => time,
      probe: async () => {
        throw new Error("Drill must not invoke probes");
      },
    },
  );
  const env = {
    MONITORING_CRON_SECRET: secret,
    MONITOR_STATE: { idFromName: (name) => name, get: () => monitor },
  };
  const get = () =>
    worker.fetch(new Request("https://monitor.example/drill"), env);
  const post = (body, headers = {}) =>
    worker.fetch(
      new Request("https://monitor.example/drill", {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          ...headers,
        },
        body,
      }),
      env,
    );
  return {
    state,
    monitor,
    env,
    get,
    post,
    advance: (ms) => {
      time += ms;
    },
  };
}
await test("drill defaults up and is explicitly test-only without a heartbeat timestamp", async () => {
  const fixture = drillFixture();
  const response = await fixture.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    testOnly: true,
    status: "test_up",
    message: "Alert delivery drill only; not production health.",
  });
  assert.equal(await fixture.state.storage.get("drill"), undefined);
  assert.equal(
    (await fixture.monitor.fetch(new Request("https://internal/health")))
      .status,
    503,
  );
});
await test("drill changes require correct bearer; query or extra JSON fields cannot change targets", async () => {
  const fixture = drillFixture();
  for (const authorization of ["", "Bearer wrong"])
    assert.equal(
      (await fixture.post('{"status":"down"}', { authorization })).status,
      404,
    );
  assert.equal(
    (
      await worker.fetch(
        new Request(
          "https://monitor.example/drill?target=https://other.invalid",
        ),
        fixture.env,
      )
    ).status,
    404,
  );
  for (const body of [
    "null",
    "[]",
    "{}",
    "{",
    '{"status":"invalid"}',
    '{"status":true}',
    '{"status":"down","target":"https://other.invalid"}',
    '{"status":"up","expiresAt":0}',
  ])
    assert.equal((await fixture.post(body)).status, 400);
  assert.equal(
    (await fixture.post('{"status":"down"}', { "content-type": "text/plain" }))
      .status,
    415,
  );
  assert.equal(await fixture.state.storage.get("drill"), undefined);
});
await test("drill streamed and declared body-size limits are enforced", async () => {
  const fixture = drillFixture();
  assert.equal((await fixture.post(" ".repeat(257))).status, 413);
  assert.equal(
    (await fixture.post('{"status":"down"}', { "content-length": "1000" }))
      .status,
    413,
  );
});
await test("drill body timeout cancels stalled upload without persisting", async () => {
  const fixture = drillFixture();
  let cancelled = false;
  const request = new Request("https://monitor.example/drill", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  });
  assert.equal((await worker.fetch(request, fixture.env)).status, 408);
  assert.equal(cancelled, true);
  assert.equal(await fixture.state.storage.get("drill"), undefined);
});
await test("down/up drill leaves actual checks, history, leases and scheduled timestamp unchanged", async () => {
  const fixture = drillFixture();
  const real = {
    history: [{ ...successful, completedAt: now }],
    lastScheduledCompletedAt: now,
    highestCompletedSlot: 123,
    lease: { id: "actual-run", until: now + 60_000 },
  };
  await fixture.state.storage.put("monitor", real);
  const down = await fixture.post('{"status":"down"}');
  assert.equal(down.status, 200);
  assert.equal((await fixture.get()).status, 503);
  assert.equal(
    (await fixture.monitor.fetch(new Request("https://internal/health")))
      .status,
    200,
  );
  assert.deepEqual(await fixture.state.storage.get("monitor"), real);
  fixture.advance(1000);
  assert.equal((await fixture.post('{"status":"up"}')).status, 200);
  assert.equal((await fixture.get()).status, 200);
  assert.deepEqual(await fixture.state.storage.get("monitor"), real);
});
await test("drill GET and duplicate POST do not rewrite change metadata or extend expiry", async () => {
  const fixture = drillFixture();
  await fixture.post('{"status":"down"}');
  const original = await fixture.state.storage.get("drill");
  fixture.advance(1000);
  await fixture.get();
  await fixture.post('{"status":"down"}');
  assert.deepEqual(await fixture.state.storage.get("drill"), original);
  assert.equal(original.expiresAt - original.changedAt, DRILL_EXPIRY_MS);
  fixture.advance(DRILL_EXPIRY_MS);
  assert.equal((await fixture.get()).status, 200);
  assert.deepEqual(await fixture.state.storage.get("drill"), original);
  await fixture.post('{"status":"down"}');
  assert.equal((await fixture.get()).status, 200);
  await fixture.post('{"status":"up"}');
  await fixture.post('{"status":"down"}');
  assert.equal((await fixture.get()).status, 503);
  assert.notEqual(
    (await fixture.state.storage.get("drill")).changeId,
    original.changeId,
  );
});
await test("HEAD health/drill mirror GET status and headers without body or mutations", async () => {
  const fixture = drillFixture();
  async function compare(path, expected) {
    const before = [
      await fixture.state.storage.get("monitor"),
      await fixture.state.storage.get("drill"),
    ];
    const get = await worker.fetch(
      new Request(`https://monitor.example${path}`),
      fixture.env,
    );
    const head = await worker.fetch(
      new Request(`https://monitor.example${path}`, { method: "HEAD" }),
      fixture.env,
    );
    assert.equal(get.status, expected);
    assert.equal(head.status, get.status);
    assert.deepEqual([...head.headers], [...get.headers]);
    assert.equal(await head.text(), "");
    assert.deepEqual(
      [
        await fixture.state.storage.get("monitor"),
        await fixture.state.storage.get("drill"),
      ],
      before,
    );
  }
  await compare("/health", 503);
  await compare("/drill", 200);
  await fixture.state.storage.put("monitor", {
    lastScheduledCompletedAt: now,
    history: [{ ...successful, completedAt: now }],
  });
  await fixture.post('{"status":"down"}');
  await compare("/health", 200);
  await compare("/drill", 503);
  fixture.advance(MAX_AGE_MS + 1);
  await compare("/health", 503);
});
await test("HEAD failures are uncached and bodyless; other methods remain protected", async () => {
  const fixture = drillFixture();
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
    for (const path of ["/health", "/drill"])
      assert.equal(
        (
          await worker.fetch(
            new Request(`https://monitor.example${path}`, { method }),
            fixture.env,
          )
        ).status,
        404,
      );
  }
  for (const path of ["/status", "/run", "/drill?status=down"]) {
    const response = await worker.fetch(
      new Request(`https://monitor.example${path}`, { method: "HEAD" }),
      fixture.env,
    );
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
  const broken = {
    MONITOR_STATE: {
      idFromName: (value) => value,
      get: () => ({
        fetch: async () => {
          throw new Error("internal");
        },
      }),
    },
  };
  for (const path of ["/health", "/drill"]) {
    const response = await worker.fetch(
      new Request(`https://monitor.example${path}`, { method: "HEAD" }),
      broken,
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "");
  }
});
const backupReport = (generationTime = now - 60_000, completedTime = now) => ({
  generation:
    new Date(generationTime).toISOString().slice(0, 19).replaceAll(":", "") +
    "Z",
  completedAt: new Date(completedTime).toISOString(),
});
function backupFixture() {
  const fixture = drillFixture();
  return {
    ...fixture,
    get: (method) =>
      worker.fetch(
        new Request("https://monitor.example/backup-health", {
          method: method ?? "GET",
        }),
        fixture.env,
      ),
    post: (value, headers = {}) =>
      worker.fetch(
        new Request("https://monitor.example/backup", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "application/json",
            ...headers,
          },
          body: typeof value === "string" ? value : JSON.stringify(value),
        }),
        fixture.env,
      ),
  };
}
await test("backup health starts failed, records genuine completion and supports bodylessHEAD", async () => {
  const fixture = backupFixture();
  const missing = await fixture.get();
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), {
    status: "unhealthy",
    lastBackupAt: null,
  });
  assert.equal(await (await fixture.get("HEAD")).text(), "");
  const response = await fixture.post(backupReport());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "recorded",
    duplicate: false,
  });
  const healthy = await fixture.get();
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {
    status: "ok",
    lastBackupAt: new Date(now).toISOString(),
  });
  assert.equal((await fixture.get("HEAD")).status, 200);
});
await test("backup25h boundary, stale original timestamp, and reads/replays cannot renew", async () => {
  const fixture = backupFixture();
  const report = backupReport();
  await fixture.post(report);
  const recorded = await fixture.state.storage.get("backup");
  fixture.advance(BACKUP_MAX_AGE_MS);
  assert.equal((await fixture.get()).status, 200);
  fixture.advance(1);
  assert.equal((await fixture.get()).status, 503);
  assert.equal((await fixture.get("HEAD")).status, 503);
  const repeat = await fixture.post(report);
  assert.deepEqual(await repeat.json(), {
    status: "recorded",
    duplicate: true,
  });
  assert.equal((await fixture.get()).status, 503);
  assert.deepEqual(await fixture.state.storage.get("backup"), recorded);
  const aged = backupFixture();
  assert.equal(
    (
      await aged.post(
        backupReport(
          now - BACKUP_MAX_AGE_MS - 120_000,
          now - BACKUP_MAX_AGE_MS - 60_000,
        ),
      )
    ).status,
    200,
  );
  assert.equal((await aged.get()).status, 503);
});
await test("backup supports UTC PowerShell seven-digit fractional metadata", async () => {
  const fixture = backupFixture();
  assert.equal(
    (
      await fixture.post({
        ...backupReport(),
        completedAt: new Date(now).toISOString().replace(".000Z", ".1234567Z"),
      })
    ).status,
    200,
  );
  assert.equal((await fixture.get()).status, 200);
  assert.equal(
    (await (await fixture.get()).json()).lastBackupAt,
    new Date(now + 123).toISOString(),
  );
});
await test("backup future timestamps, invalid dates, suspicious generation paths and durations rejected", async () => {
  const fixture = backupFixture();
  for (const value of [
    backupReport(now + 31_000, now + 31_000),
    backupReport(now, now + 31_000),
    backupReport(now - 7 * 60 * 60_000, now),
    backupReport(now, now - 31_000),
    { ...backupReport(), generation: "../2026-11-13T120000Z" },
    { ...backupReport(), generation: "2026-02-30T120000Z" },
    { ...backupReport(), completedAt: "2026-02-30T12:00:00Z" },
    { ...backupReport(), completedAt: "2026-11-13T12:00:00+00:00" },
    { ...backupReport(), generation: "2026-11-13T250000Z" },
    { ...backupReport(), completedAt: 123 },
  ])
    assert.equal((await fixture.post(value)).status, 400);
  assert.equal(await fixture.state.storage.get("backup"), undefined);
});
await test("backup older generation or altered same-generation report cannot replace evidence", async () => {
  const fixture = backupFixture();
  const report = backupReport();
  await fixture.post(report);
  const original = await fixture.state.storage.get("backup");
  for (const value of [
    backupReport(now - 120_000, now - 60_000),
    backupReport(now - 120_000, now + 10_000),
    { ...report, completedAt: new Date(now + 10_000).toISOString() },
    backupReport(now - 30_000, now - 10_000),
  ])
    assert.equal((await fixture.post(value)).status, 409);
  assert.deepEqual(await fixture.state.storage.get("backup"), original);
  fixture.advance(60_000);
  assert.equal(
    (await fixture.post(backupReport(now + 30_000, now + 60_000))).status,
    200,
  );
  assert.equal(
    (await (await fixture.get()).json()).lastBackupAt,
    new Date(now + 60_000).toISOString(),
  );
});
await test("concurrent backup reports preserve newest generation", async () => {
  const fixture = backupFixture();
  const first = backupReport(now - 120_000, now - 60_000);
  const second = backupReport(now - 60_000, now);
  await Promise.all([fixture.post(second), fixture.post(first)]);
  assert.equal(
    (await fixture.state.storage.get("backup")).generation,
    second.generation,
  );
});
await test("backup authentication, strictbody and size protections", async () => {
  const fixture = backupFixture();
  for (const authorization of ["", "Bearer incorrect"])
    assert.equal(
      (await fixture.post(backupReport(), { authorization })).status,
      404,
    );
  for (const value of [
    "null",
    "[]",
    "{}",
    "{",
    { ...backupReport(), status: "ok" },
    { generation: backupReport().generation },
  ])
    assert.equal((await fixture.post(value)).status, 400);
  assert.equal((await fixture.post(" ".repeat(257))).status, 413);
  assert.equal(
    (await fixture.post(backupReport(), { "content-type": "text/plain" }))
      .status,
    415,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://monitor.example/backup-health?completedAt=now"),
        fixture.env,
      )
    ).status,
    404,
  );
  assert.equal(await fixture.state.storage.get("backup"), undefined);
});
await test("backup record cannot alter actual monitor or drill; public result contains no generation", async () => {
  const fixture = backupFixture();
  const real = {
    history: [{ ...successful, completedAt: now }],
    lastScheduledCompletedAt: now,
    lease: { id: "running" },
  };
  const drill = {
    status: "down",
    changedAt: now,
    expiresAt: now + DRILL_EXPIRY_MS,
    changeId: "test",
  };
  await fixture.state.storage.put("monitor", real);
  await fixture.state.storage.put("drill", drill);
  await fixture.post(backupReport());
  assert.deepEqual(await fixture.state.storage.get("monitor"), real);
  assert.deepEqual(await fixture.state.storage.get("drill"), drill);
  assert.deepEqual(Object.keys(await (await fixture.get()).json()).sort(), [
    "lastBackupAt",
    "status",
  ]);
});
await test("unreadable/corrupt/future backup state fails closed", async () => {
  const fixture = backupFixture();
  for (const record of [
    { completedAt: "bad", generation: "bad" },
    backupReport(now + 60_000, now + 60_000),
  ]) {
    await fixture.state.storage.put("backup", record);
    assert.equal((await fixture.get()).status, 503);
  }
  const response = await worker.fetch(
    new Request("https://monitor.example/backup-health"),
    {
      MONITOR_STATE: {
        idFromName: (value) => value,
        get: () => ({
          fetch: async () => {
            throw new Error("private");
          },
        }),
      },
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
console.log(
  `Independent monitor: ${total} behavioural suites passed; no external requests.`,
);
