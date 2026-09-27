import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { netCollected } from "@/lib/report-values";
import {
  aggregateDailyTakings,
  type DailyTakingsCurrency,
  type PaymentLedgerRow,
} from "@/lib/report-values";
import { businessDayRange } from "@/lib/business-day";

// Shared booking-aggregation logic used by both the Dashboard's "Performance"
// section and the Reports page's date-range reports — kept in one place so
// the two surfaces can never drift apart on what "revenue" or "a booking"
// means. Both read the same non-cancelled bookings within a date range and
// reduce them the same way.

export type ReportBooking = {
  id: string;
  starts_at: string;
  price_cents: number | null;
  amount_paid_cents: number | null;
  amount_refunded_cents: number | null;
  status: string;
  staff_id: string | null;
  service_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  services: {
    name: string;
    color: string | null;
    duration_minutes: number;
    price_cents: number;
  } | null;
  staff: { name: string } | null;
};

export const getBookingsInRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { start: string; end: string }) => {
    const start = new Date(data.start);
    const end = new Date(data.end);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start > end
    ) {
      throw new Error("Choose a valid report date range.");
    }
    return { start: start.toISOString(), end: end.toISOString() };
  })
  .handler(async ({ data: range, context }): Promise<ReportBooking[]> => {
    const { requireWorkspacePermission } =
      await import("@/lib/workspace-permission.server");
    const businessId = await requireWorkspacePermission(
      context,
      "reports.read",
    );

    // Reporting rows are read only after the signed-in owner's business has
    // been resolved above. Use the server-only client so browser-facing RLS
    // restrictions cannot silently turn a valid report into an empty one.
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, starts_at, price_cents, amount_paid_cents, amount_refunded_cents, status, staff_id, service_id, customer_id, customer_name, services(name, color, duration_minutes, price_cents), staff(name)",
      )
      .eq("business_id", businessId)
      .gte("starts_at", range.start)
      .lte("starts_at", range.end)
      .neq("status", "cancelled")
      .order("starts_at");
    if (error) throw error;
    return (data ?? []) as unknown as ReportBooking[];
  });

export async function fetchBookingsInRange(
  start: Date,
  end: Date,
): Promise<ReportBooking[]> {
  return getBookingsInRange({
    data: { start: start.toISOString(), end: end.toISOString() },
  });
}

export type DailyTakingsReport = {
  start: string;
  end: string;
  timeZone: string;
  currencies: DailyTakingsCurrency[];
};

export const getDailyTakings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DailyTakingsReport> => {
    const { requireWorkspacePermission } =
      await import("@/lib/workspace-permission.server");
    const businessId = await requireWorkspacePermission(
      context,
      "reports.read",
    );
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("timezone,currency")
      .eq("id", businessId)
      .single();
    if (businessError) throw businessError;
    const timeZone = business.timezone || "Europe/London";
    const { start, end } = businessDayRange(new Date(), timeZone);
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("type,status,amount_cents,currency,payment_method")
      .eq("business_id", businessId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true });
    if (error) throw error;
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone,
      currencies: aggregateDailyTakings(
        (data ?? []) as PaymentLedgerRow[],
        business.currency || "GBP",
      ),
    };
  });

export type StaffPerformance = {
  staffId: string;
  name: string;
  revenue: number;
  bookings: number;
  durationMin: number;
  hours: number;
  repeat: number;
  avg: number;
  avgDuration: number;
};

export function aggregateStaffPerformance(
  bookings: ReportBooking[],
): StaffPerformance[] {
  const map = new Map<
    string,
    {
      name: string;
      revenue: number;
      bookings: number;
      durationMin: number;
      customers: Set<string>;
    }
  >();
  bookings.forEach((b) => {
    if (!b.staff_id) return;
    const cur = map.get(b.staff_id) ?? {
      name: b.staff?.name ?? "—",
      revenue: 0,
      bookings: 0,
      durationMin: 0,
      customers: new Set<string>(),
    };
    cur.revenue += netCollected(b);
    cur.bookings += 1;
    cur.durationMin += b.services?.duration_minutes ?? 0;
    if (b.customer_id) cur.customers.add(b.customer_id);
    map.set(b.staff_id, cur);
  });
  return Array.from(map.entries()).map(([staffId, s]) => ({
    staffId,
    name: s.name,
    revenue: s.revenue,
    bookings: s.bookings,
    durationMin: s.durationMin,
    hours: Math.round((s.durationMin / 60) * 10) / 10,
    repeat: s.customers.size,
    avg: s.bookings ? Math.round(s.revenue / s.bookings) : 0,
    avgDuration: s.bookings ? Math.round(s.durationMin / s.bookings) : 0,
  }));
}

export type ServicePerformance = {
  serviceId: string;
  name: string;
  revenue: number;
  bookings: number;
  price: number;
  duration: number;
};

export function aggregateServicePerformance(
  bookings: ReportBooking[],
): ServicePerformance[] {
  const map = new Map<
    string,
    {
      name: string;
      revenue: number;
      bookings: number;
      price: number;
      duration: number;
    }
  >();
  bookings.forEach((b) => {
    if (!b.service_id) return;
    const cur = map.get(b.service_id) ?? {
      name: b.services?.name ?? "—",
      revenue: 0,
      bookings: 0,
      price: b.services?.price_cents ?? 0,
      duration: b.services?.duration_minutes ?? 0,
    };
    cur.revenue += netCollected(b);
    cur.bookings += 1;
    map.set(b.service_id, cur);
  });
  return Array.from(map.entries())
    .map(([serviceId, s]) => ({ serviceId, ...s }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type PeriodTotals = { revenue: number; bookings: number; avg: number };

export function computeTotals(bookings: ReportBooking[]): PeriodTotals {
  const revenue = bookings.reduce((a, b) => a + netCollected(b), 0);
  const count = bookings.length;
  return {
    revenue,
    bookings: count,
    avg: count ? Math.round(revenue / count) : 0,
  };
}

// Percent change, or null when there's no meaningful baseline (both periods
// zero) — callers should render "—" rather than a misleading 0%.
export function pctDelta(cur: number, prev: number): number | null {
  if (prev > 0) return ((cur - prev) / prev) * 100;
  if (cur > 0) return 100;
  return null;
}
