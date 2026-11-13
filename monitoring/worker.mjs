const ORIGIN = "https://bookzenvo.com";
export const INTERVAL_MS = 300_000;
export const MAX_AGE_MS = 720_000;
const LEASE_MS = 90_000;
const HISTORY_LIMIT = 288;
export const DRILL_EXPIRY_MS = 30 * 60_000;
export const BACKUP_MAX_AGE_MS = 25 * 60 * 60_000;
const BACKUP_MAX_DURATION_MS = 6 * 60 * 60_000;
const COUNT_FIELDS = [
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
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fresh = (value, now, age) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  now - Date.parse(value) >= -30_000 &&
  now - Date.parse(value) <= age;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

class ProbeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function boundedText(response, maximum, signal) {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new ProbeFailure("oversize");
  }
  if (!response.body) throw new ProbeFailure("empty");
  const reader = response.body.getReader();
  const cancel = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new ProbeFailure("oversize");
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}

async function request(fetcher, path, secret, kind, options) {
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || url.username || url.password)
    throw new ProbeFailure("target");
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProbeFailure("timeout"));
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        const response = await fetcher(url.href, {
          redirect: "error",
          signal: controller.signal,
          headers: {
            "user-agent": "Bookzenvo-independent-monitor",
            "cache-control": "no-cache",
            ...(secret ? { authorization: `Bearer ${secret}` } : {}),
          },
        });
        if (
          response.redirected ||
          (response.url && response.url !== url.href)
        ) {
          await response.body?.cancel();
          throw new ProbeFailure("redirect");
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new ProbeFailure("http");
        }
        const type = response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase();
        if (kind === "asset") {
          if (
            !["text/javascript", "application/javascript"].includes(type) ||
            response.headers.get("content-length") === "0" ||
            !response.body
          ) {
            await response.body?.cancel();
            throw new ProbeFailure("content");
          }
          const reader = response.body.getReader();
          const cancel = () => {
            reader.cancel().catch(() => {});
          };
          controller.signal.addEventListener("abort", cancel, { once: true });
          try {
            let nonempty = false;
            for (let index = 0; index < 16; index++) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value.byteLength > 0) {
                nonempty = true;
                break;
              }
            }
            if (!nonempty) throw new ProbeFailure("empty");
          } finally {
            controller.signal.removeEventListener("abort", cancel);
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          return null;
        }
        if (type !== (kind === "html" ? "text/html" : "application/json")) {
          await response.body?.cancel();
          throw new ProbeFailure("content");
        }
        const text = await boundedText(
          response,
          kind === "html" ? 512 * 1024 : 16 * 1024,
          controller.signal,
        );
        if (kind === "html") return text;
        try {
          return JSON.parse(text);
        } catch {
          throw new ProbeFailure("json");
        }
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function probeSuite(
  fetcher,
  secret,
  now = Date.now(),
  overrides = {},
) {
  const options = { timeoutMs: 10_000, attempts: 2, sleep, ...overrides };
  const run = async (name, check) => {
    let code = "transport";
    for (let attempt = 0; attempt < options.attempts; attempt++) {
      try {
        await check();
        return { name, healthy: true, reason: "ok" };
      } catch (error) {
        code = error instanceof ProbeFailure ? error.code : "transport";
      }
      if (attempt + 1 < options.attempts) await options.sleep(500);
    }
    return { name, healthy: false, reason: code };
  };
  const checks = await Promise.all([
    run("website", async () => {
      const body = await request(
        fetcher,
        `/?monitor=${now}`,
        null,
        "html",
        options,
      );
      const entry = body.match(
        /\bsrc=["'](\/assets\/index-[A-Za-z0-9_-]+\.js)["']/,
      );
      if (!/<body\b/i.test(body) || !entry) throw new ProbeFailure("shell");
      await request(fetcher, entry[1], null, "asset", options);
    }),
    run("dependencies", async () => {
      const value = await request(
        fetcher,
        `/api/health?monitor=${now}`,
        null,
        "json",
        options,
      );
      if (
        !value ||
        value.status !== "ok" ||
        !fresh(value.checkedAt, now, INTERVAL_MS) ||
        !["configuration", "supabase", "database"].every(
          (key) => value.checks?.[key]?.status === "ok",
        )
      )
        throw new ProbeFailure("health");
    }),
    run("incidents", async () => {
      if (typeof secret !== "string" || secret.length < 32)
        throw new ProbeFailure("configuration");
      const value = await request(
        fetcher,
        `/api/monitoring/client-errors?monitor=${now}`,
        secret,
        "json",
        options,
      );
      if (
        !value ||
        value.status !== "ok" ||
        !fresh(value.checkedAt, now, INTERVAL_MS) ||
        !COUNT_FIELDS.every((key) => integer(value[key])) ||
        value.threshold !== 5 ||
        value.windowMinutes !== 20 ||
        value.count >= 5 ||
        COUNT_FIELDS.slice(1).some((key) => value[key] !== 0) ||
        value.reminderCronStale !== false ||
        !fresh(value.reminderCronLastSuccessAt, now, 40 * 60_000)
      )
        throw new ProbeFailure("incidents");
    }),
  ]);
  return { healthy: checks.every((check) => check.healthy), checks };
}

export function publicHealth(record, now = Date.now()) {
  const last = record?.history?.at(-1);
  const valid =
    last &&
    Number.isFinite(last.completedAt) &&
    now >= last.completedAt &&
    now - last.completedAt <= MAX_AGE_MS;
  const scheduledFresh =
    Number.isFinite(record?.lastScheduledCompletedAt) &&
    now >= record.lastScheduledCompletedAt &&
    now - record.lastScheduledCompletedAt <= MAX_AGE_MS;
  const healthy = valid && scheduledFresh && last.healthy === true;
  return json(
    {
      status: healthy ? "ok" : "unhealthy",
      lastCompletedAt: valid ? new Date(last.completedAt).toISOString() : null,
    },
    healthy ? 200 : 503,
  );
}

function drillHealth(record, now) {
  const invalid =
    record &&
    (!["down", "up"].includes(record.status) ||
      !Number.isFinite(record.changedAt) ||
      (record.status === "down" && !Number.isFinite(record.expiresAt)));
  const down = record?.status === "down" && now < record.expiresAt;
  return json(
    {
      testOnly: true,
      status: invalid ? "test_unavailable" : down ? "test_down" : "test_up",
      message: "Alert delivery drill only; not production health.",
    },
    invalid || down ? 503 : 200,
  );
}

async function parseSmallJson(request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return { error: json({ error: "json_required" }, 415) };
  const controller = new AbortController();
  let timer;
  try {
    const text = await Promise.race([
      boundedText(
        new Response(request.body, { headers: request.headers }),
        256,
        controller.signal,
      ),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProbeFailure("timeout"));
        }, 2000);
      }),
    ]);
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return { error: json({ error: "invalid_payload" }, 400) };
    }
    return { value };
  } catch (error) {
    return {
      error: json(
        { error: "invalid_payload" },
        error instanceof ProbeFailure && error.code === "oversize"
          ? 413
          : error instanceof ProbeFailure && error.code === "timeout"
            ? 408
            : 400,
      ),
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function parseDrill(request) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed;
  const value = parsed.value;
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).length !== 1 ||
    !["down", "up"].includes(value.status)
  )
    return { error: json({ error: "invalid_drill" }, 400) };
  return { status: value.status };
}

