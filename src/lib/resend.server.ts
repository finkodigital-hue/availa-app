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

function resolveOutboundEmail(to: string): { to: string; mode: EmailGuardMode } {
  if (process.env.APP_ENV === "production") return { to, mode: "live" };
  const override = process.env.EMAIL_OVERRIDE_TO;
  if (override) return { to: override, mode: "redirected" };
  return { to: "", mode: "suppressed" };
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
}: {
  businessId: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  if (await isBusinessSuppressed(businessId)) {
    console.warn(`[email-guard] SUPPRESSED (business ${businessId} is email_suppressed, or its status couldn't be confirmed) — would have sent "${subject}" to ${to}`);
    return;
  }

  const { to: resolvedTo, mode } = resolveOutboundEmail(to);

  if (mode === "suppressed") {
    console.warn(`[email-guard] SUPPRESSED (APP_ENV != "production", no EMAIL_OVERRIDE_TO set) — would have sent "${subject}" to ${to}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailSendError("RESEND_API_KEY is not configured");
  }

  const effectiveSubject = mode === "redirected" ? `[DEV → ${to}] ${subject}` : subject;
  if (mode === "redirected") {
    console.warn(`[email-guard] REDIRECTED (APP_ENV != "production") — sending "${subject}" intended for ${to} to EMAIL_OVERRIDE_TO (${resolvedTo}) instead`);
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
      },
      body: JSON.stringify({
        from: "Bookzenvo <notifications@bookzenvo.com>",
        to: [resolvedTo],
        subject: effectiveSubject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new EmailSendError(`Resend request timed out after ${SEND_TIMEOUT_MS}ms`);
    }
    throw new EmailSendError(`Resend request failed: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EmailSendError(`Resend ${res.status}: ${body.slice(0, 500)}`);
  }
}
