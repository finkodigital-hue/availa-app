import { createHmac, timingSafeEqual } from "node:crypto";

export type CalendarProvider = "google" | "microsoft";

const PROVIDERS = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    api: "https://www.googleapis.com/calendar/v3",
    scope: "openid email https://www.googleapis.com/auth/calendar.events",
  },
  microsoft: {
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    api: "https://graph.microsoft.com/v1.0",
    scope: "openid email offline_access Calendars.ReadWrite",
  },
} as const;

function credentials(provider: CalendarProvider) {
  const prefix =
    provider === "google" ? "GOOGLE_CALENDAR" : "MICROSOFT_CALENDAR";
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret)
    throw new Error(`${prefix} credentials are not configured`);
  return { clientId, clientSecret };
}

export function callbackUrl(provider: CalendarProvider, origin: string) {
  return `${process.env.APP_URL || origin}/api/calendar/${provider}/callback`;
}

export function makeOauthState(payload: {
  provider: CalendarProvider;
  businessId: string;
  userId: string;
}) {
  const secret = process.env.CALENDAR_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("CALENDAR_OAUTH_STATE_SECRET is not configured");
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000 }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function readOauthState(state: string) {
  const secret = process.env.CALENDAR_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("CALENDAR_OAUTH_STATE_SECRET is not configured");
  const [body, supplied] = state.split(".");
  if (!body || !supplied) throw new Error("Invalid OAuth state");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Invalid OAuth state");
  const value = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    provider: CalendarProvider;
    businessId: string;
    userId: string;
    exp: number;
  };
  if (value.exp < Date.now() || !PROVIDERS[value.provider])
    throw new Error("Expired OAuth state");
  return value;
}

export function authorizationUrl(
  provider: CalendarProvider,
  state: string,
  redirectUri: string,
) {
  const { clientId } = credentials(provider);
  const p = PROVIDERS[provider];
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: p.scope,
    state,
  });
  if (provider === "google") {
    query.set("access_type", "offline");
    query.set("prompt", "consent");
  } else query.set("response_mode", "query");
  return `${p.authorize}?${query}`;
}

export async function exchangeCode(
  provider: CalendarProvider,
  code: string,
  redirectUri: string,
) {
  const { clientId, clientSecret } = credentials(provider);
  const response = await fetch(PROVIDERS[provider].token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json()) as any;
  if (!response.ok || !json.access_token || !json.refresh_token)
    throw new Error(json.error_description || "Provider token exchange failed");
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
    expiresAt: new Date(
      Date.now() + Number(json.expires_in || 3600) * 1000,
    ).toISOString(),
  };
}

export async function refreshAccessToken(
  provider: CalendarProvider,
  refreshToken: string,
) {
  const { clientId, clientSecret } = credentials(provider);
  const response = await fetch(PROVIDERS[provider].token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      ...(provider === "microsoft" ? { scope: PROVIDERS.microsoft.scope } : {}),
    }),
  });
  const json = (await response.json()) as any;
  if (!response.ok || !json.access_token)
    throw Object.assign(
      new Error(json.error_description || "Token refresh failed"),
      { reconnect: json.error === "invalid_grant" },
    );
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string | undefined,
    expiresAt: new Date(
      Date.now() + Number(json.expires_in || 3600) * 1000,
    ).toISOString(),
  };
}

export async function providerIdentity(
  provider: CalendarProvider,
  accessToken: string,
) {
  const url =
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : `${PROVIDERS.microsoft.api}/me`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as any;
  if (!response.ok) throw new Error("Could not read calendar account");
  return {
    account:
      json.email || json.userPrincipalName || json.mail || "Connected account",
    calendarId: provider === "google" ? "primary" : "calendar",
    calendarName: "Default calendar",
  };
}

export async function putProviderEvent(
  provider: CalendarProvider,
  accessToken: string,
  eventId: string | null,
  event: any,
) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
  if (provider === "google") {
    const body = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: { dateTime: event.startsAt, timeZone: event.timezone },
      end: { dateTime: event.endsAt, timeZone: event.timezone },
    };
    const url = eventId
      ? `${PROVIDERS.google.api}/calendars/primary/events/${encodeURIComponent(eventId)}`
      : `${PROVIDERS.google.api}/calendars/primary/events`;
    const response = await fetch(url, {
      method: eventId ? "PUT" : "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as any;
    if (!response.ok)
      throw new Error(json.error?.message || "Google Calendar update failed");
    return json.id as string;
  }
  const body = {
    subject: event.title,
    body: { contentType: "text", content: event.description || "" },
    location: { displayName: event.location || "" },
    start: { dateTime: event.startsAt.replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: event.endsAt.replace(/Z$/, ""), timeZone: "UTC" },
  };
  const url = eventId
    ? `${PROVIDERS.microsoft.api}/me/events/${encodeURIComponent(eventId)}`
    : `${PROVIDERS.microsoft.api}/me/events`;
  const response = await fetch(url, {
    method: eventId ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as any;
  if (!response.ok)
    throw new Error(json.error?.message || "Outlook update failed");
  return (json.id || eventId) as string;
}

export async function deleteProviderEvent(
  provider: CalendarProvider,
  accessToken: string,
  eventId: string,
) {
  const url =
    provider === "google"
      ? `${PROVIDERS.google.api}/calendars/primary/events/${encodeURIComponent(eventId)}`
      : `${PROVIDERS.microsoft.api}/me/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404 && response.status !== 410)
    throw new Error("Calendar event deletion failed");
}
