// Signed, single-use, expiring tokens for the Confirm/Cancel/Reschedule
// links in reminder/confirmation emails. The raw token only ever exists in
// the emailed URL — we store its SHA-256 hash in booking_action_tokens and
// look tokens up by hash, so a leaked/tampered URL can't be reverse-engineered
// into a valid one, and the booking_id is never a client-supplied URL param
// (it's resolved server-side from the token row), so there's no way to point
// a token at a different booking by editing the link.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BookingAction = "confirm" | "cancel" | "reschedule";

// Valid through the whole pre-appointment window (however far out the
// business's reminder_hours_before is set) plus a day of slack after the
// appointment, so a client can still act on the link shortly after if needed.
const TOKEN_TTL_AFTER_APPOINTMENT_MS = 24 * 60 * 60 * 1000;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mints one token per action. Called at send time for all three
// (confirm/cancel/reschedule) so each button in the email is independently
// single-use — spending the Confirm link doesn't affect Cancel/Reschedule.
export async function mintBookingActionToken(
  bookingId: string,
  action: BookingAction,
  appointmentStartsAt: string,
): Promise<string> {
  const raw = randomToken();
  const token_hash = await sha256Hex(raw);
  const expires_at = new Date(new Date(appointmentStartsAt).getTime() + TOKEN_TTL_AFTER_APPOINTMENT_MS).toISOString();

  const { error } = await (supabaseAdmin as any).from("booking_action_tokens").insert({
    booking_id: bookingId,
    action,
    token_hash,
    expires_at,
  });
  if (error) throw error;

  return raw;
}

export type TokenLookup =
  | { ok: true; bookingId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

// Validates without consuming — for rendering the reschedule slot-picker,
// where "using" the token means completing a reschedule, not just viewing
// the page.
export async function peekBookingActionToken(rawToken: string, action: BookingAction): Promise<TokenLookup> {
  const token_hash = await sha256Hex(rawToken);
  const { data } = await (supabaseAdmin as any)
    .from("booking_action_tokens")
    .select("booking_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .eq("action", action)
    .maybeSingle();

  if (!data) return { ok: false, reason: "invalid" };
  if (data.used_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, bookingId: data.booking_id };
}

// Atomically claims the token (single-use). Only succeeds once — a second
// call with the same raw token (replay, or a second tab) gets `used`.
export async function consumeBookingActionToken(rawToken: string, action: BookingAction): Promise<TokenLookup> {
  const token_hash = await sha256Hex(rawToken);
  const { data: row } = await (supabaseAdmin as any)
    .from("booking_action_tokens")
    .select("id, booking_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .eq("action", action)
    .maybeSingle();

  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const { data: claimed } = await (supabaseAdmin as any)
    .from("booking_action_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) return { ok: false, reason: "used" };
  return { ok: true, bookingId: row.booking_id };
}
