import { createFileRoute } from "@tanstack/react-router";
import { sha256Hex } from "@/lib/booking-tokens.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/reviews/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const input = (await request.json().catch(() => ({}))) as {
          token?: string;
          rating?: number;
          body?: string;
          agreedToPublish?: boolean;
        };
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
