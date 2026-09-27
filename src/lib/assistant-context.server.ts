import { createClient } from "@supabase/supabase-js";
import { assistantFacts, type AssistantVisit } from "@/lib/assistant-facts";
import { verifiedAssistantSlots } from "@/lib/assistant-availability";
import { businessDayRange } from "@/lib/business-day";
import { bookingPageUrl } from "@/lib/booking-channels";
import { requireVerifiedIdentity } from "@/lib/verified-identity.server";
import { trustedAppOrigin } from "@/lib/app-origin.server";
import { loadRebookingOpportunities } from "@/lib/rebooking-opportunities.server";

function relationName(value: unknown, fallback: string): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return fallback;
  return typeof row.name === "string" ? row.name : fallback;
}

function boundedName(
  value: string | null | undefined,
  fallback: string,
): string {
  return (value?.trim() || fallback).slice(0, 100);
}

/** Owner-scoped, read-only facts. Do not put private notes or health data here. */
export async function buildAssistantContext(accessToken: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storage: undefined,
      },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );
  const identity = await requireVerifiedIdentity(supabase, accessToken);
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select(
      "id, name, slug, plan, timezone, currency, review_requests_enabled, deletion_requested_at",
    )
    .eq("owner_id", identity.user.id)
    .maybeSingle();
  if (businessError) throw businessError;
  if (!business) return { business: null, summary: "" };

  const now = new Date();
  const timezone = business.timezone || "Europe/London";
  const currency = business.currency || "GBP";
  const { start, end } = businessDayRange(now, timezone);
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);
  const past30 = new Date(now);
  past30.setDate(past30.getDate() - 30);
  const slotLookupStart = new Date(start.getTime() - 86_400_000);
  const slotLookupEnd = new Date(start.getTime() + 9 * 86_400_000);

  const [
    todayQ,
    upcomingQ,
    recentQ,
    paymentsQ,
    servicesQ,
    staffQ,
    staffHoursQ,
    businessHoursQ,
    periodsQ,
    slotBookingsQ,
    blocksQ,
    holidaysQ,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, starts_at, customer_name, status, payment_status, price_cents, amount_paid_cents, services(name), staff(name)",
        { count: "exact" },
      )
      .eq("business_id", business.id)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(80),
    supabase
      .from("bookings")
      .select("id, starts_at, status, services(name), staff(name)", {
        count: "exact",
      })
      .eq("business_id", business.id)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", in14.toISOString())
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(200),
    supabase
      .from("bookings")
      .select("service_id, status", { count: "exact" })
      .eq("business_id", business.id)
      .gte("starts_at", past30.toISOString())
      .lt("starts_at", now.toISOString())
      .neq("status", "cancelled")
      .limit(500),
    supabase
      .from("payments")
      .select("type, amount_cents, currency", { count: "exact" })
      .eq("business_id", business.id)
      .eq("status", "succeeded")
      .in("type", ["charge", "refund"])
      .gte("created_at", past30.toISOString())
      .lt("created_at", now.toISOString())
      .limit(500),
    supabase
      .from("services")
      .select(
        "id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, gap_min, active_after_min",
        { count: "exact" },
      )
      .eq("business_id", business.id)
      .eq("active", true)
      .is("archived_at", null)
      .order("name")
      .limit(100),
    supabase
      .from("staff")
      .select("id, name", { count: "exact" })
      .eq("business_id", business.id)
      .eq("active", true)
      .eq("bookable", true)
      .is("archived_at", null)
      .order("name")
      .limit(50),
    supabase
      .from("staff_hours")
      .select(
        "staff_id, weekday, closed, open_time, close_time, repeat_weeks, repeat_anchor",
        { count: "exact" },
      )
      .eq("business_id", business.id)
      .limit(500),
    supabase
      .from("business_hours")
      .select("weekday, closed, open_time, close_time", { count: "exact" })
      .eq("business_id", business.id)
      .limit(14),
    supabase
      .from("business_hour_periods")
      .select("weekday, open_time, close_time", { count: "exact" })
      .eq("business_id", business.id)
      .limit(50),
    supabase
      .from("bookings")
      .select(
        "staff_id, starts_at, ends_at, status, gap_min, active_after_min, buffer_before_min, buffer_after_min",
        { count: "exact" },
      )
      .eq("business_id", business.id)
      .lt("starts_at", slotLookupEnd.toISOString())
      .gt("ends_at", slotLookupStart.toISOString())
      .neq("status", "cancelled")
      .limit(1000),
    supabase
      .from("blocked_dates_public")
      .select("staff_id, starts_at, ends_at", { count: "exact" })
      .eq("business_id", business.id)
      .lt("starts_at", slotLookupEnd.toISOString())
      .gt("ends_at", slotLookupStart.toISOString())
      .limit(500),
    supabase
      .from("holiday_closures")
      .select("starts_on, ends_on", { count: "exact" })
      .eq("business_id", business.id)
      .lte("starts_on", slotLookupEnd.toISOString().slice(0, 10))
      .gte("ends_on", slotLookupStart.toISOString().slice(0, 10))
      .limit(100),
  ]);
  for (const result of [todayQ, upcomingQ, recentQ, paymentsQ, servicesQ]) {
    if (result.error) throw result.error;
  }

  let verifiedSlots: ReturnType<typeof verifiedAssistantSlots> | null = null;
  let availabilityNote =
    "Availability could not be verified; check Calendar before offering a time.";
  const availabilityQueries = [
    staffQ,
    staffHoursQ,
    businessHoursQ,
    periodsQ,
    slotBookingsQ,
    blocksQ,
    holidaysQ,
  ];
  const complete =
    availabilityQueries.every(
      (query) => !query.error && query.count === query.data?.length,
    ) &&
    servicesQ.count === servicesQ.data?.length &&
    !business.deletion_requested_at;
  if (complete) {
    const linksQ = await supabase
      .from("service_staff")
      .select("service_id, staff_id", { count: "exact" })
      .eq("business_id", business.id)
      .limit(500);
    if (!linksQ.error && linksQ.count === linksQ.data?.length) {
      try {
        verifiedSlots = verifiedAssistantSlots({
          now,
          timeZone: timezone,
          staff: (staffQ.data ?? []).map((row) => ({
            id: row.id,
            name: boundedName(row.name, "Staff member"),
          })),
          services: (servicesQ.data ?? []).map((row) => ({
            id: row.id,
            name: boundedName(row.name, "Service"),
            duration_minutes: row.duration_minutes,
            buffer_before_min: row.buffer_before_min,
            buffer_after_min: row.buffer_after_min,
            gap_min: row.gap_min,
            active_after_min: row.active_after_min,
          })),
          serviceStaff: linksQ.data ?? [],
          staffHours: staffHoursQ.data ?? [],
          businessHours: businessHoursQ.data ?? [],
          businessPeriods: periodsQ.data ?? [],
          bookings: slotBookingsQ.data ?? [],
          blocks: blocksQ.data ?? [],
          holidayClosures: holidaysQ.data ?? [],
        });
        availabilityNote = verifiedSlots.length
          ? "Representative bookable slots in the next seven salon-local days; availability can change before sharing or booking."
          : "No verified slots found in the next seven salon-local days for active, bookable staff and services.";
      } catch {
        verifiedSlots = null;
        availabilityNote =
          "Availability could not be verified; check Calendar before offering a time.";
      }
    }
  }

  const today: AssistantVisit[] = (todayQ.data ?? []).map((booking) => ({
    id: booking.id,
    startsAt: booking.starts_at,
    customer: boundedName(booking.customer_name, "Customer"),
    service: boundedName(relationName(booking.services, "Service"), "Service"),
    staff: boundedName(relationName(booking.staff, "Unassigned"), "Unassigned"),
    status: booking.status,
    paymentStatus: booking.payment_status,
    priceCents: booking.price_cents ?? 0,
    paidCents: booking.amount_paid_cents ?? 0,
  }));
  const upcoming: AssistantVisit[] = (upcomingQ.data ?? []).map((booking) => ({
    id: booking.id,
    startsAt: booking.starts_at,
    customer: "",
    service: boundedName(relationName(booking.services, "Service"), "Service"),
    staff: boundedName(relationName(booking.staff, "Unassigned"), "Unassigned"),
    status: booking.status,
    paymentStatus: "",
    priceCents: 0,
    paidCents: 0,
  }));
  const facts = assistantFacts({
    asOf: now.toISOString(),
    businessName: boundedName(business.name, "Salon"),
    timeZone: timezone,
    currency,
    today,
    todayCount: todayQ.count ?? today.length,
    upcoming,
    upcomingCount: upcomingQ.count ?? upcoming.length,
    recent: (recentQ.data ?? []).map((row) => ({
      serviceId: row.service_id,
      status: row.status,
    })),
    recentCount: recentQ.count ?? recentQ.data?.length ?? 0,
    payments: (paymentsQ.data ?? []).map((row) => ({
      type: row.type,
      amountCents: row.amount_cents,
      currency: row.currency,
    })),
    paymentsCount: paymentsQ.count ?? paymentsQ.data?.length ?? 0,
    services: (servicesQ.data ?? []).map((row) => ({
      id: row.id,
      name: boundedName(row.name, "Service"),
      durationMinutes: row.duration_minutes,
      priceCents: row.price_cents,
    })),
    servicesCount: servicesQ.count ?? servicesQ.data?.length ?? 0,
    reviewRequestsEnabled: business.review_requests_enabled,
    verifiedSlots,
    availabilityNote,
  });
  let rebooking: {
    available: boolean;
    partial: boolean;
    opportunities: {
      customerName: string;
      serviceName: string;
      dueAt: string;
    }[];
  } = { available: false, partial: false, opportunities: [] };
  if (business.plan === "studio" && !business.deletion_requested_at) {
    try {
      const result = await loadRebookingOpportunities({
        businessId: business.id,
        businessName: business.name,
      });
      rebooking = {
        available: result.available,
        partial: result.partial,
        opportunities: result.opportunities.slice(0, 8).map((item) => ({
          customerName: boundedName(item.customerName, "Customer"),
          serviceName: boundedName(item.serviceName, "Service"),
          dueAt: item.dueAt,
        })),
      };
    } catch (error) {
      console.error("[assistant] rebooking opportunities unavailable", error);
    }
  }
  const bookingUrl = business.slug
    ? bookingPageUrl(trustedAppOrigin(), business.slug)
    : null;
  return {
    business,
    summary: JSON.stringify({ ...facts, bookingUrl, rebooking }),
  };
}
