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
          .select("id, staff_id, status, services(duration_minutes)")
          .eq("id", result.bookingId)
          .maybeSingle();

        if (!booking || booking.status === "cancelled") {
          return Response.json({ ok: false, reason: "invalid" });
        }

        const ends_at = new Date(new Date(starts_at).getTime() + (booking.services?.duration_minutes ?? 30) * 60000).toISOString();

        const { data: clash } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id")
          .eq("staff_id", booking.staff_id)
          .neq("status", "cancelled")
          .neq("id", booking.id)
          .lt("starts_at", ends_at)
          .gt("ends_at", starts_at);
        if (clash && clash.length > 0) {
          return Response.json({ ok: false, reason: "slot_taken" });
        }

        const { error } = await (supabaseAdmin as any)
          .from("bookings")
          .update({ starts_at, ends_at })
          .eq("id", booking.id);
        if (error) {
          return Response.json({ ok: false, reason: "invalid" });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
