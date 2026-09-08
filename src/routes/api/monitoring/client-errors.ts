import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_WINDOW_MINUTES = 20;
const DEFAULT_THRESHOLD = 5;

function isAuthorized(request: Request) {
  const secret = process.env.MONITORING_SECRET;
  const supplied = request.headers.get("authorization");
  return Boolean(secret && supplied === `Bearer ${secret}`);
}

export const Route = createFileRoute("/api/monitoring/client-errors")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        const since = new Date(
          Date.now() - DEFAULT_WINDOW_MINUTES * 60_000,
        ).toISOString();
        // Generated database types intentionally lag the pending migration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error } = await (supabaseAdmin as any)
          .from("client_errors")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);

        if (error) {
          console.error("[monitoring] Could not count client errors", error);
          return Response.json(
            { status: "error", checkedAt: new Date().toISOString() },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }

        const observed = count ?? 0;
        const healthy = observed < DEFAULT_THRESHOLD;
        return Response.json(
          {
            status: healthy ? "ok" : "alert",
            checkedAt: new Date().toISOString(),
            windowMinutes: DEFAULT_WINDOW_MINUTES,
            threshold: DEFAULT_THRESHOLD,
            count: observed,
          },
          {
            status: healthy ? 200 : 503,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
