import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { readJsonWithLimit } from "../src/lib/request-limits.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const screenshot = read("src/lib/screenshot.server.ts");
const calendar = read("src/lib/calendar-sync.server.ts");
const connect = read("src/routes/api/calendar/$provider/connect.ts");
const callback = read("src/routes/api/calendar/$provider/callback.ts");
const env = read(".env.example");

assert.match(screenshot, /ENABLE_SCREENSHOTONE !== "true"/);
assert.ok(
  screenshot.indexOf("ENABLE_SCREENSHOTONE") <
    screenshot.indexOf("SCREENSHOTONE_ACCESS_KEY"),
  "ScreenshotOne must be denied before reading the access key",
);
assert.match(calendar, /ENABLE_CALENDAR_PROVIDER_CONNECTIONS === "true"/);
assert.match(connect, /calendarProviderConnectionsEnabled\(\)/);
assert.match(callback, /calendarProviderConnectionsEnabled\(\)/);
assert.match(env, /ENABLE_SCREENSHOTONE=false/);
assert.match(env, /ENABLE_CALENDAR_PROVIDER_CONNECTIONS=false/);

// Malformed AI requests must fail before invoking a paid provider.
const source = read("src/routes/api/page-ai-suggest.ts")
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "")
  .replace("export const Route", "const Route");
const handler = new Function("createFileRoute", "readJsonWithLimit", "UsageLimitError", "PageAiError", "PlanRequiredError",
  ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText + ";return Route.server.handlers.POST;")(
    () => (value) => value, readJsonWithLimit, class extends Error {}, class extends Error {}, class extends Error {});
for (const value of [null, [], true, 42, "bad", {}]) {
  const response = await handler({request: new Request("https://example.invalid/api/page-ai-suggest", {
    method: "POST", headers: {authorization: "Bearer fictional"}, body: JSON.stringify(value),
  })});
  assert.equal(response.status, 400);
}

console.log(
  "Provider gates passed: ScreenshotOne and provider calendar OAuth require explicit server-side approval flags.",
);
