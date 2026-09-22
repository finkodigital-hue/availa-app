/* eslint-disable @typescript-eslint/no-explicit-any -- New tables are intentionally server-only and not in generated client types until the migration is applied. */
// Thin wrapper over Resend's REST API. Supabase Auth's SMTP integration
// (used for password reset / signup verification) only sends Supabase's own
// auth templates — it has no API for sending arbitrary HTML content, so
// booking confirmation/reminder emails call Resend directly instead.
//
// This is the ONLY place in the app that calls Resend — every email path
// (reminders, confirmations, and anything added later) goes through
// sendEmail() below, so both the outbound-environment guard and the
// per-business suppression guard live here once, rather than at each call
// site, where a future feature could forget them.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverNotification, DeliveryDeferredError, ProviderDeliveryError } from "./notification-delivery.server";

export class EmailSendError extends Error {}

/** Platform-owned alert, not a salon/customer email. Fixed recipient; uses
 * the same fail-closed environment guard as salon notifications. */
export async function notifyWaitlistSignup(email: string): Promise<void> {
  const { to, mode } = resolveOutboundEmail("help@bookzenvo.com");
  if (mode === "suppressed") return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailSendError("Email provider is not configured");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  const key = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `waitlist-${key}`,
    },
    body: JSON.stringify({
      from: "Bookzenvo <notifications@bookzenvo.com>",
      to: [to],
      subject: `${mode === "redirected" ? "[DEV] " : ""}New Bookzenvo waitlist signup`,
      text: `Someone has joined the Bookzenvo launch waitlist.\n\nEmail: ${email}\n\nTheir address has been saved to the waitlist. No account has been created.`,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!response.ok) throw new EmailSendError("Waitlist notification failed");
}

export type EmailDeliveryResult = {
  status: "sent" | "suppressed";
  deliveryId: string;
  providerMessageId?: string;
};

// Booking creation must never hang on Resend — the immediate confirmation
// send (/api/bookings/send-confirmation) runs synchronously within its own
// request (no ctx.waitUntil available on this platform, see route comment),
// so a slow/hung Resend call is bounded here rather than tying up the
// request indefinitely. A timeout is treated the same as any other send
// failure by callers: leave the booking marker unset and let the delivery
// lease/backoff control the sweep's retry of the exact original request.
const SEND_TIMEOUT_MS = 8000;

// --- Outbound environment guard ---
//
// Deliberately NOT keyed off NODE_ENV: Vite's `vite build` sets
// NODE_ENV=production for the build itself regardless of where the output
// is deployed, and this project's Cloudflare build (scripts/prepare-cloudflare-deploy.mjs)
// produces the same artifact for every deploy target — so NODE_ENV would
// read "production" on a preview deployment too, which is exactly the case
// this guard exists to catch. APP_ENV is a distinct var that must be
// deliberately set to exactly "production" on the Cloudflare dashboard's
// Production environment scope for the availa-app Worker — left unset (or
// anything else) everywhere else, including local .env and Preview
// deployments, so this fails closed by default rather than by convention.
//
// EMAIL_OVERRIDE_TO is optional in dev/preview: with it set, non-production
// sends are redirected there for real (so the pipeline is still visibly
// testable); without it, sends are suppressed outright. Either way, no real
// recipient address is ever reachable outside production.
type EmailGuardMode = "live" | "redirected" | "suppressed";

function resolveOutboundEmail(to: string): {
  to: string;
  mode: EmailGuardMode;
} {
  if (process.env.APP_ENV === "production") return { to, mode: "live" };
  const override = process.env.EMAIL_OVERRIDE_TO;
  if (override) return { to: override, mode: "redirected" };
  return { to: "", mode: "suppressed" };
}

function maskEmail(value: string) {
  const [local, domain] = value.trim().toLowerCase().split("@");
  if (!domain) return "invalid";
  return `${local.slice(0, 1)}***@${domain}`;
}

// Per-business "never mails out" marker (businesses.email_suppressed) —
// independent of APP_ENV and independent of plan, so a suppressed business
// stays suppressed even in production, even on Studio. Reads the flag fresh
// off the business record every call (never trusts a caller-passed boolean,
// never compares slugs at send time). Fails closed: a missing business row,
// a failed lookup, or a null value are all treated as suppressed — only an
// explicit `false` unlocks sending.
async function isBusinessSuppressed(businessId: string): Promise<boolean> {
  try {
    const { data, error } = await (supabaseAdmin as any)
      .from("businesses")
      .select("email_suppressed")
      .eq("id", businessId)
      .maybeSingle();
    if (error) throw new DeliveryDeferredError("Email suppression settings could not be verified");
    if (!data) return true;
    return data.email_suppressed !== false;
  } catch {
    throw new DeliveryDeferredError("Email suppression settings could not be verified");
  }
}

