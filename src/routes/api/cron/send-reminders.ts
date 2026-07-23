import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseTheme } from "@/lib/theme";
import { mintBookingActionToken } from "@/lib/booking-tokens.server";
import { buildReminderEmail } from "@/lib/emails/reminder-email.server";
import { buildConfirmationEmail } from "@/lib/emails/confirmation-email.server";
import { sendEmail, EmailSendError } from "@/lib/resend.server";

// Woken up every 15 minutes by a Supabase pg_cron + pg_net job (see
// supabase/migrations/20260723150000_add_booking_reminders.sql). This route,
// not the cron job, is the source of truth for "who's due" — a
// dropped/failed pg_net call just means the next tick picks it up, so both
// queries below must be safe to re-run on any schedule without double-sending.
//
// Does two jobs:
// 1. Reminders (Studio-plan only, server-side gated: only businesses on
//    plan='studio' are queried, so a Free-plan business's bookings are never
//    selected regardless of client UI).
// 2. Confirmation-email backstop (all plans, not gated — confirmations are
//    sent immediately by /api/bookings/send-confirmation right after booking
//    creation; this is only the safety net for when that call never arrives,
//    e.g. the tab closed before it fired, or Resend had a transient outage).

const CONFIRMATION_BACKSTOP_WINDOW_MS = 6 * 60 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/cron/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_REMINDER_SECRET;
        if (!secret) {
          console.error("CRON_REMINDER_SECRET is not configured");
          return new Response("Not configured", { status: 500 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
        if (!provided || !timingSafeEqual(provided, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: businesses, error: bizErr } = await (supabaseAdmin as any)
          .from("businesses")
          .select("id, name, timezone, currency, address, page_theme, reminder_hours_before")
          .eq("plan", "studio");
        if (bizErr) {
          console.error("[send-reminders] failed to load businesses", bizErr);
          return new Response("Server error", { status: 500 });
        }

        let claimed = 0;
        let sent = 0;
        let failed = 0;

        for (const business of businesses ?? []) {
          const now = new Date();
          const windowEnd = new Date(now.getTime() + (business.reminder_hours_before ?? 24) * 60 * 60 * 1000);

          const { data: dueBookings, error: bkErr } = await (supabaseAdmin as any)
            .from("bookings")
            .select("id, starts_at, price_cents, customer_email, customer_name, customers(email), services(name), staff(name)")
            .eq("business_id", business.id)
            .is("reminder_sent_at", null)
            .not("status", "in", "(cancelled,completed,no_show)")
            .gt("starts_at", now.toISOString())
            .lte("starts_at", windowEnd.toISOString());

          if (bkErr) {
            console.error("[send-reminders] failed to load bookings", business.id, bkErr);
            continue;
          }

          for (const booking of dueBookings ?? []) {
            // bookings.customer_email is null for almost every imported
            // booking (the CSV importer only sets customer_id) — fall back
            // to the linked customer record's email so reminders still
            // reach a salon's imported client base, not just bookings made
            // through the live public-booking/walk-in paths.
            const recipientEmail = booking.customer_email || booking.customers?.email;
            if (!recipientEmail) continue;

            const { data: claimedRow } = await (supabaseAdmin as any)
              .from("bookings")
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq("id", booking.id)
              .is("reminder_sent_at", null)
              .select("id")
              .maybeSingle();
            if (!claimedRow) continue; // already claimed by a concurrent/overlapping run
            claimed++;

            try {
              const theme = parseTheme(business.page_theme);
              const [confirmToken, cancelToken, rescheduleToken] = await Promise.all([
                mintBookingActionToken(booking.id, "confirm", booking.starts_at),
                mintBookingActionToken(booking.id, "cancel", booking.starts_at),
                mintBookingActionToken(booking.id, "reschedule", booking.starts_at),
              ]);

              const { subject, html } = buildReminderEmail({
                theme,
                businessName: business.name,
                serviceName: booking.services?.name ?? "Appointment",
                staffName: booking.staff?.name ?? "the team",
                startsAtIso: booking.starts_at,
                timezone: business.timezone || "UTC",
                priceCents: booking.price_cents ?? 0,
                currency: business.currency || "GBP",
                location: business.address ?? null,
                confirmToken,
                cancelToken,
                rescheduleToken,
              });

              await sendEmail({ businessId: business.id, to: recipientEmail, subject, html });
              sent++;
            } catch (err) {
              failed++;
              const message = err instanceof EmailSendError ? err.message : String((err as Error)?.message ?? err);
              console.error("[send-reminders] send failed", booking.id, message);
              await (supabaseAdmin as any).from("bookings").update({ reminder_sent_at: null }).eq("id", booking.id);
              await (supabaseAdmin as any).from("reminder_send_failures").insert({ booking_id: booking.id, error: message });
            }
          }
        }

        // --- Confirmation-email backstop (all plans) ---
        let confirmationsClaimed = 0;
        let confirmationsSent = 0;
        let confirmationsFailed = 0;

        const cutoff = new Date(Date.now() - CONFIRMATION_BACKSTOP_WINDOW_MS).toISOString();
        const { data: unconfirmed, error: unconfirmedErr } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id, business_id, created_at, starts_at, price_cents, customer_email, customers(email), status, services(name), staff(name), businesses(name, timezone, currency, address, page_theme)")
          .is("confirmation_sent_at", null)
          .neq("status", "cancelled")
          .gte("created_at", cutoff)
          // Second line of defence beyond the created_at window: never
          // confirm a booking whose appointment has already happened
          // (covers historical/imported data regardless of its created_at).
          .gt("starts_at", new Date().toISOString());

        if (unconfirmedErr) {
          console.error("[send-reminders] failed to load unconfirmed bookings", unconfirmedErr);
        } else {
          for (const booking of unconfirmed ?? []) {
            const recipientEmail = booking.customer_email || booking.customers?.email;
            if (!recipientEmail) continue;

            const { data: claimedRow } = await (supabaseAdmin as any)
              .from("bookings")
              .update({ confirmation_sent_at: new Date().toISOString() })
              .eq("id", booking.id)
              .is("confirmation_sent_at", null)
              .select("id")
              .maybeSingle();
            if (!claimedRow) continue; // already sent by the immediate path (or a concurrent sweep)
            confirmationsClaimed++;

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
              confirmationsSent++;
            } catch (err) {
              confirmationsFailed++;
              const message = err instanceof EmailSendError ? err.message : String((err as Error)?.message ?? err);
              console.error("[send-reminders] confirmation backstop send failed", booking.id, message);
              await (supabaseAdmin as any).from("bookings").update({ confirmation_sent_at: null }).eq("id", booking.id);
              await (supabaseAdmin as any).from("reminder_send_failures").insert({ booking_id: booking.id, error: `confirmation: ${message}` });
            }
          }
        }

        return Response.json({ claimed, sent, failed, confirmationsClaimed, confirmationsSent, confirmationsFailed });
      },
    },
  },
});
