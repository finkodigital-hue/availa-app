import { supabase } from "@/integrations/supabase/client";

// Shared booking-aggregation logic used by both the Dashboard's "Performance"
// section and the Reports page's date-range reports — kept in one place so
// the two surfaces can never drift apart on what "revenue" or "a booking"
// means. Both read the same non-cancelled bookings within a date range and
// reduce them the same way.

export type ReportBooking = {
  id: string;
  starts_at: string;
  price_cents: number | null;
  status: string;
  staff_id: string | null;
  service_id: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  services: { name: string; color: string | null; duration_minutes: number; price_cents: number } | null;
  staff: { name: string } | null;
};

export async function fetchBookingsInRange(
  businessId: string,
  start: Date,
  end: Date,
): Promise<ReportBooking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, price_cents, status, staff_id, service_id, customer_id, customer_name, services(name, color, duration_minutes, price_cents), staff(name)",
    )
    .eq("business_id", businessId)
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .neq("status", "cancelled")
    .order("starts_at");
  if (error) throw error;
  return (data ?? []) as unknown as ReportBooking[];
}

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

export function aggregateStaffPerformance(bookings: ReportBooking[]): StaffPerformance[] {
  const map = new Map<
    string,
    { name: string; revenue: number; bookings: number; durationMin: number; customers: Set<string> }
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
    cur.revenue += b.price_cents ?? 0;
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

export function aggregateServicePerformance(bookings: ReportBooking[]): ServicePerformance[] {
  const map = new Map<string, { name: string; revenue: number; bookings: number; price: number; duration: number }>();
  bookings.forEach((b) => {
    if (!b.service_id) return;
    const cur = map.get(b.service_id) ?? {
      name: b.services?.name ?? "—",
      revenue: 0,
      bookings: 0,
      price: b.services?.price_cents ?? 0,
      duration: b.services?.duration_minutes ?? 0,
    };
    cur.revenue += b.price_cents ?? 0;
    cur.bookings += 1;
    map.set(b.service_id, cur);
  });
  return Array.from(map.entries())
    .map(([serviceId, s]) => ({ serviceId, ...s }))
    .sort((a, b) => b.revenue - a.revenue);
}

export type PeriodTotals = { revenue: number; bookings: number; avg: number };

export function computeTotals(bookings: ReportBooking[]): PeriodTotals {
  const revenue = bookings.reduce((a, b) => a + (b.price_cents ?? 0), 0);
  const count = bookings.length;
  return { revenue, bookings: count, avg: count ? Math.round(revenue / count) : 0 };
}

// Percent change, or null when there's no meaningful baseline (both periods
// zero) — callers should render "—" rather than a misleading 0%.
export function pctDelta(cur: number, prev: number): number | null {
  if (prev > 0) return ((cur - prev) / prev) * 100;
  if (cur > 0) return 100;
  return null;
}
