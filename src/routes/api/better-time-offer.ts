/* eslint-disable @typescript-eslint/no-explicit-any -- Private offer tables are server-only. */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sha256Hex } from "@/lib/booking-tokens.server";
import { readJsonWithLimit } from "@/lib/request-limits";
import { trustedAppOrigin } from "@/lib/app-origin.server";
import {
  consumePublicRequest,
  publicRequestLimitResponse,
} from "@/lib/public-request-limit.server";

const TOKEN = /^[a-f0-9]{64}$/;

async function lookup(raw: string) {
  if (!TOKEN.test(raw)) return null;
  const { data: offer, error } = await (supabaseAdmin as any)
    .from("appointment_waitlist_offers")
    .select("id,request_id,hold_id,status,expires_at,accepted_booking_id")
    .eq("token_hash", await sha256Hex(raw))
    .maybeSingle();
  if (error || !offer) return null;
  const [{ data: hold }, { data: request }] = await Promise.all([
    (supabaseAdmin as any)
      .from("booking_checkout_holds")
      .select(
        "id,business_id,service_id,staff_id,starts_at,ends_at,price_cents,currency,payment_mode,expires_at,fulfilled_booking_id",
      )
      .eq("id", offer.hold_id)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("appointment_waitlist_requests")
      .select(
        "id,status,customer_name,customer_email,customer_phone,automatic_offer_email_opt_in_at",
      )
      .eq("id", offer.request_id)
      .maybeSingle(),
  ]);
  if (!hold || !request) return null;
  const [{ data: business }, { data: service }, { data: staff }] =
    await Promise.all([
      (supabaseAdmin as any)
        .from("businesses")
        .select("id,name,slug,timezone,payment_mode,cancellation_window_hours")
        .eq("id", hold.business_id)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("services")
        .select("id,name,price_cents")
        .eq("id", hold.service_id)
        .eq("business_id", hold.business_id)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("staff")
        .select("id,name")
        .eq("id", hold.staff_id)
        .eq("business_id", hold.business_id)
        .maybeSingle(),
    ]);
  if (!business || !service || !staff) return null;
  return { offer, hold, request, business, service, staff };
}

export const Route = createFileRoute("/api/better-time-offer")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const found = await lookup(token);
        if (!found)
          return Response.json(
            { message: "This offer is unavailable." },
            { status: 404 },
          );
        const {
          offer,
          hold,
          request: waiting,
          business,
          service,
          staff,
        } = found;
        const available =
          ["reserved", "sent"].includes(offer.status) &&
          waiting.status === "active" &&
          !!waiting.automatic_offer_email_opt_in_at &&
          !hold.fulfilled_booking_id &&
          Date.parse(offer.expires_at) > Date.now() &&
          Date.parse(hold.expires_at) > Date.now();
        if (!available)
          return Response.json(
            {
              message:
                "This offer has ended. You can still check the salon's booking page.",
            },
            { status: 410 },
          );
        return Response.json(
          {
            businessId: business.id,
            businessName: business.name,
            businessSlug: business.slug,
            serviceId: service.id,
            serviceName: service.name,
            staffId: staff.id,
            staffName: staff.name,
            startsAt: hold.starts_at,
            endsAt: hold.ends_at,
            expiresAt: offer.expires_at,
            timezone: business.timezone || "Europe/London",
            priceCents: service.price_cents,
            currency: hold.currency,
            paymentMode: business.payment_mode,
            customerName: waiting.customer_name,
            customerEmail: waiting.customer_email,
            customerPhone: waiting.customer_phone || "",
            cancellationWindowHours: business.cancellation_window_hours ?? 24,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        if (request.headers.get("origin") !== trustedAppOrigin())
          return new Response(null, { status: 403 });
        const parsed = await readJsonWithLimit<{
          token?: string;
          action?: string;
          policyAccepted?: boolean;
        }>(request, 1024);
        if ("error" in parsed) return parsed.error;
        const { token = "", action, policyAccepted } = parsed.value ?? {};
        if (!TOKEN.test(token) || !["book", "stop"].includes(action ?? ""))
          return Response.json({ message: "Invalid offer." }, { status: 400 });
        try {
          await consumePublicRequest("booking", { headers: request.headers });
        } catch (error) {
          return publicRequestLimitResponse(error);
        }
        const found = await lookup(token);
        if (!found)
          return Response.json(
            { message: "This offer is unavailable." },
            { status: 404 },
          );
        if (action === "stop") {
          const { data: stopped, error } = await (supabaseAdmin as any).rpc(
            "stop_appointment_waitlist_offer_alerts",
            { p_token_hash: await sha256Hex(token) },
          );
          if (error || !stopped)
            return Response.json(
              { message: "Could not stop these alerts. Please try again." },
              { status: 503 },
            );
          return Response.json({
            ok: true,
            message: "You won't receive more alerts for this request.",
          });
        }
        if (!policyAccepted)
          return Response.json(
            { message: "Please read and accept the booking policy." },
            { status: 400 },
          );
        if (found.business.payment_mode !== "none")
          return Response.json(
            { message: "Online payment is required for this appointment." },
            { status: 400 },
          );
        const { data: bookingId, error } = await (supabaseAdmin as any).rpc(
          "accept_appointment_waitlist_offer_free",
          {
            p_token_hash: await sha256Hex(token),
          },
        );
        if (error || !bookingId)
          return Response.json(
            {
              message:
                "This time is no longer available. Please check the salon's booking page.",
            },
            { status: 409 },
          );
        return Response.json({ ok: true, bookingId });
      },
    },
  },
});
