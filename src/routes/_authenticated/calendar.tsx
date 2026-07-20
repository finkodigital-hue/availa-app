import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  User as UserIcon,
  Plus,
  XCircle,
  Package,
  ChevronDown,
  CreditCard,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { startBalanceCheckout } from "@/lib/stripe-connect.functions";
import { fmtMoney, fmtTime, BOOKING_STATUSES, statusMeta, type BookingStatus } from "@/lib/format";
import { resolveDayPeriods, isMinuteWithinPeriods, type DayPeriod } from "@/lib/staff-hours";
import {
  HoursContext,
  DEFAULT_START_HOUR,
  DEFAULT_END_HOUR,
  SLOT_MIN,
  type View,
  CalendarToolbar,
  TodayStrip,
  DayView,
  WeekView,
  MonthView,
} from "@/components/calendar";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function CalendarPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();

  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selected, setSelected] = useState<any | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ staffId?: string; date?: Date; isoTime?: string } | undefined>(undefined);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const collectBalance = async () => {
    if (!selected) return;
    try {
      const { checkoutUrl } = await startBalanceCheckout({ data: { bookingId: selected.id } });
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      toast.success("Balance checkout opened in a new tab.");
    } catch (error: any) {
      toast.error(error.message ?? "Could not start the balance payment.");
    }
  };

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === calendarRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await calendarRef.current?.requestFullscreen();
    } catch {
      toast.error("Full screen isn't available in this browser.");
    }
  };

  const range = useMemo(() => {
    if (view === "day") {
      const s = new Date(anchor); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setDate(e.getDate() + 1);
      return { start: s, end: e };
    }
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = new Date(s); e.setDate(e.getDate() + 7);
      return { start: s, end: e };
    }
    const s = startOfMonth(anchor);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { start: s, end: e };
  }, [anchor, view]);

  // Load business IDs whose staff/bookings should appear on this salon's
  // shared calendar: the salon itself + every actively linked independent
  // professional whose permissions allow calendar visibility.
  const { data: linkedPros } = useQuery({
    queryKey: ["calendar-linked-pros", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_professionals")
        .select("pro_business_id, chair_label, permissions")
        .eq("salon_business_id", bid!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).filter(
        (r: any) => (r.permissions?.salon_can_view_calendar ?? true) !== false,
      ) as { pro_business_id: string; chair_label: string | null }[];
    },
  });

  const linkedProBusinessIds = useMemo(() => (linkedPros ?? []).map((p) => p.pro_business_id), [linkedPros]);
  const chairLabelByBizId = useMemo(
    () => new Map((linkedPros ?? []).map((p) => [p.pro_business_id, p.chair_label])),
    [linkedPros],
  );

  const allBizIds = useMemo(
    () => (bid ? [bid, ...linkedProBusinessIds] : []),
    [bid, linkedProBusinessIds],
  );
  const linkedBizKey = linkedProBusinessIds.join(",");
  const calendarQueryKey = useMemo(
    () => ["calendar", bid, linkedBizKey, range.start.toISOString(), range.end.toISOString()],
    [bid, linkedBizKey, range.start, range.end],
  );

  const { data: staff } = useQuery({
    queryKey: ["calendar-staff", bid, linkedBizKey],
    enabled: !!bid && linkedPros !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, role, photo_url, business_id")
        .in("business_id", allBizIds)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        is_independent: s.business_id !== bid,
        chair_label: chairLabelByBizId.get(s.business_id) ?? null,
      }));
    },
  });

  const { data: bookings, isLoading } = useQuery({
    queryKey: calendarQueryKey,
    enabled: !!bid && linkedPros !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(id, name, color, duration_minutes), staff(id, name, photo_url, business_id)")
        .in("business_id", allBizIds)
        .gte("starts_at", range.start.toISOString())
        .lt("starts_at", range.end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocked } = useQuery({
    queryKey: ["calendar-blocked", bid, linkedBizKey, range.start.toISOString(), range.end.toISOString()],
    enabled: !!bid && linkedPros !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_dates")
        .select("*")
        .in("business_id", allBizIds)
        .lt("starts_at", range.end.toISOString())
        .gt("ends_at", range.start.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // Day view renders one column per staff member here. `staff` above is
  // active-only (correct for "who can take a new booking today"), but an
  // inactive/archived team member's existing bookings must stay visible —
  // so add a read-only column for anyone with a booking in view who isn't
  // already in the active list. New-booking clicks are disabled on those
  // columns (see StaffColumn/_readOnly below); existing bookings remain
  // fully viewable and editable.
  const dayViewStaff = useMemo(() => {
    const byId = new Map((staff ?? []).map((s: any) => [s.id, s]));
    for (const b of bookings ?? []) {
      if (b.status === "cancelled" || !b.staff || byId.has(b.staff.id)) continue;
      byId.set(b.staff.id, {
        ...b.staff,
        is_independent: b.business_id !== bid,
        chair_label: chairLabelByBizId.get(b.business_id) ?? null,
        _readOnly: true,
      });
    }
    return [...byId.values()];
  }, [staff, bookings, bid, chairLabelByBizId]);

  // Day-view-only: resolve each visible staff member's working periods for
  // the anchor date, so their column can show they're not working (day off,
  // or outside their hours) instead of looking bookable when they aren't.
  // Only fetched for the Day view since Week/Month pool bookings by date,
  // not by staff column.
  const dayWeekday = anchor.getDay();
  const dayStaffIds = useMemo(() => dayViewStaff.map((s: any) => s.id), [dayViewStaff]);
  const dayStaffIdsKey = dayStaffIds.join(",");
  const dayBizIdsKey = allBizIds.join(",");

  const { data: dayStaffHours } = useQuery({
    queryKey: ["calendar-day-staff-hours", dayStaffIdsKey, dayWeekday],
    enabled: view === "day" && dayStaffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_hours")
        .select("staff_id, closed, open_time, close_time")
        .in("staff_id", dayStaffIds)
        .eq("weekday", dayWeekday);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: dayBizPeriods } = useQuery({
    queryKey: ["calendar-day-biz-periods", dayBizIdsKey, dayWeekday],
    enabled: view === "day" && allBizIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hour_periods")
        .select("business_id, open_time, close_time")
        .in("business_id", allBizIds)
        .eq("weekday", dayWeekday);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: dayBizHours } = useQuery({
    queryKey: ["calendar-day-biz-hours", dayBizIdsKey, dayWeekday],
    enabled: view === "day" && allBizIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hours")
        .select("business_id, closed, open_time, close_time")
        .in("business_id", allBizIds)
        .eq("weekday", dayWeekday);
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffAvailability = useMemo(() => {
    const map = new Map<string, { periods: DayPeriod[]; dayOff: boolean }>();
    if (view !== "day") return map;
    const staffHoursByStaff = new Map((dayStaffHours ?? []).map((r: any) => [r.staff_id, r]));
    const bizPeriodsByBiz = new Map<string, DayPeriod[]>();
    for (const p of dayBizPeriods ?? []) {
      const list = bizPeriodsByBiz.get((p as any).business_id) ?? [];
      list.push({ open_time: (p as any).open_time, close_time: (p as any).close_time });
      bizPeriodsByBiz.set((p as any).business_id, list);
    }
    const bizHoursByBiz = new Map((dayBizHours ?? []).map((r: any) => [r.business_id, r]));
    for (const s of dayViewStaff) {
      const periods = resolveDayPeriods({
        weekday: dayWeekday,
        staffHours: staffHoursByStaff.get(s.id) as any,
        bizPeriods: bizPeriodsByBiz.get(s.business_id) ?? [],
        bizHours: bizHoursByBiz.get(s.business_id) as any,
      });
      map.set(s.id, { periods, dayOff: periods.length === 0 });
    }
    return map;
  }, [view, dayStaffHours, dayBizPeriods, dayBizHours, dayViewStaff, dayWeekday]);

  // Shared guard for moves/resizes landing outside a staff member's working
  // hours or on top of a time-off block — the Day view grid already blocks
  // these interactions visually, but drag/resize can still commit a change
  // that bypasses the cell click handler, so re-check here too.
  const isMoveAllowed = (staffId: string, newStart: Date, newEnd: Date) => {
    const avail = staffAvailability.get(staffId);
    if (avail) {
      const startMin = newStart.getHours() * 60 + newStart.getMinutes();
      const endMin = startMin + Math.round((newEnd.getTime() - newStart.getTime()) / 60000);
      if (!isMinuteWithinPeriods(avail.periods, startMin) || !isMinuteWithinPeriods(avail.periods, Math.max(startMin, endMin - 1))) {
        return false;
      }
    }
    const overlapsBlock = (blocked ?? []).some(
      (b: any) => (!b.staff_id || b.staff_id === staffId) && new Date(b.starts_at) < newEnd && new Date(b.ends_at) > newStart,
    );
    return !overlapsBlock;
  };

  const setStatus = async (id: string, status: BookingStatus) => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${statusMeta(status).label}`);
    setSelected((s: any) => (s && s.id === id ? { ...s, status } : s));
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const openNewBooking = (cell?: { staffId?: string; isoTime?: string; date?: Date }) => {
    setPrefill(cell);
    setNewOpen(true);
  };

  // Global trigger from the mobile bottom nav floating "+" button, and from
  // ?new=1 deep links (navigating to /calendar from elsewhere).
  useEffect(() => {
    const handler = () => openNewBooking();
    window.addEventListener("luma:new-booking", handler as EventListener);
    if (typeof window !== "undefined" && window.location.search.includes("new=1")) {
      handler();
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.toString());
    }
    return () => window.removeEventListener("luma:new-booking", handler as EventListener);
  }, []);

  const dropMove = async (bookingId: string, newStaffId: string, newStart: Date) => {
    const b = (bookings ?? []).find((x: any) => x.id === bookingId);
    if (!b) return;
    const destinationStaff = (staff ?? []).find((x: any) => x.id === newStaffId);
    if (destinationStaff?.business_id && b.business_id && destinationStaff.business_id !== b.business_id) {
      toast.error("Move this booking within the same business calendar.");
      return;
    }
    const duration = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    if (!isMoveAllowed(newStaffId, newStart, newEnd)) {
      toast.error(`${destinationStaff?.name ?? "This staff member"} isn't working then.`);
      return;
    }
    const prev = { staff_id: b.staff_id, starts_at: b.starts_at, ends_at: b.ends_at };

    qc.setQueryData<any[]>(
      calendarQueryKey,
      (old) =>
        old?.map((x: any) =>
          x.id === bookingId ? { ...x, staff_id: newStaffId, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() } : x,
        ) ?? [],
    );

    const { error } = await supabase
      .from("bookings")
      .update({ staff_id: newStaffId, starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() })
      .eq("id", bookingId);

    if (error) {
      qc.setQueryData<any[]>(
        calendarQueryKey,
        (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
      );
      toast.error(error.message);
      return;
    }

    // Haptic on mobile
    try { (navigator as any).vibrate?.(12); } catch {}

    toast.success("Booking moved", {
      description: `${fmtTime(prev.starts_at)} → ${fmtTime(newStart.toISOString())}`,
      action: {
        label: "Undo",
        onClick: async () => {
          qc.setQueryData<any[]>(
            calendarQueryKey,
            (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
          );
          await supabase.from("bookings").update(prev).eq("id", bookingId);
          qc.invalidateQueries({ queryKey: ["calendar"] });
        },
      },
    });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const resizeBooking = async (bookingId: string, edge: "start" | "end", newIso: string) => {
    const b = (bookings ?? []).find((x: any) => x.id === bookingId);
    if (!b) return;
    const prev = { starts_at: b.starts_at, ends_at: b.ends_at };
    const next = edge === "start" ? { starts_at: newIso, ends_at: b.ends_at } : { starts_at: b.starts_at, ends_at: newIso };
    if (new Date(next.ends_at).getTime() - new Date(next.starts_at).getTime() < SLOT_MIN * 60000) return;
    if (!isMoveAllowed(b.staff_id, new Date(next.starts_at), new Date(next.ends_at))) {
      toast.error("Outside working hours.");
      return;
    }

    qc.setQueryData<any[]>(
      calendarQueryKey,
      (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...next } : x)) ?? [],
    );

    const { error } = await supabase.from("bookings").update(next).eq("id", bookingId);

    if (error) {
      qc.setQueryData<any[]>(
        calendarQueryKey,
        (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
      );
      toast.error(error.message);
      return;
    }

    try { (navigator as any).vibrate?.(10); } catch {}

    toast.success("Booking resized", {
      description: `${fmtTime(next.starts_at)} – ${fmtTime(next.ends_at)}`,
      action: {
        label: "Undo",
        onClick: async () => {
          qc.setQueryData<any[]>(
            calendarQueryKey,
            (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
          );
          await supabase.from("bookings").update(prev).eq("id", bookingId);
          qc.invalidateQueries({ queryKey: ["calendar"] });
        },
      },
    });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const title = (() => {
    if (view === "day") return anchor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    if (view === "week") {
      const e = new Date(range.start); e.setDate(e.getDate() + 6);
      return `${range.start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${e.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  })();

  const navigate = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  };

  // Derive visible-hours window from this business's opening periods.
  const { data: periods } = useQuery({
    queryKey: ["business-hour-periods", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hour_periods")
        .select("open_time, close_time")
        .eq("business_id", bid!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const hoursWindow = useMemo(() => {
    if (!periods || !periods.length) return { START_HOUR: DEFAULT_START_HOUR, END_HOUR: DEFAULT_END_HOUR };
    let minH = 23, maxH = 0;
    for (const p of periods) {
      const [oh] = String(p.open_time).split(":").map(Number);
      const [ch, cm] = String(p.close_time).split(":").map(Number);
      minH = Math.min(minH, oh);
      maxH = Math.max(maxH, ch + (cm > 0 ? 1 : 0));
    }
    // pad slightly so drag/drop near edges feels natural
    return { START_HOUR: Math.max(0, minH), END_HOUR: Math.min(24, Math.max(maxH, minH + 1)) };
  }, [periods]);

  return (
    <HoursContext.Provider value={hoursWindow}>
    <div ref={calendarRef} className={`p-3 sm:p-5 md:p-8 max-w-[1800px] ${isFullscreen ? "h-[100dvh] max-w-none overflow-hidden bg-background" : ""}`}>

      {!isFullscreen && (
        <PageHeader
          eyebrow="Schedule"
          title="Calendar"
          subtitle="View and manage your team's bookings."
          action={
            <Button onClick={() => openNewBooking()} className="h-10 px-4 shadow-glow">
              <Plus className="h-4 w-4 mr-1.5" /> New booking
            </Button>
          }
        />
      )}

      {!isFullscreen && view === "day" && (
        <TodayStrip bookings={bookings ?? []} staff={staff ?? []} date={anchor} />
      )}

      <CalendarToolbar
        view={view}
        onViewChange={setView}
        anchor={anchor}
        title={title}
        onToday={goToToday}
        onNavigate={navigate}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {view === "day" && (
        <DayView
          staff={dayViewStaff}
          availability={staffAvailability}
          bookings={(bookings ?? []).filter((b: any) => b.status !== "cancelled")}
          blocked={blocked ?? []}
          date={anchor}
          isLoading={isLoading}
          onSelect={setSelected}
          onCellClick={(staffId, isoTime) => openNewBooking({ staffId, isoTime, date: anchor })}
          onMove={dropMove}
          onResize={resizeBooking}
          fullscreen={isFullscreen}
        />
      )}

      {view === "week" && (
        <WeekView
          bookings={(bookings ?? []).filter((b: any) => b.status !== "cancelled")}
          weekStart={range.start}
          isLoading={isLoading}
          onSelect={setSelected}
          onCellClick={(date, isoTime) => openNewBooking({ isoTime, date })}
          fullscreen={isFullscreen}
        />
      )}

      {view === "month" && (
        <MonthView
          bookings={(bookings ?? []).filter((b: any) => b.status !== "cancelled")}
          monthStart={range.start}
          onSelect={setSelected}
          onDayClick={(date) => { setAnchor(date); setView("day"); }}
        />
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{selected?.customer_name}</DialogTitle>
            <DialogDescription>
              {selected && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Clock className="h-3 w-3" />
                  {new Date(selected.starts_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {fmtTime(selected.starts_at)} – {fmtTime(selected.ends_at)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <DetailRow label="Service" value={selected.services?.name} />
              <DetailRow
                label="With"
                value={
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {selected.staff?.name}
                  </span>
                }
              />
              <DetailRow label="Contact" value={selected.customer_email || selected.customer_phone || "—"} />
              <DetailRow label="Price" value={fmtMoney(selected.price_cents ?? 0)} />
              <DetailRow label="Paid" value={fmtMoney(selected.amount_paid_cents ?? 0)} />
              <DetailRow label="Balance" value={fmtMoney(Math.max(0, (selected.price_cents ?? 0) - (selected.amount_paid_cents ?? 0)))} />
              <DetailRow
                label="Status"
                value={
                  <Badge
                    variant="outline"
                    className="capitalize"
                    style={{
                      background: statusMeta(selected.status).tint,
                      color: statusMeta(selected.status).color,
                      borderColor: statusMeta(selected.status).color,
                    }}
                  >
                    {statusMeta(selected.status).label}
                  </Badge>
                }
              />
              {selected.source === "walkin" && (
                <DetailRow label="Source" value={<Badge variant="secondary">Walk-in</Badge>} />
              )}
              {selected.notes && (
                <div className="pt-2 mt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm text-pretty">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
          {selected && selected.status === "completed" && (
            <StockUsedPanel bookingId={selected.id} />
          )}
          {selected && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Change status</div>
              <div className="grid grid-cols-3 gap-1.5">
                {BOOKING_STATUSES.map((s) => {
                  const on = selected.status === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStatus(selected.id, s.id)}
                      className={`text-xs rounded-xl border px-2 py-1.5 transition-all ${on ? "ring-2 ring-offset-1 ring-offset-background font-medium" : "hover:bg-secondary/60"}`}
                      style={
                        on
                          ? { background: s.tint, color: s.color, borderColor: s.color, ["--tw-ring-color" as any]: s.color }
                          : { borderColor: "var(--color-border)" }
                      }
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle" style={{ background: s.color }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {selected && selected.business_id === bid && selected.payment_status !== "paid" && (selected.price_cents ?? 0) > (selected.amount_paid_cents ?? 0) && (
              <Button onClick={collectBalance}>
                <CreditCard className="h-4 w-4 mr-1.5" /> Take remaining payment
              </Button>
            )}
            {selected && selected.status !== "cancelled" && (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive">
                    <XCircle className="h-4 w-4 mr-1.5" /> Cancel booking
                  </Button>
                }
                title="Cancel this booking?"
                description="The customer will be notified if reminders are enabled."
                confirmLabel="Cancel booking"
                onConfirm={async () => { await setStatus(selected.id, "cancelled"); setSelected(null); }}
              />
            )}
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bid && (
        <NewBookingDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          businessId={bid}
          prefill={prefill}
          onCreated={() => qc.invalidateQueries({ queryKey: ["calendar"] })}
        />
      )}
    </div>
    </HoursContext.Provider>
  );
}


function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium text-sm text-right">{value}</span>
    </div>
  );
}

type StockDeduction = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  inventory_items: { name: string; unit: string | null } | null;
};

function StockUsedPanel({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: deductions, isLoading, error } = useQuery({
    queryKey: ["booking-stock-deductions", bookingId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_stock_deductions")
        .select("id, inventory_item_id, quantity, inventory_items(name, unit)")
        .eq("booking_id", bookingId);
      if (error) throw error;
      return data as unknown as StockDeduction[];
    },
  });

  const migrationMissing = /schema cache|could not find the table/i.test((error as any)?.message ?? "");

  const save = async (d: StockDeduction) => {
    const raw = drafts[d.id];
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (next === Number(d.quantity)) return;
    setSavingId(d.id);
    const { error } = await supabase.rpc("adjust_booking_stock_deduction", {
      p_deduction_id: d.id,
      p_new_quantity: next,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stock usage updated");
    qc.invalidateQueries({ queryKey: ["booking-stock-deductions", bookingId] });
    qc.invalidateQueries({ queryKey: ["inventory_items"] });
  };

  if (migrationMissing) {
    return (
      <div className="rounded-2xl border border-dashed bg-secondary/40 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
        <Package className="h-3.5 w-3.5 shrink-0" />
        Apply the database migration to enable stock tracking on completed bookings.
      </div>
    );
  }

  if (error) return null;
  if (!isLoading && (!deductions || deductions.length === 0)) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border bg-secondary/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-sm"
        >
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            Stock used{deductions ? ` (${deductions.length} item${deductions.length === 1 ? "" : "s"})` : ""}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-2">
        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          (deductions ?? []).map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm truncate">{d.inventory_items?.name ?? "Item"}</span>
              <Input
                type="number"
                className="w-20 h-8"
                value={drafts[d.id] ?? String(Number(d.quantity))}
                onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: e.target.value }))}
                onBlur={() => save(d)}
                disabled={savingId === d.id}
              />
              <span className="text-xs text-muted-foreground w-10">{d.inventory_items?.unit || ""}</span>
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
