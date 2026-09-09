/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only delivery tables are absent from browser-generated types. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SEND_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
export class SmsSendError extends Error {}

export function normalizeSmsPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
const maskPhone = (value: string) => `***${value.slice(-4)}`;

async function sendWithTwilio(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER;
  const username = apiKeySid || accountSid;
  const password = apiKeySecret || authToken;
  if (!accountSid || !username || !password || !from)
    throw new SmsSendError("SMS provider is not configured");
  const params = new URLSearchParams({ To: to, Body: body });
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);
  const origin = process.env.APP_URL?.replace(/\/$/, "");
  if (origin?.startsWith("https://"))
    params.set("StatusCallback", `${origin}/api/twilio-sms-webhook`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        signal: controller.signal,
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
    };
    if (!response.ok || !result.sid)
      throw new SmsSendError(
        `Twilio ${response.status}: ${result.message ?? "request failed"}`,
      );
    return result.sid;
  } finally {
    clearTimeout(timeout);
  }
}

// Permanent per-business SMS kill switch. This is checked fresh for every
// delivery and fails closed: a missing row, failed lookup, or anything other
// than an explicit false prevents a provider request. It protects imported
// and demo workspaces even when production credentials are configured.
async function isBusinessSmsSuppressed(businessId: string): Promise<boolean> {
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("businesses")
      .select("sms_suppressed")
      .eq("id", businessId)
      .maybeSingle();
    if (error || !data) return true;
    return data.sms_suppressed !== false;
  } catch {
    return true;
  }
}

export async function sendSms({
  businessId,
  to,
  body,
  messageType,
  idempotencyKey,
}: {
  businessId: string;
  to: string;
  body: string;
  messageType: string;
  idempotencyKey: string;
}) {
  const phone = normalizeSmsPhone(to);
  if (!phone)
    throw new SmsSendError(
      "Recipient phone must be in international format (for example +447123456789)",
    );
  const now = new Date().toISOString();
  const { data: inserted, error } = await (supabaseAdmin as any)
    .from("notification_deliveries")
    .upsert(
      {
        business_id: businessId,
        channel: "sms",
        message_type: messageType,
        recipient_masked: maskPhone(phone),
        subject: "Appointment reminder",
        status: "queued",
        idempotency_key: idempotencyKey,
        updated_at: now,
      },
      { onConflict: "business_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id,status,provider_message_id,attempt_count,next_attempt_at")
    .maybeSingle();
  if (error) throw new SmsSendError("Could not record the queued SMS");
  const existing =
    inserted ??
    (
      await (supabaseAdmin as any)
        .from("notification_deliveries")
        .select("id,status,provider_message_id,attempt_count,next_attempt_at")
        .eq("business_id", businessId)
        .eq("idempotency_key", idempotencyKey)
        .single()
    ).data;
  if (!existing) throw new SmsSendError("Could not claim the queued SMS");
  const update = (values: Record<string, unknown>) =>
    (supabaseAdmin as any)
      .from("notification_deliveries")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  if (await isBusinessSmsSuppressed(businessId)) {
    await update({
      status: "suppressed",
      last_error: "Outbound SMS is disabled for this business",
      next_attempt_at: null,
    });
    return { ...existing, status: "suppressed" };
  }
  if (["sent", "delivered", "suppressed"].includes(existing.status))
    return existing;
  if (
    existing.status === "sending" ||
    (existing.next_attempt_at &&
      Date.parse(existing.next_attempt_at) > Date.now())
  )
    return { ...existing, status: "deferred" };
  if ((existing.attempt_count ?? 0) >= MAX_ATTEMPTS)
    throw new SmsSendError("SMS retry limit reached");
  if (process.env.APP_ENV !== "production") {
    await update({
      status: "suppressed",
      last_error: "Outbound SMS is disabled outside production",
    });
    return { ...existing, status: "suppressed" };
  }
  const { data: claim } = await (supabaseAdmin as any)
    .from("notification_deliveries")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .in("status", ["queued", "failed"])
    .select("id")
    .maybeSingle();
  if (!claim) return { ...existing, status: "deferred" };
  try {
    const providerId = await sendWithTwilio(phone, body);
    await update({
      status: "sent",
      provider: "twilio",
      provider_message_id: providerId,
      sent_at: new Date().toISOString(),
      failed_at: null,
      last_error: null,
      next_attempt_at: null,
      attempt_count: (existing.attempt_count ?? 0) + 1,
    });
    return { ...existing, status: "sent", provider_message_id: providerId };
  } catch (cause) {
    const attempts = (existing.attempt_count ?? 0) + 1;
    const message = cause instanceof Error ? cause.message : String(cause);
    await update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
      attempt_count: attempts,
      next_attempt_at:
        attempts < MAX_ATTEMPTS
          ? new Date(
              Date.now() + Math.min(60, 2 ** attempts) * 60_000,
            ).toISOString()
          : null,
    });
    throw new SmsSendError(message);
  }
}
