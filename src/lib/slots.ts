import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SlotService = {
  duration_minutes: number;
  buffer_before_min?: number | null;
  buffer_after_min?: number | null;
};

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
      const [bizHoursR, staffHoursR, bookingsR, blockedR] = await Promise.all([
        supabase.from("business_hours").select("*").eq("business_id", businessId!).eq("weekday", date.getDay()).maybeSingle(),
        supabase.from("staff_hours").select("*").eq("staff_id", staffId!).eq("weekday", date.getDay()).maybeSingle(),
        supabase.from("bookings").select("id, starts_at, ends_at, status").eq("business_id", businessId!).eq("staff_id", staffId!).gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("blocked_dates").select("starts_at, ends_at, staff_id").eq("business_id", businessId!).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
      ]);
      // Prefer staff hours when present, else fall back to business hours
      const hours = staffHoursR.data ?? bizHoursR.data;
      return { hours, bookings: bookingsR.data ?? [], blocked: blockedR.data ?? [] };
    },
  });

  const slots = useMemo(() => {
    const dayData = dayQuery.data;
    if (!dayData || !service) return [];
    const h: any = dayData.hours;
    if (!h || h.closed || !h.open_time) return [];
    const slotMin = 15;
    const bufBefore = service.buffer_before_min ?? 0;
    const bufAfter = service.buffer_after_min ?? 0;
    const totalMin = service.duration_minutes + bufBefore + bufAfter;
    const [oh, om] = String(h.open_time).split(":").map(Number);
    const [ch, cm] = String(h.close_time).split(":").map(Number);
    const open = new Date(date); open.setHours(oh, om, 0, 0);
    const close = new Date(date); close.setHours(ch, cm, 0, 0);
    const out: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    for (let t = new Date(open); t.getTime() + totalMin * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
      if (t < now) continue;
      const blockStart = new Date(t.getTime() - 0);
      const blockEnd = new Date(t.getTime() + totalMin * 60000);
      const conflict = dayData.bookings.some((b: any) => b.id !== excludeBookingId && new Date(b.starts_at) < blockEnd && new Date(b.ends_at) > blockStart);
      const blocked = dayData.blocked.some((b: any) => (!b.staff_id || b.staff_id === staffId) && new Date(b.starts_at) < blockEnd && new Date(b.ends_at) > blockStart);
      if (!conflict && !blocked) {
        const slotStart = new Date(t.getTime() + bufBefore * 60000);
        out.push({ time: slotStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), iso: slotStart.toISOString(), hour: slotStart.getHours() });
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
