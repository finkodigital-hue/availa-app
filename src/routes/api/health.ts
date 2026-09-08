import { createFileRoute } from "@tanstack/react-router";

const CHECK_TIMEOUT_MS = 4_000;

type Check = {
  status: "ok" | "error";
  latencyMs?: number;
};

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function checkSupabase(url: string, key: string): Promise<Check> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return {
      status: response.ok ? "ok" : "error",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error("[health] Supabase reachability check failed", error);
    return { status: "error", latencyMs: Date.now() - startedAt };
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const supabaseUrl = process.env.SUPABASE_URL;
        const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const configuration: Check = {
          status:
            supabaseUrl && publishableKey && serviceRoleKey ? "ok" : "error",
        };

        if (configuration.status === "error") {
          const missing = [
            !supabaseUrl && "SUPABASE_URL",
            !publishableKey && "SUPABASE_PUBLISHABLE_KEY",
            !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
          ].filter(Boolean);
          console.error(
            `[health] Missing required configuration: ${missing.join(", ")}`,
          );
        }

        const supabase =
          supabaseUrl && publishableKey
            ? await checkSupabase(supabaseUrl, publishableKey)
            : ({ status: "error" } satisfies Check);
        const healthy =
          configuration.status === "ok" && supabase.status === "ok";

        return json(
          {
            status: healthy ? "ok" : "degraded",
            checkedAt: new Date().toISOString(),
            checks: { configuration, supabase },
          },
          healthy ? 200 : 503,
        );
      },
    },
  },
});
