type Scope = "booking" | "gift" | "waitlist" | "auth" | "confirmation" | "telemetry";
export class PublicRequestLimitError extends Error {
  status: number;
  retryAfter: number;
  constructor(status = 503, retryAfter = 60) {
    super(status === 429 ? "Too many attempts from this connection. Please try again later." : "Request protection is temporarily unavailable. Please try again later.");
    this.status = status; this.retryAfter = retryAfter;
  }
}

export async function publicSourceKey(headers: Headers, secret: string, production: boolean, now = new Date()) {
  // Production is served by Cloudflare Workers. Never trust a visitor's
  // X-Forwarded-For as a fallback when the Cloudflare header is unavailable.
  const address = headers.get("cf-connecting-ip") || (!production ? "local-development" : "");
  if (!secret || !address || address.length > 64 || (production && !/^[0-9a-f:.]+$/i.test(address))) throw new PublicRequestLimitError();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`bookzenvo-public-source-v1|${now.toISOString().slice(0, 10)}|${address.toLowerCase()}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function consumePublicRequest(scope: Scope, options: {
  headers?: Headers; database?: any; secret?: string; production?: boolean; now?: Date;
} = {}) {
  const headers = options.headers ?? (await import("@tanstack/react-start/server")).getRequestHeaders();
  const source = await publicSourceKey(headers, options.secret ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", options.production ?? process.env.APP_ENV === "production", options.now);
  const db = options.database ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  let result;
  try { result = await db.rpc("consume_public_request", { p_source_key: source, p_scope: scope }); }
  catch { throw new PublicRequestLimitError(); }
  const { data, error } = result;
  if (error || !data || typeof data.allowed !== "boolean") throw new PublicRequestLimitError();
  if (!data.allowed) throw new PublicRequestLimitError(429, Math.max(1, Math.min(86400, Number(data.retry_after) || 60)));
  return source;
}

export function publicRequestLimitResponse(error: unknown): Response {
  const failure = error instanceof PublicRequestLimitError ? error : new PublicRequestLimitError();
  return Response.json({ message: failure.message, msg: failure.message, error_code: failure.status === 429 ? "over_request_rate_limit" : "request_protection_unavailable" }, {
    status: failure.status, headers: { "retry-after": String(failure.retryAfter), "cache-control": "no-store" },
  });
}
