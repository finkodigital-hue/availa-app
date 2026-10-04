/* eslint-disable @typescript-eslint/no-explicit-any -- Offer tables are server-only until types regenerate. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  requestMatchesCancelledSlot,
  type AppointmentWaitlistRequest,
  type CancelledSlot,
} from "@/lib/appointment-waitlist";
import { sha256Hex } from "@/lib/booking-tokens.server";
import { sendEmail } from "@/lib/resend.server";
import { trustedAppOrigin } from "@/lib/app-origin.server";

type Request = AppointmentWaitlistRequest & {
  business_id: string;
  customer_email: string;
  created_at: string;
  automatic_offer_email_opt_in_at: string | null;
};
type Opening = CancelledSlot & { business_id: string; status: string };
type Reserved = {
  offer_id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  service_name: string;
  starts_at: string;
  timezone: string;
  customer_email: string;
  expires_at: string;
};

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

/** Off by default. A database hold is made before any message can leave. */
export async function processBetterTimeOffers() {
  const result = { reserved: 0, sent: 0, skipped: 0, failed: 0 };
  if (process.env.BETTER_TIME_OFFERS_ENABLED !== "true") return result;
  const now = new Date();
  const { data: events, error: eventError } = await (supabaseAdmin as any)
    .from("appointment_opening_events")
    .select("booking_id")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(20);
  if (eventError) throw new Error("Better-time event query failed");
  if (!events?.length) return result;
  const { data: openings, error: openingError } = await (supabaseAdmin as any)
    .from("bookings")
    .select("id,business_id,service_id,staff_id,starts_at,ends_at,status")
    .in(
      "id",
      events.map((event: { booking_id: string }) => event.booking_id),
    );
  if (openingError) throw new Error("Better-time opening query failed");
  const businessIds = [
    ...new Set(
      ((openings ?? []) as Opening[]).map((opening) => opening.business_id),
    ),
  ];
  if (!businessIds.length) return result;
  const { data: businesses, error: businessError } = await (
    supabaseAdmin as any
  )
    .from("businesses")
    .select("id,timezone")
    .in("id", businessIds);
  if (businessError) throw new Error("Better-time timezone query failed");
  const zones = new Map<string, string>(
    (businesses ?? []).map(
      (business: { id: string; timezone: string | null }) => [
        business.id,
        business.timezone || "Europe/London",
      ],
    ),
  );

  const openingsById = new Map<string, Opening>(
    ((openings ?? []) as Opening[]).map((opening) => [opening.id, opening]),
  );
  const markProcessed = async (id: string) => {
    const { error } = await (supabaseAdmin as any)
      .from("appointment_opening_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("booking_id", id)
      .is("processed_at", null);
    if (error)
      throw new Error("Better-time event outcome could not be recorded");
  };

  for (const event of events as { booking_id: string }[]) {
    if (result.reserved >= 10) break;
    const opening = openingsById.get(event.booking_id);
    if (
      !opening ||
      opening.status !== "cancelled" ||
      Date.parse(opening.starts_at) <= now.getTime() + 20 * 60_000
    ) {
      await markProcessed(event.booking_id);
      continue;
    }
    const zone = zones.get(opening.business_id);
    if (!zone) {
      await markProcessed(event.booking_id);
      continue;
    }
    const { data: requests, error: requestError } = await (supabaseAdmin as any)
      .from("appointment_waitlist_requests")
      .select(
        "id,business_id,service_id,preferred_staff_id,preferred_after,preferred_before,preferred_time,status,customer_email,created_at,automatic_offer_email_opt_in_at",
      )
      .eq("business_id", opening.business_id)
      .eq("service_id", opening.service_id)
      .eq("status", "active")
      .not("automatic_offer_email_opt_in_at", "is", null)
      .lte("preferred_after", opening.starts_at)
      .gte("preferred_before", opening.ends_at)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (requestError) throw new Error("Better-time candidate query failed");
    const candidates = ((requests ?? []) as Request[]).filter((request) =>
      requestMatchesCancelledSlot(request, opening, zone, now),
    );
    let offered = false;
    let taken = false;
    for (const request of candidates) {
      const token = randomToken();
      const { data, error } = await (supabaseAdmin as any).rpc(
        "reserve_appointment_waitlist_offer",
        {
          p_request_id: request.id,
          p_cancelled_booking_id: opening.id,
          p_token_hash: await sha256Hex(token),
          p_contact_hash: await sha256Hex(
            request.customer_email.trim().toLowerCase(),
          ),
        },
      );
      if (error) {
        // A hold/booking conflict means the opening has gone. Trying the next
        // person would not make it available again.
        if (/SLOT_TAKEN|unavailable|opening hours/i.test(error.message ?? "")) {
          taken = true;
          break;
        }
        result.skipped++;
        continue;
      }
      const offer = data as Reserved;
      offered = true;
      result.reserved++;
      const link = `${trustedAppOrigin()}/book/${encodeURIComponent(offer.business_slug)}/offer?token=${token}`;
      const when = new Intl.DateTimeFormat("en-GB", {
        timeZone: offer.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(offer.starts_at));
      const expiry = new Intl.DateTimeFormat("en-GB", {
        timeZone: offer.timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(offer.expires_at));
      let sent = false;
      try {
        const delivery = await sendEmail({
          businessId: offer.business_id,
          to: offer.customer_email,
          subject: `A ${offer.service_name} time opened up at ${offer.business_name}`,
          html: `<p>A time you asked for has opened up at ${escapeHtml(offer.business_name)}.</p><p><strong>${escapeHtml(offer.service_name)} — ${escapeHtml(when)}</strong></p><p><a href="${escapeHtml(link)}">See if it works for you</a></p><p>This link is available until ${escapeHtml(expiry)}. No appointment is booked until you complete it. You can stop alerts for this request from the offer page.</p>`,
          messageType: "booking_request_opening",
          idempotencyKey: `booking-request-offer:${offer.offer_id}`,
        });
        sent = delivery.status === "sent";
        if (sent) result.sent++;
        else result.skipped++;
      } catch {
        result.failed++;
      } finally {
        const { error: finishError } = await (supabaseAdmin as any).rpc(
          "finish_appointment_waitlist_offer_delivery",
          {
            p_offer_id: offer.offer_id,
            p_sent: sent,
          },
        );
        if (finishError)
          console.error(
            "[better-time-offers] Offer outcome could not be recorded",
          );
      }
      break; // One customer per opening per run.
    }
    if (offered) continue;
    if (taken) {
      const { data: activeOffers, error } = await (supabaseAdmin as any)
        .from("appointment_waitlist_offers")
        .select("id")
        .eq("cancelled_booking_id", opening.id)
        .in("status", ["reserved", "sent", "checkout"])
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (error) throw new Error("Better-time active-offer query failed");
      if (activeOffers?.length) continue; // Wait for the one-person window to end.
    }
    if ((requests ?? []).length < 1000 || taken)
      await markProcessed(event.booking_id);
  }
  return result;
}
