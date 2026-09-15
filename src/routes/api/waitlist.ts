import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readJsonWithLimit } from "@/lib/request-limits";
import { notifyWaitlistSignup } from "@/lib/resend.server";

export const Route = createFileRoute("/api/waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("origin") !== new URL(request.url).origin) {
          return new Response(null, { status: 403 });
        }
        const parsed = await readJsonWithLimit<{ email?: unknown }>(
          request,
          2048,
        );
        if ("error" in parsed) return parsed.error;
        const email =
          typeof parsed.value?.email === "string"
            ? parsed.value.email.trim().toLowerCase()
            : "";
        if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return Response.json({ message: "INVALID_EMAIL" }, { status: 400 });
        }
        // The database validates, rate-limits and rejects duplicates before
        // any email is sent. The recipient is never supplied by the visitor.
        const { error } = await supabaseAdmin.rpc("join_waitlist", {
          p_email: email,
          p_note: null,
        });
        if (error) {
          if (error.message.includes("ALREADY_ON_LIST"))
            return Response.json({ ok: true });
          const limited = error.message.includes("RATE_LIMITED");
          return Response.json(
            {
              message: limited
                ? "Too many requests"
                : "Could not join waitlist",
            },
            { status: limited ? 429 : 503 },
          );
        }
        try {
          await notifyWaitlistSignup(email);
        } catch {
          // A provider outage must not discard a successfully saved signup.
          console.error(
            "Waitlist signup saved, but help inbox notification failed.",
          );
        }
        return Response.json({ ok: true });
      },
    },
  },
});
