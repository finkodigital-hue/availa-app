/* eslint-disable @typescript-eslint/no-explicit-any -- The private outbox is not in browser-generated Supabase types. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildBookingChangeEmail } from "@/lib/emails/booking-change-email.server";
import { sendEmail } from "@/lib/resend.server";
import { parseTheme } from "@/lib/theme";

type ChangeEvent = {
  id: string;
  booking_id: string;
  business_id: string;
  change_type: "rescheduled" | "cancelled";
  old_starts_at: string;
  new_starts_at: string;
  attempt_count: number;
};

/** Trigger-backed outbox: the page can close after a successful booking change
 * and the cron will still deliver the customer email. The immediate action
 * routes call this too, so customers normally receive it without waiting. */
export async function processBookingChangeEmails(bookingId?: string) {
  const now = new Date().toISOString();
  let query = (supabaseAdmin as any)
    .from("booking_change_email_outbox")
    .select("id,booking_id,business_id,change_type,old_starts_at,new_starts_at,attempt_count")
    .is("processed_at", null)
    .eq("manual_review", false)
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(50);
  if (bookingId) query = query.eq("booking_id", bookingId);
  const { data: events, error } = await query;
  if (error) throw new Error("Booking change email queue unavailable");

  const result = { sent: 0, suppressed: 0, skipped: 0, failed: 0 };
  for (const event of (events ?? []) as ChangeEvent[]) {
    const markProcessed = async () => {
      const { error } = await (supabaseAdmin as any)
        .from("booking_change_email_outbox")
        .update({ processed_at: new Date().toISOString(), last_error: null })
        .eq("id", event.id)
        .is("processed_at", null);
      if (error) throw new Error("Booking change email outcome could not be recorded");
    };

    try {
      const { data: booking, error: bookingError } = await (supabaseAdmin as any)
        .from("bookings")
        .select("id,status,starts_at,ends_at,customer_email,customers(email),services(name),staff(name),businesses(name,timezone,address,page_theme)")
        .eq("id", event.booking_id)
        .eq("business_id", event.business_id)
        .maybeSingle();
      if (bookingError) throw new Error("Booking change could not be loaded");
      const stale = !booking || (event.change_type === "rescheduled"
        ? booking.status !== "confirmed" || booking.starts_at !== event.new_starts_at
        : booking.status !== "cancelled");
      const recipient = booking?.customer_email || booking?.customers?.email;
      if (stale || !recipient) {
        await markProcessed();
        result.skipped++;
        continue;
      }

      const message = buildBookingChangeEmail({
        changeType: event.change_type,
        theme: parseTheme(booking.businesses?.page_theme),
        businessName: booking.businesses?.name ?? "Your salon",
        serviceName: booking.services?.name ?? "Appointment",
        staffName: booking.staff?.name ?? "the team",
        bookingId: booking.id,
        oldStartsAtIso: event.old_starts_at,
        startsAtIso: booking.starts_at,
        endsAtIso: booking.ends_at,
        timezone: booking.businesses?.timezone || "UTC",
        location: booking.businesses?.address ?? null,
      });
      const delivery = await sendEmail({
        businessId: event.business_id,
        to: recipient,
        subject: message.subject,
        html: message.html,
        attachments: message.attachments,
        messageType: `booking_${event.change_type}`,
        idempotencyKey: `booking:${event.booking_id}:change:${event.id}`,
      });
      await markProcessed();
      if (delivery.status === "suppressed") result.suppressed++;
      else result.sent++;
    } catch {
      result.failed++;
      const attempts = event.attempt_count + 1;
      const nextAttempt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
      const { error: updateError } = await (supabaseAdmin as any)
        .from("booking_change_email_outbox")
        .update({
          attempt_count: attempts,
          next_attempt_at: nextAttempt,
          manual_review: attempts >= 5,
          last_error: "Customer booking-change email needs retry or review",
        })
        .eq("id", event.id)
        .is("processed_at", null);
      if (updateError) console.error("[booking-change-email] Retry state could not be recorded", event.id);
    }
  }
  return result;
}
