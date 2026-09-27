import assert from "node:assert/strict";
import fs from "node:fs";

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

console.log(
  "Provider gates passed: ScreenshotOne and provider calendar OAuth require explicit server-side approval flags.",
);
