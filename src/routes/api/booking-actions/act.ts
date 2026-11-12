import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "@/lib/booking-tokens.server";
import { readJsonWithLimit } from "@/lib/request-limits";
import { processBookingChangeEmails } from "@/lib/booking-change-email.server";
import { consumePublicRequest, publicRequestLimitResponse } from "@/lib/public-request-limit.server";

// Backs the Confirm and Cancel one-tap links. The token is the *only*
// locator — there is no booking id anywhere in the request other than what
// the token itself resolves to server-side, so there is no field to edit in
// the request to reach a different booking.
export const Route = createFileRoute("/api/booking-actions/act")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try { await consumePublicRequest("token", { headers: request.headers }); }
        catch (error) { return publicRequestLimitResponse(error); }
        const parsed = await readJsonWithLimit<{ action?: string; token?: string }>(request, 4 * 1024);
        if ("error" in parsed) {
          return new Response("Invalid request", { status: 400 });
        }
        const body = parsed.value;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return new Response("Invalid request", { status: 400 });
        }
        const { action, token } = body;
        if ((action !== "confirm" && action !== "cancel") || typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token)) {
          return new Response("Invalid request", { status: 400 });
        }

        const { data: result, error } = await (supabaseAdmin as any).rpc("apply_booking_action_token", {
          p_token_hash: await sha256Hex(token),
          p_action: action,
        });
        if (error || !result) {
          // Failed mutation leaves the token usable. Do not label a database
          // outage as a cancellation-window rejection or claim confirmation.
          return Response.json({ error: "Could not update the booking. Please retry." }, { status: 503 });
        }
        if (result.ok && action === "cancel") {
          try { await processBookingChangeEmails(result.bookingId); }
          catch { console.error("[cancel] Customer email queued for cron retry"); }
        }
        const { bookingId: _bookingId, ...receipt } = result;
        return Response.json(receipt);
      },
    },
  },
});
