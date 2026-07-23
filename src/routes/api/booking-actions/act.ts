import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeBookingActionToken } from "@/lib/booking-tokens.server";

// Backs the Confirm and Cancel one-tap links. The token is the *only*
// locator — there is no booking id anywhere in the request other than what
// the token itself resolves to server-side, so there is no field to edit in
// the request to reach a different booking.
export const Route = createFileRoute("/api/booking-actions/act")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: string; token?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid request", { status: 400 });
        }
        const { action, token } = body;
        if ((action !== "confirm" && action !== "cancel") || !token || typeof token !== "string") {
          return new Response("Invalid request", { status: 400 });
        }

        const result = await consumeBookingActionToken(token, action);
        if (!result.ok) {
          return Response.json({ ok: false, reason: result.reason }, { status: 200 });
        }

        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id, business_id, status, starts_at, price_cents, customer_name, services(name), staff(name), businesses(name, timezone, currency, address, page_theme, cancellation_window_hours, phone, email)")
          .eq("id", result.bookingId)
          .maybeSingle();

        if (!booking) {
          return Response.json({ ok: false, reason: "invalid" }, { status: 200 });
        }

        const business = booking.businesses;
        const shared = {
          businessName: business?.name ?? "",
          theme: business?.page_theme ?? null,
          serviceName: booking.services?.name ?? "Appointment",
          staffName: booking.staff?.name ?? "the team",
          startsAtIso: booking.starts_at,
          timezone: business?.timezone || "UTC",
          priceCents: booking.price_cents ?? 0,
          currency: business?.currency || "GBP",
          location: business?.address ?? null,
        };

        if (booking.status === "cancelled") {
          return Response.json({ ok: false, reason: "already_cancelled", ...shared });
        }

        if (action === "confirm") {
          await (supabaseAdmin as any)
            .from("bookings")
            .update({ client_confirmed_at: new Date().toISOString() })
            .eq("id", booking.id);
          return Response.json({ ok: true, action: "confirm", ...shared });
        }

        // action === "cancel" — respect the business's cancellation window,
        // same rule the logged-in portal flow already enforces (and the
        // enforce_booking_change_window() DB trigger enforces regardless of
        // caller, as defense in depth).
        const windowHours = business?.cancellation_window_hours ?? 24;
        const withinWindow = new Date(booking.starts_at).getTime() < Date.now() + windowHours * 60 * 60 * 1000;
        if (withinWindow) {
          return Response.json({
            ok: false,
            reason: "window_passed",
            windowHours,
            contactPhone: business?.phone ?? null,
            contactEmail: business?.email ?? null,
            ...shared,
          });
        }

        const { error: cancelErr } = await (supabaseAdmin as any)
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id);
        if (cancelErr) {
          return Response.json({
            ok: false,
            reason: "window_passed",
            windowHours,
            contactPhone: business?.phone ?? null,
            contactEmail: business?.email ?? null,
            ...shared,
          });
        }

        return Response.json({ ok: true, action: "cancel", ...shared });
      },
    },
  },
});
