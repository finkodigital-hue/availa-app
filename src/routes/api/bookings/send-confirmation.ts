import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseTheme } from "@/lib/theme";
import { buildConfirmationEmail } from "@/lib/emails/confirmation-email.server";
import { sendEmail, EmailSendError } from "@/lib/resend.server";

// Called immediately after a booking is created (both the public booking
// page and the owner's walk-in dialog) so the confirmation email goes out
// on the happy path without waiting for the 15-min sweep — see
// /api/cron/send-reminders for the backstop that catches whatever this
// call misses (tab closed before the request finished, transient Resend
// outage, etc). Both paths share the same claim (confirmation_sent_at IS
// NULL), so whichever runs first wins and the other is a no-op — no
// double-send whether this fires once, twice, or not at all.
//
// Deliberately unauthenticated (the public booking flow has no session at
// this point) but safe to call with any booking id: it's idempotent, and
// the recency guard means it can't be used to (re-)send a confirmation for
// an old or unrelated booking — it only ever acts on a booking created in
// the last few minutes, and always returns the same minimal response
// regardless of outcome (no booking details leak to the caller).
const RECENCY_MS = 10 * 60 * 1000;

export const Route = createFileRoute("/api/bookings/send-confirmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { booking_id?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 204 });
        }
        const bookingId = body.booking_id;
        if (!bookingId) return new Response(null, { status: 204 });

        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id, business_id, created_at, starts_at, price_cents, customer_email, customers(email), status, services(name), staff(name), businesses(name, timezone, currency, address, page_theme)")
          .eq("id", bookingId)
          .maybeSingle();

        // Falls back to the linked customer record's email if the booking
        // row itself doesn't have one set (see /api/cron/send-reminders for
        // why that fallback matters — most non-live-created bookings only
        // ever get customer_id, not customer_email, on the row itself).
        const recipientEmail = booking?.customer_email || booking?.customers?.email;

        if (
          !booking ||
          !recipientEmail ||
          booking.status === "cancelled" ||
          Date.now() - new Date(booking.created_at).getTime() > RECENCY_MS ||
          new Date(booking.starts_at).getTime() <= Date.now()
        ) {
          return new Response(null, { status: 204 });
        }

        const { data: claimed } = await (supabaseAdmin as any)
          .from("bookings")
          .update({ confirmation_sent_at: new Date().toISOString() })
          .eq("id", bookingId)
          .is("confirmation_sent_at", null)
          .select("id")
          .maybeSingle();
        if (!claimed) return new Response(null, { status: 204 }); // already sent (or in flight)

        try {
          const business = booking.businesses;
          const { subject, html } = buildConfirmationEmail({
            theme: parseTheme(business?.page_theme),
            businessName: business?.name ?? "",
            serviceName: booking.services?.name ?? "Appointment",
            staffName: booking.staff?.name ?? "the team",
            startsAtIso: booking.starts_at,
            timezone: business?.timezone || "UTC",
            priceCents: booking.price_cents ?? 0,
            currency: business?.currency || "GBP",
            location: business?.address ?? null,
          });
          await sendEmail({ businessId: booking.business_id, to: recipientEmail, subject, html });
        } catch (err) {
          const message = err instanceof EmailSendError ? err.message : String((err as Error)?.message ?? err);
          console.error("[send-confirmation] send failed", bookingId, message);
          await (supabaseAdmin as any).from("bookings").update({ confirmation_sent_at: null }).eq("id", bookingId);
          await (supabaseAdmin as any).from("reminder_send_failures").insert({ booking_id: bookingId, error: `confirmation: ${message}` });
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