function backupValues(value) {
  if (
    !value ||
    typeof value.completedAt !== "string" ||
    typeof value.generation !== "string"
  )
    return null;
  const completion =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,7})?Z$/.exec(
      value.completedAt,
    );
  const generation = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    value.generation,
  );
  if (!completion || !generation) return null;
  const completedAt = Date.parse(value.completedAt);
  const generationText = `${generation[1]}T${generation[2]}:${generation[3]}:${generation[4]}`;
  const generationAt = Date.parse(`${generationText}Z`);
  if (
    !Number.isFinite(completedAt) ||
    !Number.isFinite(generationAt) ||
    new Date(completedAt).toISOString().slice(0, 19) !== completion[1] ||
    new Date(generationAt).toISOString().slice(0, 19) !== generationText ||
    completedAt - generationAt < -30_000 ||
    completedAt - generationAt > BACKUP_MAX_DURATION_MS
  )
    return null;
  return { completedAt, generationAt };
}

async function parseBackup(request) {
  const parsed = await parseSmallJson(request);
  if (parsed.error) return parsed;
  const value = parsed.value;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !backupValues(value)
  )
    return { error: json({ error: "invalid_backup" }, 400) };
  return {
    value: { completedAt: value.completedAt, generation: value.generation },
  };
}

function backupHealth(record, now) {
  const values = backupValues(record);
  const healthy =
    values &&
    values.generationAt <= now + 30_000 &&
    values.completedAt <= now + 30_000 &&
    now - values.completedAt <= BACKUP_MAX_AGE_MS;
  return json(
    {
      status: healthy ? "ok" : "unhealthy",
      lastBackupAt: values ? new Date(values.completedAt).toISOString() : null,
    },
    healthy ? 200 : 503,
  );
}

