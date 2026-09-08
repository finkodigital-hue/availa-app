import { createFileRoute } from "@tanstack/react-router";
import { peekBookingActionToken, sha256Hex } from "@/lib/booking-tokens.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStudio, STUDIO_FEATURE_ERROR } from "@/lib/plan.server";
import { readJsonWithLimit } from "@/lib/request-limits";

const MAX_REVIEW_BODY_BYTES = 8 * 1024;

export const Route = createFileRoute("/api/reviews/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = await readJsonWithLimit<{
          token?: string;
          rating?: number;
          body?: string;
          agreedToPublish?: boolean;
        }>(request, MAX_REVIEW_BODY_BYTES);
        const input = "error" in parsed ? {} : parsed.value;
        const body = input.body?.trim() ?? "";
        if (
          !input.token ||
          !Number.isInteger(input.rating) ||
          input.rating! < 1 ||
          input.rating! > 5 ||
          body.length < 2 ||
          body.length > 1000 ||
          input.agreedToPublish !== true
        ) {
          return Response.json(
            { ok: false, reason: "invalid_content" },
            { status: 400 },
          );
        }
        const lookup = await peekBookingActionToken(input.token, "review");
        if (!lookup.ok) return Response.json(lookup, { status: 400 });
        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select("business_id")
          .eq("id", lookup.bookingId)
          .maybeSingle();
        if (!booking) return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
        try {
          await assertStudio(booking.business_id);
        } catch (error) {
          if (error instanceof Error && error.message === STUDIO_FEATURE_ERROR) {
            return Response.json({ ok: false, reason: "studio_required", error: STUDIO_FEATURE_ERROR }, { status: 402 });
          }
          throw error;
        }
        const { data, error } = await (supabaseAdmin as any).rpc(
          "submit_customer_review",
          {
            p_token_hash: await sha256Hex(input.token),
            p_rating: input.rating,
            p_body: body,
            p_consent_version: "review-publication-v1",
          },
        );
        if (error) {
          console.error("[review-submit] failed", error);
          return Response.json(
            { ok: false, reason: "server_error" },
            { status: 500 },
          );
        }
        return Response.json(data, { status: data?.ok ? 200 : 400 });
      },
    },
  },
});
