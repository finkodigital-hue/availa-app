import assert from "node:assert/strict";
import {
  authorizationUrl,
  callbackUrl,
  deleteProviderEvent,
  exchangeCode,
  makeOauthState,
  providerIdentity,
  putProviderEvent,
  readOauthState,
  refreshAccessToken,
} from "../src/lib/calendar-sync.server.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalEnv = {
  APP_URL: process.env.APP_URL,
  CALENDAR_OAUTH_STATE_SECRET: process.env.CALENDAR_OAUTH_STATE_SECRET,
  GOOGLE_CALENDAR_CLIENT_ID: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  GOOGLE_CALENDAR_CLIENT_SECRET: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  MICROSOFT_CALENDAR_CLIENT_ID: process.env.MICROSOFT_CALENDAR_CLIENT_ID,
  MICROSOFT_CALENDAR_CLIENT_SECRET:
    process.env.MICROSOFT_CALENDAR_CLIENT_SECRET,
};

process.env.APP_URL = "https://bookzenvo.example";
process.env.CALENDAR_OAUTH_STATE_SECRET =
  "fixture-state-secret-with-enough-entropy";
process.env.GOOGLE_CALENDAR_CLIENT_ID = "google-fixture-id";
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "google-fixture-secret";
process.env.MICROSOFT_CALENDAR_CLIENT_ID = "microsoft-fixture-id";
process.env.MICROSOFT_CALENDAR_CLIENT_SECRET = "microsoft-fixture-secret";

let checks = 0;
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};
const matches = (actual, expected, message) => {
  assert.match(actual, expected, message);
  checks += 1;
};
const rejects = async (promise, expected, message) => {
  await assert.rejects(promise, expected, message);
  checks += 1;
};

try {
  const state = makeOauthState({
    provider: "google",
    businessId: "business-fixture",
    userId: "user-fixture",
  });
  equal(readOauthState(state).businessId, "business-fixture");
  const [stateBody, stateSignature] = state.split(".");
  const tamperedSignature = `${stateSignature[0] === "A" ? "B" : "A"}${stateSignature.slice(1)}`;
  assert.throws(
    () => readOauthState(`${stateBody}.${tamperedSignature}`),
    /Invalid OAuth state/,
  );
  checks += 1;
  const issuedAt = originalNow();
  Date.now = () => issuedAt + 11 * 60_000;
  assert.throws(() => readOauthState(state), /Expired OAuth state/);
  checks += 1;
  Date.now = originalNow;

  equal(
    callbackUrl("google", "https://ignored.example"),
    "https://bookzenvo.example/api/calendar/google/callback",
  );
  const googleAuthorization = new URL(
    authorizationUrl("google", state, "https://bookzenvo.example/callback"),
  );
  equal(googleAuthorization.searchParams.get("access_type"), "offline");
  equal(googleAuthorization.searchParams.get("prompt"), "consent");
  matches(
    googleAuthorization.searchParams.get("scope") || "",
    /calendar\.events/,
  );
  const microsoftAuthorization = new URL(
    authorizationUrl("microsoft", state, "https://bookzenvo.example/callback"),
  );
  equal(microsoftAuthorization.searchParams.get("response_mode"), "query");
  matches(
    microsoftAuthorization.searchParams.get("scope") || "",
    /offline_access/,
  );

  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({
      access_token: "access-fixture",
      refresh_token: "refresh-fixture",
      expires_in: 1800,
    });
  };
  const exchanged = await exchangeCode(
    "google",
    "one-use-code",
    "https://bookzenvo.example/callback",
  );
  equal(exchanged.accessToken, "access-fixture");
  equal(request.url, "https://oauth2.googleapis.com/token");
  equal(request.options.method, "POST");
  equal(request.options.body.get("code"), "one-use-code");
  equal(request.options.body.get("client_secret"), "google-fixture-secret");
  assert.ok(new Date(exchanged.expiresAt).getTime() > originalNow());
  checks += 1;

  globalThis.fetch = async () =>
    Response.json(
      { error: "invalid_grant", error_description: "Code already used" },
      { status: 400 },
    );
  await rejects(
    exchangeCode("google", "used-code", "https://bookzenvo.example/callback"),
    /Code already used/,
  );

  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({
      access_token: "refreshed-access",
      refresh_token: "rotated-refresh",
      expires_in: 900,
    });
  };
  const refreshed = await refreshAccessToken("microsoft", "old-refresh");
  equal(refreshed.refreshToken, "rotated-refresh");
  equal(
    request.url,
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  );
  equal(request.options.body.get("refresh_token"), "old-refresh");
  matches(request.options.body.get("scope") || "", /Calendars\.ReadWrite/);

  globalThis.fetch = async () =>
    Response.json(
      { error: "invalid_grant", error_description: "Consent revoked" },
      { status: 400 },
    );
  await assert.rejects(
    refreshAccessToken("microsoft", "revoked-refresh"),
    (error) => error.message === "Consent revoked" && error.reconnect === true,
  );
  checks += 1;

  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ email: "calendar-owner@example.invalid" });
  };
  equal(await providerIdentity("google", "identity-token"), {
    account: "calendar-owner@example.invalid",
    calendarId: "primary",
    calendarName: "Default calendar",
  });
  equal(request.options.headers.authorization, "Bearer identity-token");

  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ id: "google-event" });
  };
  const event = {
    title: "Colour, cut & finish",
    description: "Fictional customer",
    location: "Fictional salon",
    startsAt: "2026-10-25T10:00:00.000Z",
    endsAt: "2026-10-25T11:00:00.000Z",
    timezone: "Europe/London",
  };
  equal(
    await putProviderEvent("google", "access", null, event),
    "google-event",
  );
  equal(request.options.method, "POST");
  equal(JSON.parse(request.options.body).start.timeZone, "Europe/London");
  equal(request.options.headers.authorization, "Bearer access");

  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({});
  };
  equal(
    await putProviderEvent("microsoft", "access", "event/with spaces", event),
    "event/with spaces",
  );
  equal(request.options.method, "PATCH");
  matches(request.url, /event%2Fwith%20spaces$/);
  equal(JSON.parse(request.options.body).start, {
    dateTime: "2026-10-25T10:00:00.000",
    timeZone: "UTC",
  });

  globalThis.fetch = async () => new Response(null, { status: 404 });
  await deleteProviderEvent("google", "access", "already-removed");
  checks += 1;
  globalThis.fetch = async () =>
    Response.json(
      { error: { message: "Provider unavailable" } },
      { status: 503 },
    );
  await rejects(
    putProviderEvent("google", "access", null, event),
    /Provider unavailable/,
  );
  await rejects(
    deleteProviderEvent("microsoft", "access", "event"),
    /Calendar event deletion failed/,
  );

  console.log(
    `${checks} calendar OAuth, refresh, event and failure-path checks passed (mock providers; no account connected).`,
  );
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