export async function sendEmail({
  businessId,
  to,
  subject,
  html,
  replyTo,
  attachments,
  messageType = "transactional",
  idempotencyKey,
}: {
  businessId: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Resend's attachment shape: content is base64-encoded (see icsBase64 in
   *  @/lib/ics for the ICS calendar invite use case — the only current
   *  caller). Suppressed/redirected sends below never reach Resend, so an
   *  attachment is never delivered to a non-production recipient by accident. */
  attachments?: { filename: string; content: string }[];
  messageType?: string;
  /** Stable business-scoped event key. Resend also receives it, making a retry
   * after an ambiguous timeout safe from duplicate provider submissions. */
  idempotencyKey: string;
}): Promise<EmailDeliveryResult> {
  const now = new Date().toISOString();
  const { data: delivery, error: createError } = await (supabaseAdmin as any)
    .from("notification_deliveries")
    .upsert(
      {
        business_id: businessId,
        channel: "email",
        message_type: messageType,
        recipient_masked: maskEmail(to),
        subject,
        status: "queued",
        idempotency_key: idempotencyKey,
        updated_at: now,
      },
      { onConflict: "business_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("id,status,provider_message_id,attempt_count")
    .maybeSingle();
  if (createError)
    throw new EmailSendError("Could not record the queued email");

  const existing =
    delivery ??
    (
      await (supabaseAdmin as any)
        .from("notification_deliveries")
        .select("id,status,provider_message_id,attempt_count")
        .eq("business_id", businessId)
        .eq("idempotency_key", idempotencyKey)
        .single()
    ).data;
  if (!existing) throw new EmailSendError("Could not claim the queued email");
  if (["sent", "delivered", "suppressed"].includes(existing.status)) {
    return {
      status: existing.status === "suppressed" ? "suppressed" : "sent",
      deliveryId: existing.id,
      providerMessageId: existing.provider_message_id ?? undefined,
    };
  }

  const setDelivery = async (values: Record<string, unknown>) => {
    const { error } = await (supabaseAdmin as any)
      .from("notification_deliveries")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new DeliveryDeferredError("Email delivery state could not be recorded");
  };

  const preferenceColumn =
    messageType === "booking_confirmation"
      ? "customer_booking_confirmation"
      : messageType === "booking_reminder"
        ? "customer_booking_reminder"
        : messageType === "aftercare"
          ? "customer_aftercare_email"
          : messageType === "rebooking_reminder"
            ? "customer_rebooking_email"
            : null;
  if (preferenceColumn) {
    const { data: preferences, error: preferenceError } = await (supabaseAdmin as any)
      .from("notification_preferences")
      .select(preferenceColumn)
      .eq("business_id", businessId)
      .maybeSingle();
    if (preferenceError) throw new DeliveryDeferredError("Notification preferences could not be verified");
    if (preferences?.[preferenceColumn] === false) {
      await setDelivery({
        status: "suppressed",
        last_error: "Disabled in notification preferences",
      });
      return { status: "suppressed", deliveryId: existing.id };
    }
  }

  if (await isBusinessSuppressed(businessId)) {
    console.warn("[email-guard] Business delivery suppressed");
    await setDelivery({
      status: "suppressed",
      last_error: "Business email suppression is enabled",
    });
    return { status: "suppressed", deliveryId: existing.id };
  }

  const { to: resolvedTo, mode } = resolveOutboundEmail(to);

  if (mode === "suppressed") {
    console.warn("[email-guard] Environment delivery suppressed");
    await setDelivery({
      status: "suppressed",
      last_error: "Outbound email is disabled in this environment",
    });
    return { status: "suppressed", deliveryId: existing.id };
  }

  const apiKey = process.env.RESEND_API_KEY;

  const effectiveSubject =
    mode === "redirected" ? `[DEV → ${to}] ${subject}` : subject;
  const providerMessageId = await deliverNotification({
    database: supabaseAdmin, deliveryId: existing.id, channel: "email",
    payload: {
      from: "Bookzenvo <notifications@bookzenvo.com>",
      to: [resolvedTo], subject: effectiveSubject, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
    send: async (snapshot) => {
      if (!apiKey) throw new ProviderDeliveryError("Email provider is not configured", true);
      const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) throw new ProviderDeliveryError(`Email provider HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      const result = await res.json() as { id?: string };
      if (!result.id) throw new Error("Email provider response missing identifier");
      return result.id;
    },
  });
  return {
    status: "sent",
    deliveryId: existing.id,
    providerMessageId,
  };
}
