import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAvailableSlots(opts: {
  businessId: string | undefined;
  staffId: string | undefined;
  durationMin: number | undefined;
  date: Date;
  excludeBookingId?: string;
}) {
  const { businessId, staffId, durationMin, date, excludeBookingId } = opts;
  const dateKey = date.toDateString();

  const dayQuery = useQuery({
    queryKey: ["slots-day", businessId, staffId, dateKey],
    enabled: !!businessId && !!staffId,
    queryFn: async () => {
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      const [hoursR, bookingsR, blockedR] = await Promise.all([
        supabase.from("business_hours").select("*").eq("business_id", businessId!).eq("weekday", date.getDay()).maybeSingle(),
        supabase.from("bookings").select("id, starts_at, ends_at, status").eq("business_id", businessId!).eq("staff_id", staffId!).gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("blocked_dates").select("starts_at, ends_at, staff_id").eq("business_id", businessId!).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
      ]);
      return { hours: hoursR.data, bookings: bookingsR.data ?? [], blocked: blockedR.data ?? [] };
    },
  });

  const slots = useMemo(() => {
    const dayData = dayQuery.data;
    if (!dayData || !durationMin) return [];
    if (!dayData.hours || dayData.hours.closed || !dayData.hours.open_time) return [];
    const slotMin = 30;
    const [oh, om] = dayData.hours.open_time.split(":").map(Number);
    const [ch, cm] = dayData.hours.close_time!.split(":").map(Number);
    const open = new Date(date); open.setHours(oh, om, 0, 0);
    const close = new Date(date); close.setHours(ch, cm, 0, 0);
    const out: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    for (let t = new Date(open); t.getTime() + durationMin * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
      if (t < now) continue;
      const slotEnd = new Date(t.getTime() + durationMin * 60000);
      const conflict = dayData.bookings.some((b: any) => b.id !== excludeBookingId && new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      const blocked = dayData.blocked.some((b: any) => (!b.staff_id || b.staff_id === staffId) && new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      if (!conflict && !blocked) out.push({ time: t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), iso: t.toISOString(), hour: t.getHours() });
    }
    return out;
  }, [dayQuery.data, durationMin, date, staffId, excludeBookingId]);

  return { slots, isLoading: dayQuery.isLoading };
}

export function buildDateStrip(days = 14): Date[] {
  const arr: Date[] = [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); arr.push(d); }
  return arr;
}
