import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authorizationUrl,
  callbackUrl,
  makeOauthState,
  type CalendarProvider,
} from "@/lib/calendar-sync.server";
import { readJsonWithLimit } from "@/lib/request-limits";

export const Route = createFileRoute("/api/calendar/$provider/connect")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = params.provider as CalendarProvider;
        if (provider !== "google" && provider !== "microsoft")
          return Response.json(
            { error: "Unsupported provider" },
            { status: 404 },
          );
        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer /, "");
        if (!token)
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data: auth, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !auth.user)
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const parsed = await readJsonWithLimit<{ businessId?: string }>(
          request,
          2048,
        );
        if ("error" in parsed || !parsed.value.businessId)
          return Response.json(
            { error: "Business is required" },
            { status: 400 },
          );
        const { data: business } = await (supabaseAdmin as any)
          .from("businesses")
          .select("id")
          .eq("id", parsed.value.businessId)
          .eq("owner_id", auth.user.id)
          .maybeSingle();
        if (!business)
          return Response.json({ error: "Forbidden" }, { status: 403 });
        const redirect = callbackUrl(provider, new URL(request.url).origin);
        const state = makeOauthState({
          provider,
          businessId: business.id,
          userId: auth.user.id,
        });
        return Response.json({
          url: authorizationUrl(provider, state, redirect),
        });
      },
    },
  },
});
