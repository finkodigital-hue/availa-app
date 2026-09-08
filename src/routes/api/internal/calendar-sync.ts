import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  deleteProviderEvent,
  putProviderEvent,
  refreshAccessToken,
  type CalendarProvider,
} from "@/lib/calendar-sync.server";
import { readJsonWithLimit } from "@/lib/request-limits";

export const Route = createFileRoute("/api/internal/calendar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CALENDAR_SYNC_SECRET;
        if (
          !expected ||
          request.headers.get("authorization") !== `Bearer ${expected}`
        )
          return new Response(null, { status: 401 });
        const parsed = await readJsonWithLimit<{ booking_id?: string }>(
          request,
          2048,
        );
        if ("error" in parsed || !parsed.value.booking_id)
          return new Response(null, { status: 400 });
        const { data: booking } = await (supabaseAdmin as any)
          .from("bookings")
          .select(
            "id,business_id,starts_at,ends_at,status,customer_name,custom_title,services(name),staff(name),businesses(name,timezone,address)",
          )
          .eq("id", parsed.value.booking_id)
          .maybeSingle();
        if (!booking) return new Response(null, { status: 204 });
        const { data: connections } = await (supabaseAdmin as any).rpc(
          "get_calendar_credentials",
          { p_business_id: booking.business_id },
        );
        let allSucceeded = true;
        for (const connection of connections || []) {
          const provider = connection.provider as CalendarProvider;
          try {
            let accessToken = connection.access_token;
            if (
              new Date(connection.access_token_expires_at).getTime() <
              Date.now() + 60_000
            ) {
              const fresh = await refreshAccessToken(
                provider,
                connection.refresh_token,
              );
              accessToken = fresh.accessToken;
              await (supabaseAdmin as any).rpc("update_calendar_access_token", {
                p_connection_id: connection.connection_id,
                p_access_token: fresh.accessToken,
                p_access_token_expires_at: fresh.expiresAt,
                p_new_refresh_token: fresh.refreshToken || null,
              });
            }
            const { data: mapping } = await (supabaseAdmin as any)
              .from("calendar_event_mappings")
              .select("provider_event_id")
              .eq("connection_id", connection.connection_id)
              .eq("booking_id", booking.id)
              .maybeSingle();
            if (booking.status === "cancelled") {
              if (mapping?.provider_event_id)
                await deleteProviderEvent(
                  provider,
                  accessToken,
                  mapping.provider_event_id,
                );
              await (supabaseAdmin as any)
                .from("calendar_event_mappings")
                .delete()
                .eq("connection_id", connection.connection_id)
                .eq("booking_id", booking.id);
            } else {
              const eventId = await putProviderEvent(
                provider,
                accessToken,
                mapping?.provider_event_id || null,
                {
                  title:
                    booking.custom_title ||
                    booking.services?.name ||
                    "Appointment",
                  description: `${booking.customer_name || "Client"}${booking.staff?.name ? ` with ${booking.staff.name}` : ""}`,
                  location: booking.businesses?.address,
                  startsAt: booking.starts_at,
                  endsAt: booking.ends_at,
                  timezone: booking.businesses?.timezone || "UTC",
                },
              );
              await (supabaseAdmin as any)
                .from("calendar_event_mappings")
                .upsert(
                  {
                    connection_id: connection.connection_id,
                    booking_id: booking.id,
                    provider_event_id: eventId,
                  },
                  { onConflict: "connection_id,booking_id" },
                );
            }
            await (supabaseAdmin as any).rpc("mark_calendar_sync_result", {
              p_connection_id: connection.connection_id,
              p_success: true,
              p_error: null,
              p_needs_reconnect: false,
            });
          } catch (error: any) {
            allSucceeded = false;
            await (supabaseAdmin as any).rpc("mark_calendar_sync_result", {
              p_connection_id: connection.connection_id,
              p_success: false,
              p_error: String(error?.message || error).slice(0, 500),
              p_needs_reconnect: Boolean(error?.reconnect),
            });
          }
        }
        if (allSucceeded)
          await (supabaseAdmin as any)
            .from("calendar_sync_outbox")
            .delete()
            .eq("booking_id", booking.id);
        return new Response(null, { status: 204 });
      },
    },
  },
});
