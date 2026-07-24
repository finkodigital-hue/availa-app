import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeBookingActionToken } from "@/lib/booking-tokens.server";

export const Route = createFileRoute("/api/booking-actions/reschedule-commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { token?: string; starts_at?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid request", { status: 400 });
        }
        const { token, starts_at } = body;
        if (!token || typeof token !== "string" || !starts_at || typeof starts_at !== "string") {
          return new Response("Invalid request", { status: 400 });
        }

        const result = await consumeBookingActionToken(token, "reschedule");
        if (!result.ok) return Response.json({ ok: false, reason: result.reason });

        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id, status")
          .eq("id", result.bookingId)
          .maybeSingle();

        if (!booking || booking.status === "cancelled") {
          return Response.json({ ok: false, reason: "invalid" });
        }

        // reschedule_booking preserves the booking's existing total duration
        // (ends_at - starts_at) rather than recomputing it from the service —
        // for a gap service, services.duration_minutes is only the first
        // segment, so recomputing here would silently truncate the
        // appointment. It also does the conflict check + advisory lock + the
        // actual update atomically, closing the race between this handler's
        // separate check-then-update calls.
        const { error } = await (supabaseAdmin as any).rpc("reschedule_booking", {
          p_booking_id: booking.id,
          p_new_starts_at: starts_at,
        });
        if (error) {
          if (typeof error.message === "string" && error.message.includes("SLOT_TAKEN")) {
            return Response.json({ ok: false, reason: "slot_taken" });
          }
          return Response.json({ ok: false, reason: "invalid" });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
