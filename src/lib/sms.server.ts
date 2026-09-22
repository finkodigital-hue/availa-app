/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only delivery tables are absent from browser-generated types. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverNotification, DeliveryDeferredError, ProviderDeliveryError } from "./notification-delivery.server";
import { consumeBusinessUsage } from "./usage-limits.server";
import { trustedAppOrigin } from "./app-origin.server";

const SEND_TIMEOUT_MS = 10_000;
export class SmsSendError extends Error {}

export function normalizeSmsPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
const maskPhone = (value: string) => `***${value.slice(-4)}`;

async function sendWithTwilio(to: string, body: string, deliveryId: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER;
  const username = apiKeySid || accountSid;
  const password = apiKeySecret || authToken;
  if (!accountSid || !username || !password || !from)
    throw new ProviderDeliveryError("SMS provider is not configured", true);
  const params = new URLSearchParams({ To: to, Body: body });
  if (from.startsWith("MG")) params.set("MessagingServiceSid", from);
  else params.set("From", from);
  const origin = trustedAppOrigin();
  if (origin?.startsWith("https://"))
    params.set("StatusCallback", `${origin}/api/twilio-sms-webhook?delivery_id=${encodeURIComponent(deliveryId)}`);
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
    if (!response.ok) throw new ProviderDeliveryError(`SMS provider HTTP ${response.status}`, response.status === 429);
    if (!result.sid) throw new Error("SMS provider response missing identifier");
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
    if (error) throw new DeliveryDeferredError("SMS suppression settings could not be verified");
    if (!data) return true;
    return data.sms_suppressed !== false;
  } catch {
    throw new DeliveryDeferredError("SMS suppression settings could not be verified");
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
  if (["sent", "delivered", "suppressed"].includes(existing.status)) return existing;
  const update = async (values: Record<string, unknown>) => {
    const { error } = await (supabaseAdmin as any)
      .from("notification_deliveries")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new DeliveryDeferredError("SMS delivery state could not be recorded");
  };
  if (await isBusinessSmsSuppressed(businessId)) {
    await update({
      status: "suppressed",
      last_error: "Outbound SMS is disabled for this business",
      next_attempt_at: null,
    });
    return { ...existing, status: "suppressed" };
  }
  if (process.env.APP_ENV !== "production") {
    await update({
      status: "suppressed",
      last_error: "Outbound SMS is disabled outside production",
    });
    return { ...existing, status: "suppressed" };
  }
  try {
    const providerId = await deliverNotification({
      database: supabaseAdmin, deliveryId: existing.id, channel: "sms",
      payload: { to: phone, body },
      send: async (snapshot) => {
        try { await consumeBusinessUsage(businessId, "sms", supabaseAdmin); }
        catch { throw new ProviderDeliveryError("SMS usage limit or safety check unavailable", true); }
        return sendWithTwilio(snapshot.to, snapshot.body, existing.id);
      },
    });
    return { ...existing, status: "sent", provider_message_id: providerId };
  } catch (cause) {
    if (cause instanceof DeliveryDeferredError) return { ...existing, status: "deferred" };
    throw cause;
  }
}
