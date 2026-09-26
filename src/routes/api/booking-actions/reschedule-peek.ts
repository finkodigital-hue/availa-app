import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { peekBookingActionToken } from "@/lib/booking-tokens.server";
import { readJsonWithLimit } from "@/lib/request-limits";
import { consumePublicRequest, publicRequestLimitResponse } from "@/lib/public-request-limit.server";

// Validates the reschedule token WITHOUT consuming it — the token is spent
// only when the client actually completes a reschedule (reschedule-commit),
// not merely by viewing the slot picker.
export const Route = createFileRoute("/api/booking-actions/reschedule-peek")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await consumePublicRequest("token", { headers: request.headers }); }
        catch (error) { return publicRequestLimitResponse(error); }
        const parsed = await readJsonWithLimit<{ token?: string }>(request, 4 * 1024);
        if ("error" in parsed) {
          return new Response("Invalid request", { status: 400 });
        }
        const body = parsed.value;
        const { token } = body;
        if (!token || typeof token !== "string") return new Response("Invalid request", { status: 400 });

        const result = await peekBookingActionToken(token, "reschedule");
        if (!result.ok) return Response.json({ ok: false, reason: result.reason });

        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select("id, business_id, staff_id, status, starts_at, services(name, duration_minutes, buffer_before_min, buffer_after_min, gap_min, active_after_min), staff(name), businesses(name, timezone, page_theme, cancellation_window_hours, phone, email)")
          .eq("id", result.bookingId)
          .maybeSingle();

        if (!booking || booking.status !== "confirmed") {
          return Response.json({ ok: false, reason: "invalid" });
        }

        const windowHours = booking.businesses?.cancellation_window_hours ?? 24;
        if (new Date(booking.starts_at).getTime() < Date.now() + windowHours * 60 * 60 * 1000) {
          return Response.json({
            ok: false,
            reason: "window_passed",
            businessName: booking.businesses?.name ?? "the salon",
            windowHours,
            contactPhone: booking.businesses?.phone ?? null,
            contactEmail: booking.businesses?.email ?? null,
          });
        }

        return Response.json({
          ok: true,
          businessId: booking.business_id,
          staffId: booking.staff_id,
          businessName: booking.businesses?.name ?? "",
          theme: booking.businesses?.page_theme ?? null,
          timezone: booking.businesses?.timezone || "UTC",
          serviceName: booking.services?.name ?? "Appointment",
          staffName: booking.staff?.name ?? "the team",
          currentStartsAtIso: booking.starts_at,
          service: {
            duration_minutes: booking.services?.duration_minutes ?? 30,
            buffer_before_min: booking.services?.buffer_before_min ?? null,
            buffer_after_min: booking.services?.buffer_after_min ?? null,
            gap_min: booking.services?.gap_min ?? null,
            active_after_min: booking.services?.active_after_min ?? null,
          },
        });
      },
    },
  },
});
