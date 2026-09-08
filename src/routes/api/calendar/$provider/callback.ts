import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  callbackUrl,
  exchangeCode,
  providerIdentity,
  readOauthState,
  type CalendarProvider,
} from "@/lib/calendar-sync.server";

export const Route = createFileRoute("/api/calendar/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const provider = params.provider as CalendarProvider;
        try {
          const state = readOauthState(url.searchParams.get("state") || "");
          if (state.provider !== provider || !url.searchParams.get("code"))
            throw new Error("Invalid callback");
          const { data: business } = await (supabaseAdmin as any)
            .from("businesses")
            .select("id")
            .eq("id", state.businessId)
            .eq("owner_id", state.userId)
            .maybeSingle();
          if (!business) throw new Error("Business access changed");
          const tokens = await exchangeCode(
            provider,
            url.searchParams.get("code")!,
            callbackUrl(provider, url.origin),
          );
          const identity = await providerIdentity(provider, tokens.accessToken);
          const { error } = await (supabaseAdmin as any).rpc(
            "upsert_calendar_connection",
            {
              p_business_id: state.businessId,
              p_provider: provider,
              p_account_email: identity.account,
              p_calendar_id: identity.calendarId,
              p_calendar_summary: identity.calendarName,
              p_access_token: tokens.accessToken,
              p_refresh_token: tokens.refreshToken,
              p_access_token_expires_at: tokens.expiresAt,
            },
          );
          if (error) throw error;
          return Response.redirect(
            `${process.env.APP_URL || url.origin}/settings?tab=calendar&calendar=connected`,
            303,
          );
        } catch (error) {
          console.error(
            "[calendar-oauth] callback failed",
            error instanceof Error ? error.message : error,
          );
          return Response.redirect(
            `${process.env.APP_URL || url.origin}/settings?tab=calendar&calendar=error`,
            303,
          );
        }
      },
    },
  },
});
