import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "@/lib/booking-tokens.server";
import { readJsonWithLimit } from "@/lib/request-limits";

export const Route = createFileRoute("/api/booking-actions/reschedule-commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = await readJsonWithLimit<{ token?: string; starts_at?: string }>(request, 4 * 1024);
        if ("error" in parsed) {
          return new Response("Invalid request", { status: 400 });
        }
        const body = parsed.value;
        const { token, starts_at } = body;
        if (!token || typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token) || !starts_at || typeof starts_at !== "string" || !Number.isFinite(Date.parse(starts_at))) {
          return new Response("Invalid request", { status: 400 });
        }

        const { data: result, error } = await (supabaseAdmin as any).rpc("reschedule_booking_with_token", {
          p_token_hash: await sha256Hex(token),
          p_new_starts_at: starts_at,
        });
        if (error) {
          if (typeof error.message === "string" && error.message.includes("SLOT_TAKEN")) {
            return Response.json({ ok: false, reason: "slot_taken" });
          }
          return Response.json({ ok: false, reason: "invalid" });
        }

        return Response.json(result ?? { ok: false, reason: "invalid" });
      },
    },
  },
});
