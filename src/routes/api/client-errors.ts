import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Minimal error intake replacing the visibility lost when the Lovable
// integration (and its error reporting) was removed. The browser-side
// reporter in __root.tsx POSTs uncaught errors here; they land in the
// client_errors table (service-role only), readable from the Supabase
// dashboard.
//
// Deliberately unauthenticated — errors happen on public pages too — so it
// is defensive instead: hard field-length caps, a global DB-backed rate
// limit (checked before insert), and it always returns 204 regardless of
// outcome so the endpoint tells a prober nothing.
const MAX_PER_MINUTE = 30;

export const Route = createFileRoute("/api/client-errors")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            message?: string;
            stack?: string;
            url?: string;
          };
          const message = (body.message ?? "").toString().slice(0, 500).trim();
          if (!message) return new Response(null, { status: 204 });

          const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
          const { count } = await (supabaseAdmin as any)
            .from("client_errors")
            .select("id", { count: "exact", head: true })
            .gte("created_at", oneMinuteAgo);
          if ((count ?? 0) >= MAX_PER_MINUTE) return new Response(null, { status: 204 });

          await (supabaseAdmin as any).from("client_errors").insert({
            message,
            stack: (body.stack ?? "").toString().slice(0, 4000) || null,
            url: (body.url ?? "").toString().slice(0, 500) || null,
            user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
          });
        } catch {
          // Never let the error reporter itself become a source of errors.
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