// A single named object serialises claims/completions; network requests run outside its storage lock.
export class MonitorState {
  constructor(state, env, dependencies = {}) {
    this.state = state;
    this.env = env;
    this.now = dependencies.now ?? Date.now;
    this.probe =
      dependencies.probe ??
      (() => probeSuite(fetch, env.MONITORING_CRON_SECRET));
  }
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/backup-health")
        return backupHealth(await this.state.storage.get("backup"), this.now());
      if (request.method === "POST" && path === "/backup") {
        const parsed = await parseBackup(request);
        if (parsed.error) return parsed.error;
        const values = backupValues(parsed.value);
        if (
          values.completedAt > this.now() + 30_000 ||
          values.generationAt > this.now() + 30_000
        )
          return json({ error: "future_backup" }, 400);
        return await this.state.blockConcurrencyWhile(async () => {
          const previous = await this.state.storage.get("backup");
          const prior = backupValues(previous);
          if (previous && !prior) return json({ status: "unavailable" }, 503);
          if (prior) {
            if (
              values.generationAt === prior.generationAt &&
              values.completedAt === prior.completedAt
            )
              return json({ status: "recorded", duplicate: true });
            if (
              values.generationAt <= prior.generationAt ||
              values.completedAt <= prior.completedAt
            )
              return json({ error: "older_or_conflicting_backup" }, 409);
          }
          await this.state.storage.put("backup", {
            generation: parsed.value.generation,
            completedAt: new Date(values.completedAt).toISOString(),
            reportedAt: this.now(),
          });
          return json({ status: "recorded", duplicate: false });
        });
      }
      if (request.method === "GET" && path === "/drill")
        return drillHealth(await this.state.storage.get("drill"), this.now());
      if (request.method === "POST" && path === "/drill") {
        const value = await parseDrill(request);
        if (value.error) return value.error;
        const record = await this.state.blockConcurrencyWhile(async () => {
          const previous = await this.state.storage.get("drill");
          // An idempotent retry does not extend a down drill or rewrite its change metadata.
          if (previous?.status === value.status) return previous;
          const changedAt = this.now();
          const next = {
            status: value.status,
            changeId: crypto.randomUUID(),
            changedAt,
            expiresAt:
              value.status === "down" ? changedAt + DRILL_EXPIRY_MS : null,
          };
          await this.state.storage.put("drill", next);
          return next;
        });
        return json({ testOnly: true, ...record });
      }
      if (request.method === "GET" && path === "/health")
        return publicHealth(
          await this.state.storage.get("monitor"),
          this.now(),
        );
      if (request.method === "GET" && path === "/status")
        return json(
          (await this.state.storage.get("monitor")) ?? { history: [] },
        );
      if (request.method !== "POST" || path !== "/run")
        return json({ error: "not_found" }, 404);
      const scheduledAt = Number(request.headers.get("x-scheduled-at"));
      const source = request.headers.get("x-trigger");
      const now = this.now();
      if (
        !["cron", "manual"].includes(source) ||
        !Number.isFinite(scheduledAt) ||
        scheduledAt < 1 ||
        scheduledAt > now + 30_000
      )
        return json({ error: "invalid_schedule" }, 400);
      const slot = Math.floor(scheduledAt / INTERVAL_MS);
      const claim = await this.state.blockConcurrencyWhile(async () => {
        const current = (await this.state.storage.get("monitor")) ?? {
          history: [],
          highestCompletedSlot: -1,
        };
        if (
          slot <= current.highestCompletedSlot ||
          (current.lease && current.lease.until > now)
        )
          return null;
        const id = crypto.randomUUID();
        current.lease = {
          id,
          slot,
          source,
          startedAt: now,
          until: now + LEASE_MS,
        };
        await this.state.storage.put("monitor", current);
        return id;
      });
      if (!claim) return json({ accepted: false }, 202);
      let result;
      try {
        result = await this.probe();
      } catch {
        result = {
          healthy: false,
          checks: [{ name: "monitor", healthy: false, reason: "internal" }],
        };
      }
      const completed = await this.state.blockConcurrencyWhile(async () => {
        const current = await this.state.storage.get("monitor");
        if (current?.lease?.id !== claim || current.lease.until <= this.now())
          return false;
        const completedAt = this.now();
        current.history = [
          ...current.history,
          {
            slot,
            source,
            startedAt: current.lease.startedAt,
            completedAt,
            ...result,
          },
        ].slice(-HISTORY_LIMIT);
        if (source === "cron") current.lastScheduledCompletedAt = completedAt;
        current.highestCompletedSlot = Math.max(
          current.highestCompletedSlot,
          slot,
        );
        delete current.lease;
        await this.state.storage.put("monitor", current);
        return true;
      });
      return json({ accepted: true, completed }, completed ? 200 : 409);
    } catch {
      return json({ status: "unavailable" }, 503);
    }
  }
}

