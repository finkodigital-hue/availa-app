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

export class EmailSendError extends Error {}

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
// failure by callers: swallow it, leave the *_sent_at claim released, and
// let the sweep backstop retry it.
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
    if (error || !data) return true;
    return data.email_suppressed !== false;
  } catch {
    return true;
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
    await (supabaseAdmin as any)
      .from("notification_deliveries")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  };

  const preferenceColumn =
    messageType === "booking_confirmation"
      ? "customer_booking_confirmation"
      : messageType === "booking_reminder"
        ? "customer_booking_reminder"
        : null;
  if (preferenceColumn) {
    const { data: preferences } = await (supabaseAdmin as any)
      .from("notification_preferences")
      .select(preferenceColumn)
      .eq("business_id", businessId)
      .maybeSingle();
    if (preferences?.[preferenceColumn] === false) {
      await setDelivery({
        status: "suppressed",
        last_error: "Disabled in notification preferences",
      });
      return { status: "suppressed", deliveryId: existing.id };
    }
  }

  if (await isBusinessSuppressed(businessId)) {
    console.warn(
      `[email-guard] SUPPRESSED (business ${businessId} is email_suppressed, or its status couldn't be confirmed) — would have sent "${subject}" to ${to}`,
    );
    await setDelivery({
      status: "suppressed",
      last_error: "Business email suppression is enabled",
    });
    return { status: "suppressed", deliveryId: existing.id };
  }

  const { to: resolvedTo, mode } = resolveOutboundEmail(to);

  if (mode === "suppressed") {
    console.warn(
      `[email-guard] SUPPRESSED (APP_ENV != "production", no EMAIL_OVERRIDE_TO set) — would have sent "${subject}" to ${to}`,
    );
    await setDelivery({
      status: "suppressed",
      last_error: "Outbound email is disabled in this environment",
    });
    return { status: "suppressed", deliveryId: existing.id };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await setDelivery({
      status: "failed",
      failed_at: now,
      last_error: "Email provider is not configured",
      attempt_count: (existing.attempt_count ?? 0) + 1,
    });
    throw new EmailSendError("RESEND_API_KEY is not configured");
  }

  const effectiveSubject =
    mode === "redirected" ? `[DEV → ${to}] ${subject}` : subject;
  if (mode === "redirected") {
    console.warn(
      `[email-guard] REDIRECTED (APP_ENV != "production") — sending "${subject}" intended for ${to} to EMAIL_OVERRIDE_TO (${resolvedTo}) instead`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: "Bookzenvo <notifications@bookzenvo.com>",
        to: [resolvedTo],
        subject: effectiveSubject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Resend request timed out after ${SEND_TIMEOUT_MS}ms`
        : `Resend request failed: ${(err as Error)?.message ?? err}`;
    const attempts = (existing.attempt_count ?? 0) + 1;
    await setDelivery({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
      attempt_count: attempts,
      next_attempt_at: new Date(
        Date.now() + Math.min(60, 2 ** attempts) * 60_000,
      ).toISOString(),
    });
    if (err instanceof Error && err.name === "AbortError") {
      throw new EmailSendError(message);
    }
    throw new EmailSendError(message);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const attempts = (existing.attempt_count ?? 0) + 1;
    await setDelivery({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: `Resend ${res.status}: ${body.slice(0, 500)}`,
      attempt_count: attempts,
      next_attempt_at: new Date(
        Date.now() + Math.min(60, 2 ** attempts) * 60_000,
      ).toISOString(),
    });
    throw new EmailSendError(`Resend ${res.status}: ${body.slice(0, 500)}`);
  }
  const responseBody = (await res.json().catch(() => ({}))) as { id?: string };
  await setDelivery({
    status: "sent",
    provider: "resend",
    provider_message_id: responseBody.id ?? null,
    sent_at: new Date().toISOString(),
    failed_at: null,
    last_error: null,
    next_attempt_at: null,
    attempt_count: (existing.attempt_count ?? 0) + 1,
  });
  return {
    status: "sent",
    deliveryId: existing.id,
    providerMessageId: responseBody.id,
  };
}
