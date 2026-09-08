import { createFileRoute } from "@tanstack/react-router";
import { peekBookingActionToken } from "@/lib/booking-tokens.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseTheme } from "@/lib/theme";
import { assertStudio, STUDIO_FEATURE_ERROR } from "@/lib/plan.server";
import { readJsonWithLimit } from "@/lib/request-limits";

export const Route = createFileRoute("/api/reviews/peek")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = await readJsonWithLimit<{ token?: string }>(request, 4 * 1024);
        const { token } = "error" in parsed ? {} : parsed.value;
        if (!token)
          return Response.json(
            { ok: false, reason: "invalid" },
            { status: 400 },
          );
        const lookup = await peekBookingActionToken(token, "review");
        if (!lookup.ok) return Response.json(lookup, { status: 400 });
        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select(
            "id, business_id, status, starts_at, ends_at, services(name), staff(name), businesses(name, page_theme, timezone)",
          )
          .eq("id", lookup.bookingId)
          .maybeSingle();
        if (
          !booking ||
          booking.status !== "completed" ||
          new Date(booking.ends_at).getTime() > Date.now()
        )
          return Response.json(
            { ok: false, reason: "not_completed" },
            { status: 400 },
          );
        try {
          await assertStudio(booking.business_id);
        } catch (error) {
          if (error instanceof Error && error.message === STUDIO_FEATURE_ERROR) {
            return Response.json({ ok: false, reason: "studio_required", error: STUDIO_FEATURE_ERROR }, { status: 402 });
          }
          throw error;
        }
        const { data: existing } = await (supabaseAdmin as any)
          .from("customer_reviews")
          .select("id")
          .eq("booking_id", booking.id)
          .maybeSingle();
        if (existing)
          return Response.json(
            { ok: false, reason: "already_submitted" },
            { status: 409 },
          );
        return Response.json({
          ok: true,
          businessName: booking.businesses?.name ?? "Your salon",
          serviceName: booking.services?.name ?? "Appointment",
          staffName: booking.staff?.name ?? null,
          startsAt: booking.starts_at,
          timezone: booking.businesses?.timezone || "UTC",
          theme: parseTheme(booking.businesses?.page_theme),
        });
      },
    },
  },
});
