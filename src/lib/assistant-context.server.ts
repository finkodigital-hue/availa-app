import { createClient } from "@supabase/supabase-js";
import { assistantFacts, type AssistantVisit } from "@/lib/assistant-facts";
import { businessDayRange } from "@/lib/business-day";
import { requireVerifiedIdentity } from "@/lib/verified-identity.server";

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
    .select("id, name, plan, timezone, currency")
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

  const [todayQ, upcomingQ, recentQ, paymentsQ, servicesQ] = await Promise.all([
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
      .select("id, name, duration_minutes, price_cents", { count: "exact" })
      .eq("business_id", business.id)
      .eq("active", true)
      .is("archived_at", null)
      .order("name")
      .limit(100),
  ]);
  for (const result of [todayQ, upcomingQ, recentQ, paymentsQ, servicesQ]) {
    if (result.error) throw result.error;
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
  });
  return { business, summary: JSON.stringify(facts) };
}
