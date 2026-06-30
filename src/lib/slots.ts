import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SlotService = {
  duration_minutes: number;
  buffer_before_min?: number | null;
  buffer_after_min?: number | null;
};

// Sensible default hours for a brand-new business that hasn't configured
// anything yet — Monday to Saturday, 9 am to 6 pm; Sunday closed.
function defaultPeriodsFor(weekday: number): Array<{ open_time: string; close_time: string }> {
  if (weekday === 0) return [];
  return [{ open_time: "09:00", close_time: "18:00" }];
}

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
        supabase.from("bookings").select("id, starts_at, ends_at, status").eq("business_id", businessId!).eq("staff_id", staffId!).gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("blocked_dates").select("starts_at, ends_at, staff_id").eq("business_id", businessId!).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
      ]);
      const staffH: any = staffHoursR.data;
      const bizH: any = bizHoursR.data;
      // Staff override wins if they have explicit open hours (single period).
      let periods: Array<{ open_time: string; close_time: string }>;
      if (staffH && !staffH.closed && staffH.open_time && staffH.close_time) {
        periods = [{ open_time: staffH.open_time, close_time: staffH.close_time }];
      } else if ((periodsR.data ?? []).length > 0) {
        periods = periodsR.data as any;
      } else if (bizH && !bizH.closed && bizH.open_time && bizH.close_time) {
        periods = [{ open_time: bizH.open_time, close_time: bizH.close_time }];
      } else if (!bizH && !staffH) {
        periods = defaultPeriodsFor(wd);
      } else {
        periods = [];
      }
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
    const totalMin = service.duration_minutes + bufBefore + bufAfter;
    const out: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    for (const p of dayData.periods) {
      const [oh, om] = String(p.open_time).split(":").map(Number);
      const [ch, cm] = String(p.close_time).split(":").map(Number);
      const open = new Date(date); open.setHours(oh, om, 0, 0);
      const close = new Date(date); close.setHours(ch, cm, 0, 0);
      for (let t = new Date(open); t.getTime() + totalMin * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
        if (t < now) continue;
        const blockStart = new Date(t.getTime());
        const blockEnd = new Date(t.getTime() + totalMin * 60000);
        const conflict = dayData.bookings.some((b: any) => b.id !== excludeBookingId && new Date(b.starts_at) < blockEnd && new Date(b.ends_at) > blockStart);
        const blocked = dayData.blocked.some((b: any) => (!b.staff_id || b.staff_id === staffId) && new Date(b.starts_at) < blockEnd && new Date(b.ends_at) > blockStart);
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
