import { createFileRoute } from "@tanstack/react-router";

const PROXY_PREFIX = "/api/supabase/";
const ALLOWED_SERVICES = new Set(["auth", "rest", "storage", "functions"]);
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-profile",
  "authorization",
  "cache-control",
  "content-type",
  "content-profile",
  "if-match",
  "if-none-match",
  "prefer",
  "range",
  "x-client-info",
  "x-metadata",
  "x-supabase-api-version",
  "x-upsert",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
  "location",
  "x-supabase-api-version",
] as const;

const PROTECTED_REST_FIELDS: Record<string, ReadonlySet<string>> = {
  businesses: new Set([
    "plan",
    "stripe_account_id",
    "stripe_charges_enabled",
    "stripe_details_submitted",
    "stripe_billing_customer_id",
    "stripe_subscription_id",
    "stripe_subscription_status",
    "billing_synced_at",
    "hide_powered_by",
    "reminder_hours_before",
  ]),
  bookings: new Set(["stripe_payment_intent_id", "stripe_charge_id", "amount_refunded_cents"]),
  customers: new Set(["stripe_customer_id"]),
};

function isOpaqueSupabaseKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

async function rejectUnsafeRestWrite(request: Request, upstreamPath: string) {
  if (request.method === "GET" || request.method === "HEAD") return null;

  const [service, version, resource] = upstreamPath.split("/");
  if (service !== "rest" || version !== "v1" || !resource || resource === "rpc") return null;

  if (resource === "payments") {
    return new Response("Verified payment records are server-managed", { status: 403 });
  }
  if (resource === "businesses" && request.method === "DELETE") {
    return new Response("Business deletion must use the verified account API", { status: 403 });
  }

  const protectedFields = PROTECTED_REST_FIELDS[resource];
  if (!protectedFields || request.method === "DELETE") return null;

  let payload: unknown;
  try {
    payload = await request.clone().json();
  } catch {
    return new Response("Database writes must use a valid JSON body", { status: 400 });
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  const containsProtectedField = rows.some(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      Object.keys(row).some((field) => protectedFields.has(field)),
  );
  if (containsProtectedField) {
    return new Response("This field can only be changed by Bookzenvo's verified server API", {
      status: 403,
    });
  }
  return null;
}

async function proxySupabaseRequest(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return new Response("Database gateway is not configured", { status: 503 });
  }

  const incomingUrl = new URL(request.url);
  if (!incomingUrl.pathname.startsWith(PROXY_PREFIX)) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamPath = incomingUrl.pathname.slice(PROXY_PREFIX.length);
  const [service, version] = upstreamPath.split("/", 2);
  if (!ALLOWED_SERVICES.has(service) || version !== "v1") {
    return new Response("Unsupported database gateway path", { status: 404 });
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(upstreamPath);
  } catch {
    return new Response("Invalid database gateway path", { status: 400 });
  }
  if (decodedPath.includes("\\") || decodedPath.split("/").includes("..")) {
    return new Response("Invalid database gateway path", { status: 400 });
  }

  const unsafeWrite = await rejectUnsafeRestWrite(request, upstreamPath);
  if (unsafeWrite) return unsafeWrite;

  const upstreamBase = new URL(supabaseUrl);
  const upstreamUrl = new URL(`/${upstreamPath}${incomingUrl.search}`, upstreamBase);
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  headers.set("apikey", publishableKey);
  const authorization = headers.get("authorization");
  if (!authorization && !isOpaqueSupabaseKey(publishableKey)) {
    headers.set("authorization", `Bearer ${publishableKey}`);
  }

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
    // Streaming uploads must opt in when running in Node-compatible dev mode.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "no-store");
  responseHeaders.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

const handlers = {
  GET: ({ request }: { request: Request }) => proxySupabaseRequest(request),
  HEAD: ({ request }: { request: Request }) => proxySupabaseRequest(request),
  POST: ({ request }: { request: Request }) => proxySupabaseRequest(request),
  PUT: ({ request }: { request: Request }) => proxySupabaseRequest(request),
  PATCH: ({ request }: { request: Request }) => proxySupabaseRequest(request),
  DELETE: ({ request }: { request: Request }) => proxySupabaseRequest(request),
};

export const Route = createFileRoute("/api/supabase/$")({
  server: { handlers },
});
