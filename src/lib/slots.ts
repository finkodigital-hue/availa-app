import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDayPeriods } from "@/lib/staff-hours";

import { expandBookingSegments, expandCandidateSegments, segmentsOverlap, type SlotService } from "@/lib/booking-segments";
export { expandBookingSegments, expandCandidateSegments, segmentsOverlap, type SlotService, type Segment } from "@/lib/booking-segments";

export function useAvailableSlots(opts: {
  businessId: string | undefined;
  staffId: string | undefined;
  service: SlotService | undefined;
  date: Date;
  excludeBookingId?: string;
}) {
  const { businessId, staffId, service, date, excludeBookingId } = opts;
  const dateKey = date.toDateString();

  const dayQuery = useQuery({
    queryKey: ["slots-day", businessId, staffId, dateKey],
    enabled: !!businessId && !!staffId,
    queryFn: async () => {
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      const wd = date.getDay();
      const [periodsR, bizHoursR, staffHoursR, bookingsR, blockedR] = await Promise.all([
        supabase.from("business_hour_periods").select("open_time, close_time").eq("business_id", businessId!).eq("weekday", wd).order("open_time"),
        supabase.from("business_hours").select("*").eq("business_id", businessId!).eq("weekday", wd).maybeSingle(),
        supabase.from("staff_hours").select("*").eq("staff_id", staffId!).eq("weekday", wd).maybeSingle(),
        supabase.from("bookings").select("id, starts_at, ends_at, status, gap_min, active_after_min, buffer_before_min, buffer_after_min").eq("business_id", businessId!).eq("staff_id", staffId!).gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("blocked_dates_public").select("starts_at, ends_at, staff_id").eq("business_id", businessId!).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
      ]);
      const periods = resolveDayPeriods({
        weekday: wd,
        staffHours: staffHoursR.data as any,
        bizPeriods: (periodsR.data ?? []) as any,
        bizHours: bizHoursR.data as any,
        date,
      });
      return { periods, bookings: bookingsR.data ?? [], blocked: blockedR.data ?? [] };
    },
  });

  const slots = useMemo(() => {
    const dayData = dayQuery.data;
    if (!dayData || !service) return [];
    if (!dayData.periods.length) return [];
    const slotMin = 15;
    const bufBefore = service.buffer_before_min ?? 0;
    const bufAfter = service.buffer_after_min ?? 0;
    const gapMin = service.gap_min ?? 0;
    const activeAfterMin = service.active_after_min ?? 0;
    const totalMin = service.duration_minutes + bufBefore + bufAfter + gapMin + activeAfterMin;
    const out: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    const existingBookings = dayData.bookings.filter((b: any) => b.id !== excludeBookingId);
    const existingSegments = existingBookings.map((b: any) => expandBookingSegments(b));
    for (const p of dayData.periods) {
      const [oh, om] = String(p.open_time).split(":").map(Number);
      const [ch, cm] = String(p.close_time).split(":").map(Number);
      const open = new Date(date); open.setHours(oh, om, 0, 0);
      const close = new Date(date); close.setHours(ch, cm, 0, 0);
      for (let t = new Date(open); t.getTime() + totalMin * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
        if (t < now) continue;
        const candidateSegments = expandCandidateSegments(t.getTime(), service);
        const conflict = existingSegments.some((segs) => segmentsOverlap(candidateSegments, segs));
        // A blocked_dates row only matters if it overlaps an actual active
        // segment — staff being unavailable during a client's own gap (e.g.
        // colour developing) doesn't invalidate the slot.
        const blocked = dayData.blocked.some((b: any) => {
          if (b.staff_id && b.staff_id !== staffId) return false;
          const blockedSeg = [{ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() }];
          return segmentsOverlap(candidateSegments, blockedSeg);
        });
        if (!conflict && !blocked) {
          const slotStart = new Date(t.getTime() + bufBefore * 60000);
          out.push({ time: slotStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), iso: slotStart.toISOString(), hour: slotStart.getHours() });
        }
      }
    }
    return out;
  }, [dayQuery.data, service, date, staffId, excludeBookingId]);

  return { slots, isLoading: dayQuery.isLoading };
}


export function buildDateStrip(days = 14): Date[] {
  const arr: Date[] = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); arr.push(d); }
  return arr;
}