function authorised(request, secret) {
  if (typeof secret !== "string" || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++)
    mismatch |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}

function object(env) {
  return env.MONITOR_STATE.get(env.MONITOR_STATE.idFromName("production"));
}
async function responseForMethod(request, response) {
  if (request.method !== "HEAD") return response;
  await response.body?.cancel().catch(() => {});
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
export default {
  async scheduled(controller, env) {
    const response = await object(env).fetch(
      new Request("https://monitor.internal/run", {
        method: "POST",
        headers: {
          "x-scheduled-at": String(controller.scheduledTime),
          "x-trigger": "cron",
        },
      }),
    );
    if (response.status >= 400) throw new Error("monitor_run_failed");
  },
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.search)
        return await responseForMethod(
          request,
          json({ error: "not_found" }, 404),
        );
      if (
        ["GET", "HEAD"].includes(request.method) &&
        ["/health", "/drill", "/backup-health"].includes(url.pathname)
      )
        return await responseForMethod(
          request,
          await object(env).fetch(
            new Request(`https://monitor.internal${url.pathname}`),
          ),
        );
      if (!authorised(request, env.MONITORING_CRON_SECRET))
        return await responseForMethod(
          request,
          json({ error: "not_found" }, 404),
        );
      if (request.method === "POST" && url.pathname === "/backup") {
        const parsed = await parseBackup(request);
        if (parsed.error) return parsed.error;
        return await object(env).fetch(
          new Request("https://monitor.internal/backup", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parsed.value),
          }),
        );
      }
      if (request.method === "POST" && url.pathname === "/drill") {
        const value = await parseDrill(request);
        if (value.error) return value.error;
        return await object(env).fetch(
          new Request("https://monitor.internal/drill", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: value.status }),
          }),
        );
      }
      if (request.method === "GET" && url.pathname === "/status")
        return await object(env).fetch(
          new Request("https://monitor.internal/status"),
        );
      if (request.method === "POST" && url.pathname === "/run")
        return await object(env).fetch(
          new Request("https://monitor.internal/run", {
            method: "POST",
            headers: {
              "x-scheduled-at": String(Date.now()),
              "x-trigger": "manual",
            },
          }),
        );
      return await responseForMethod(
        request,
        json({ error: "not_found" }, 404),
      );
    } catch {
      return await responseForMethod(
        request,
        json({ status: "unavailable" }, 503),
      );
    }
  },
};
