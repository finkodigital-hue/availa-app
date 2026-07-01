import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User as UserIcon,
  Plus,
  XCircle,
  StickyNote,
  Wallet,
  Footprints,
  Globe,
  Sparkle,
  CalendarDays,
  CircleDollarSign,
  Ban,
  CheckCircle2,
  TimerReset,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { signedUrl } from "@/lib/image";
import { fmtMoney, fmtTime, BOOKING_STATUSES, statusMeta, type BookingStatus } from "@/lib/format";
import { paletteFor, initialsOf, type StaffPalette } from "@/lib/staff-colors";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const HOUR_PX = 64;
const SLOT_MIN = 15;
const SLOT_PX = HOUR_PX / (60 / SLOT_MIN);
// Default visible window if a business hasn't configured opening hours yet.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

// Visible-window context derived from each business's opening periods.
const HoursContext = createContext<{ START_HOUR: number; END_HOUR: number }>({
  START_HOUR: DEFAULT_START_HOUR,
  END_HOUR: DEFAULT_END_HOUR,
});
const useHours = () => useContext(HoursContext);



type View = "day" | "week" | "month";

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

  const { data: staff } = useQuery({
    queryKey: ["calendar-staff", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, role, photo_url")
        .eq("business_id", bid!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["calendar", bid, range.start.toISOString(), range.end.toISOString()],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(id, name, color, duration_minutes), staff(id, name, photo_url)")
        .eq("business_id", bid!)
        .gte("starts_at", range.start.toISOString())
        .lt("starts_at", range.end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: blocked } = useQuery({
    queryKey: ["calendar-blocked", bid, range.start.toISOString(), range.end.toISOString()],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_dates")
        .select("*")
        .eq("business_id", bid!)
        .lt("starts_at", range.end.toISOString())
        .gt("ends_at", range.start.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

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
    const duration = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    const prev = { staff_id: b.staff_id, starts_at: b.starts_at, ends_at: b.ends_at };

    qc.setQueryData<any[]>(
      ["calendar", bid, range.start.toISOString(), range.end.toISOString()],
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
        ["calendar", bid, range.start.toISOString(), range.end.toISOString()],
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
            ["calendar", bid, range.start.toISOString(), range.end.toISOString()],
            (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
          );
          await supabase.from("bookings").update(prev).eq("id", bookingId);
          qc.invalidateQueries({ queryKey: ["calendar"] });
        },
      },
    });
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
    <div className="p-3 sm:p-5 md:p-8 max-w-[1800px]">

      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle={title}
        action={
          <Button onClick={() => openNewBooking()} className="h-10 px-4 shadow-glow rounded-full">
            <Plus className="h-4 w-4 mr-1.5" /> New booking
          </Button>
        }
      />

      {view === "day" && (
        <TodayStrip bookings={bookings ?? []} staff={staff ?? []} date={anchor} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 mt-4">
        <div className="inline-flex rounded-full border bg-card p-1 shadow-soft">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-xs rounded-full capitalize transition-all duration-200 ${
                view === v
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 rounded-full"
            onClick={() => {
              const d = new Date(); d.setHours(0, 0, 0, 0);
              setAnchor(d);
            }}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === "day" && (
        <DayView
          staff={staff ?? []}
          bookings={(bookings ?? []).filter((b: any) => b.status !== "cancelled")}
          blocked={blocked ?? []}
          date={anchor}
          isLoading={isLoading}
          onSelect={setSelected}
          onCellClick={(staffId, isoTime) => openNewBooking({ staffId, isoTime, date: anchor })}
          onMove={dropMove}
        />
      )}

      {view === "week" && (
        <WeekView
          bookings={(bookings ?? []).filter((b: any) => b.status !== "cancelled")}
          weekStart={range.start}
          isLoading={isLoading}
          onSelect={setSelected}
          onCellClick={(date, isoTime) => openNewBooking({ isoTime, date })}
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
            {selected && selected.status !== "cancelled" && (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" className="rounded-full">
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

/* ===== Today Summary Strip ===== */

function TodayStrip({ bookings, staff, date }: { bookings: any[]; staff: any[]; date: Date }) {
  const { START_HOUR, END_HOUR } = useHours();
  const isToday = date.toDateString() === new Date().toDateString();
  const active = bookings.filter((b) => b.status !== "cancelled");
  const revenue = active.reduce((sum, b) => sum + (b.price_cents ?? 0), 0);
  const cancellations = bookings.filter((b) => b.status === "cancelled").length;
  const checkins = bookings.filter((b) => ["checked_in", "in_progress", "completed"].includes(b.status)).length;

  // Free time across all staff between START and END
  const totalMinutes = staff.length * (END_HOUR - START_HOUR) * 60;
  const bookedMinutes = active.reduce((sum, b) => sum + Math.max(0, (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000), 0);
  const freeMinutes = Math.max(0, totalMinutes - bookedMinutes);
  const freeHours = (freeMinutes / 60).toFixed(1);

  const cards = [
    { label: isToday ? "Today's revenue" : "Day revenue", value: fmtMoney(revenue), icon: CircleDollarSign, tint: "oklch(0.95 0.05 155)", ink: "oklch(0.35 0.1 155)" },
    { label: "Bookings", value: String(active.length), icon: CalendarDays, tint: "oklch(0.94 0.05 295)", ink: "oklch(0.35 0.13 295)" },
    { label: "Free time", value: `${freeHours}h`, icon: TimerReset, tint: "oklch(0.94 0.04 235)", ink: "oklch(0.32 0.1 235)" },
    { label: "Check-ins", value: String(checkins), icon: CheckCircle2, tint: "oklch(0.95 0.06 95)", ink: "oklch(0.38 0.1 80)" },
    { label: "Cancellations", value: String(cancellations), icon: Ban, tint: "oklch(0.94 0.045 25)", ink: "oklch(0.4 0.13 25)" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="rounded-2xl border bg-card p-3 sm:p-4 shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elegant"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-6 w-6 rounded-full grid place-items-center" style={{ background: c.tint, color: c.ink }}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{c.label}</span>
            </div>
            <div className="mt-2 font-display text-xl sm:text-2xl tabular-nums tracking-tight">{c.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Day View — staff columns ===== */

function DayView({
  staff,
  bookings,
  blocked,
  date,
  isLoading,
  onSelect,
  onCellClick,
  onMove,
}: {
  staff: any[];
  bookings: any[];
  blocked: any[];
  date: Date;
  isLoading: boolean;
  onSelect: (b: any) => void;
  onCellClick: (staffId: string, isoTime: string) => void;
  onMove: (id: string, newStaffId: string, newStart: Date) => void;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const totalH = hours.length * HOUR_PX;

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRaf = useRef<number | null>(null);

  // Auto-scroll near edges of the scroll container
  const handleDragOverContainer = (e: React.DragEvent) => {
    if (!scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const EDGE = 64;
    let dy = 0;
    if (y < EDGE) dy = -Math.ceil((EDGE - y) / 4);
    else if (y > rect.height - EDGE) dy = Math.ceil((y - (rect.height - EDGE)) / 4);
    if (dy !== 0) {
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
      const step = () => {
        scrollRef.current!.scrollTop += dy;
        autoScrollRaf.current = requestAnimationFrame(step);
      };
      autoScrollRaf.current = requestAnimationFrame(step);
    } else if (autoScrollRaf.current) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  };
  const stopAutoScroll = () => {
    if (autoScrollRaf.current) { cancelAnimationFrame(autoScrollRaf.current); autoScrollRaf.current = null; }
  };

  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();
  const nowTop =
    isToday && now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_PX
      : null;

  // Scroll today into view on mount
  useEffect(() => {
    if (nowTop !== null && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date.toDateString(), staff.length]);

  if (isLoading) return <Skeleton className="h-[600px] w-full rounded-3xl" />;
  if (staff.length === 0)
    return (
      <div className="rounded-3xl border border-dashed bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a team member on the Staff page to start scheduling.
      </div>
    );

  const colWidth = "minmax(180px, 1fr)";
  const gridTemplate = `64px repeat(${staff.length}, ${colWidth})`;

  return (
    <div className="rounded-3xl border bg-card overflow-hidden shadow-soft">
      <div
        ref={scrollRef}
        className="overflow-auto max-h-[calc(100vh-280px)] scroll-smooth"
        onDragOver={handleDragOverContainer}
        onDrop={stopAutoScroll}
        onDragEnd={stopAutoScroll}
      >
        <div style={{ minWidth: 64 + staff.length * 180 }}>
          {/* Sticky staff header */}
          <div
            className="grid sticky top-0 z-20 bg-card/85 backdrop-blur-xl border-b"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="bg-muted/30" />
            {staff.map((s) => {
              const palette = paletteFor(s.id);
              return <StaffColumnHeader key={s.id} staff={s} palette={palette} />;
            })}
          </div>

          {/* Body */}
          <div className="grid relative" style={{ gridTemplateColumns: gridTemplate, height: totalH }}>
            {/* Hour gutter */}
            <div className="relative">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="text-[10px] text-muted-foreground/80 text-right pr-2 -mt-1.5 tabular-nums font-medium"
                  style={{ height: HOUR_PX, position: "absolute", top: i * HOUR_PX, right: 0, left: 0 }}
                >
                  {h % 12 || 12}
                  <span className="ml-0.5 opacity-60">{h < 12 ? "AM" : "PM"}</span>
                </div>
              ))}
            </div>

            {staff.map((s) => {
              const palette = paletteFor(s.id);
              return (
                <StaffColumn
                  key={s.id}
                  staff={s}
                  palette={palette}
                  date={date}
                  hours={hours}
                  bookings={bookings.filter((b: any) => b.staff_id === s.id)}
                  blocked={blocked.filter((b: any) => !b.staff_id || b.staff_id === s.id)}
                  onSelect={onSelect}
                  onCellClick={(iso) => onCellClick(s.id, iso)}
                  onDrop={(id, iso) => onMove(id, s.id, new Date(iso))}
                  nowTop={nowTop}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffColumnHeader({ staff, palette }: { staff: any; palette: StaffPalette }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);

  return (
    <div className="border-r last:border-r-0 px-3 py-3.5 flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        {url ? (
          <img
            src={url}
            alt={staff.name}
            className="h-10 w-10 rounded-full object-cover ring-2"
            style={{ ["--tw-ring-color" as any]: palette.border }}
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full grid place-items-center text-[13px] font-semibold ring-2"
            style={{ background: palette.bg, color: palette.ink, ["--tw-ring-color" as any]: palette.border }}
          >
            {initialsOf(staff.name)}
          </div>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-card"
          style={{ background: "oklch(0.68 0.16 155)" }}
          title="Online"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate tracking-tight">{staff.name}</div>
        {staff.role && (
          <div className="text-[11px] text-muted-foreground truncate">{staff.role}</div>
        )}
      </div>
      <span
        className="h-2 w-8 rounded-full shrink-0"
        style={{ background: palette.border }}
        title={palette.name}
      />
    </div>
  );
}

function StaffColumn({
  staff,
  palette,
  date,
  hours,
  bookings,
  blocked,
  onSelect,
  onCellClick,
  onDrop,
  nowTop,
}: {
  staff: any;
  palette: StaffPalette;
  date: Date;
  hours: number[];
  bookings: any[];
  blocked: any[];
  onSelect: (b: any) => void;
  onCellClick: (iso: string) => void;
  onDrop: (bookingId: string, iso: string) => void;
  nowTop: number | null;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const colRef = useRef<HTMLDivElement>(null);
  const [hoverTop, setHoverTop] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: string; origIso: string; durationMin: number; x: number; y: number; newIso: string } | null>(null);

  const yToDate = (y: number) => {
    const minutes = Math.max(0, Math.round(y / SLOT_PX) * SLOT_MIN);
    const d = new Date(date);
    d.setHours(START_HOUR, 0, 0, 0);
    d.setMinutes(d.getMinutes() + minutes);
    return d;
  };

  return (
    <div
      ref={colRef}
      className="relative border-r last:border-r-0"
      onDragOver={(e) => {
        if (!colRef.current) return;
        const rect = colRef.current.getBoundingClientRect();
        e.preventDefault();
        const y = Math.round((e.clientY - rect.top) / SLOT_PX) * SLOT_PX;
        setHoverTop(y);
        setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, newIso: yToDate(y).toISOString() } : d));
      }}
      onDragLeave={() => setHoverTop(null)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/booking-id");
        if (!id || !colRef.current) return;
        const rect = colRef.current.getBoundingClientRect();
        const d = yToDate(e.clientY - rect.top);
        onDrop(id, d.toISOString());
        setHoverTop(null);
        setDrag(null);
      }}
    >
      {/* slot grid — lighter lines, hour separators stronger */}
      {hours.map((_, i) => (
        <div
          key={i}
          className="border-b border-border/40 hover:bg-secondary/30 cursor-pointer transition-colors group"
          style={{ height: HOUR_PX }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = i * HOUR_PX + (e.clientY - rect.top);
            const d = yToDate(y);
            onCellClick(d.toISOString());
          }}
        >
          {/* half-hour subtle line */}
          <div className="h-1/2 border-b border-dashed border-border/25" />
        </div>
      ))}

      {/* blocked overlays */}
      {blocked.map((b: any) => {
        const bs = new Date(b.starts_at);
        const be = new Date(b.ends_at);
        const dayStart = new Date(date); dayStart.setHours(START_HOUR, 0, 0, 0);
        const dayEnd = new Date(date); dayEnd.setHours(END_HOUR, 0, 0, 0);
        const s = bs < dayStart ? dayStart : bs;
        const e = be > dayEnd ? dayEnd : be;
        if (e <= s) return null;
        const top = ((s.getTime() - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
        const height = ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_PX;
        return (
          <div
            key={b.id}
            className="absolute left-1 right-1 rounded-xl bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,oklch(0_0_0/0.05)_6px,oklch(0_0_0/0.05)_12px)] border border-dashed border-foreground/15 pointer-events-none"
            style={{ top, height }}
            title={b.title || b.reason || "Time off"}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pt-1">
              {b.title || b.kind || "Time off"}
            </div>
          </div>
        );
      })}

      {/* now line */}
      {nowTop !== null && (
        <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
          <div className="h-px relative" style={{ background: "oklch(0.6 0.2 25)" }}>
            <div
              className="absolute -left-1 -top-1 h-2 w-2 rounded-full animate-pulse-ring"
              style={{ background: "oklch(0.6 0.2 25)" }}
            />
          </div>
        </div>
      )}

      {/* drop preview */}
      {hoverTop !== null && (
        <div
          className="absolute left-1 right-1 rounded-xl pointer-events-none"
          style={{
            top: hoverTop,
            height: 4 * SLOT_PX,
            background: `color-mix(in oklab, ${palette.border} 30%, transparent)`,
            border: `1.5px dashed ${palette.border}`,
          }}
        />
      )}

      {/* bookings */}
      {bookings.map((b: any) => (
        <BookingCard
          key={b.id}
          b={b}
          palette={palette}
          date={date}
          onSelect={onSelect}
          onDragInfo={setDrag}
        />
      ))}

      {/* floating drag tooltip */}
      {drag && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-xl bg-foreground text-background text-[11px] shadow-elegant"
          style={{ left: drag.x + 16, top: drag.y + 12 }}
        >
          <div className="font-medium">{(bookings.find((x) => x.id === drag.id) || {}).customer_name || "Booking"}</div>
          <div className="opacity-80 tabular-nums">
            {fmtTime(drag.origIso)} → {fmtTime(drag.newIso)}
          </div>
          <div className="opacity-60 tabular-nums">{drag.durationMin} min</div>
        </div>
      )}
    </div>
  );
}

function BookingCard({
  b,
  palette,
  date,
  onSelect,
  onDragInfo,
}: {
  b: any;
  palette: StaffPalette;
  date: Date;
  onSelect: (b: any) => void;
  onDragInfo: (d: { id: string; origIso: string; durationMin: number; x: number; y: number; newIso: string } | null) => void;
}) {
  const { START_HOUR } = useHours();
  const [dragging, setDragging] = useState(false);
  const s = new Date(b.starts_at);
  const e = new Date(b.ends_at);
  const dayStart = new Date(date); dayStart.setHours(START_HOUR, 0, 0, 0);
  const top = ((s.getTime() - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
  const height = Math.max(34, ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_PX);
  const durationMin = Math.round((e.getTime() - s.getTime()) / 60000);

  const status = statusMeta(b.status);
  const depositPaid = (b.amount_paid_cents ?? 0) > 0;
  const isWalkin = b.source === "walkin";
  const isOnline = b.source === "online" || b.source === "booking";
  const hasNotes = !!(b.notes && String(b.notes).trim().length);
  // simple VIP heuristic
  const isVip = !!b.is_vip;

  return (
    <button
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/booking-id", b.id);
        ev.dataTransfer.effectAllowed = "move";
        setDragging(true);
        onDragInfo({ id: b.id, origIso: b.starts_at, durationMin, x: ev.clientX, y: ev.clientY, newIso: b.starts_at });
      }}
      onDragEnd={() => { setDragging(false); onDragInfo(null); }}
      onClick={(ev) => { ev.stopPropagation(); onSelect(b); }}
      className={`absolute left-1.5 right-1.5 rounded-2xl text-left overflow-hidden drag-lift shadow-soft hover:shadow-elegant hover:-translate-y-0.5 active:scale-[0.99] drop-snap ${dragging ? "is-dragging" : ""}`}
      style={{
        top,
        height,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.ink,
      }}
    >
      {/* Left status accent bar */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ background: status.color }}
      />
      {/* Faded placeholder when dragging */}
      {dragging && (
        <span className="absolute inset-0 rounded-2xl border-2 border-dashed border-foreground/15 bg-card/60" />
      )}
      <div className="relative px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-[12px] font-semibold truncate flex-1" style={{ color: palette.ink }}>
            {b.customer_name || "—"}
          </div>
          {isVip && <Sparkle className="h-3 w-3 shrink-0" style={{ color: palette.ink }} />}
        </div>
        {height >= 44 && (
          <div className="text-[11px] truncate opacity-80">{b.services?.name}</div>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] tabular-nums opacity-75">{fmtTime(b.starts_at)}</span>
          {b.price_cents > 0 && height >= 56 && (
            <span className="text-[10px] tabular-nums opacity-60">· {fmtMoney(b.price_cents)}</span>
          )}
          <span className="ml-auto flex items-center gap-1 opacity-80">
            {depositPaid && <Wallet className="h-3 w-3" />}
            {isWalkin && <Footprints className="h-3 w-3" />}
            {isOnline && !isWalkin && <Globe className="h-3 w-3" />}
            {hasNotes && <StickyNote className="h-3 w-3" />}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ===== Week View ===== */

function WeekView({
  bookings,
  weekStart,
  isLoading,
  onSelect,
  onCellClick,
}: {
  bookings: any[];
  weekStart: Date;
  isLoading: boolean;
  onSelect: (b: any) => void;
  onCellClick: (date: Date, isoTime: string) => void;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);


  if (isLoading) return <Skeleton className="h-[600px] w-full rounded-3xl" />;

  return (
    <div className="rounded-3xl border bg-card overflow-hidden shadow-soft">
      <div
        className="overflow-auto max-h-[calc(100vh-260px)] scroll-smooth"
      >
        <div className="min-w-[760px]">
          <div className="grid sticky top-0 z-20 bg-card/85 backdrop-blur-xl border-b" style={{ gridTemplateColumns: "64px repeat(7, minmax(96px, 1fr))" }}>
            <div className="border-r bg-muted/30 py-2" />
            {days.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={d.toISOString()} className={`py-3 text-center text-xs border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}>
                  <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    {d.toLocaleDateString([], { weekday: "short" })}
                  </div>
                  <div
                    className={`mt-1 mx-auto h-8 w-8 grid place-items-center rounded-full font-display text-base tabular-nums ${
                      isToday ? "bg-primary text-primary-foreground shadow-glow" : ""
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid relative" style={{ gridTemplateColumns: "64px repeat(7, minmax(96px, 1fr))" }}>
            <div className="border-r">
              {hours.map((h) => (
                <div key={h} className="text-[10px] text-muted-foreground/80 text-right pr-2 -mt-1.5 tabular-nums font-medium" style={{ height: HOUR_PX }}>
                  {h % 12 || 12}
                  <span className="ml-0.5 opacity-60">{h < 12 ? "AM" : "PM"}</span>
                </div>
              ))}
            </div>
            {days.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString();
              const dayBookings = bookings.filter((b: any) => new Date(b.starts_at).toDateString() === d.toDateString());
              return (
                <div key={d.toISOString()} className={`relative border-r last:border-r-0 ${isToday ? "bg-primary/[0.025]" : ""}`}>
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="border-b border-border/40 hover:bg-secondary/30 cursor-pointer"
                      style={{ height: HOUR_PX }}
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const minutes = Math.round((e.clientY - rect.top) / SLOT_PX) * SLOT_MIN;
                        const t = new Date(d);
                        t.setHours(START_HOUR + i, 0, 0, 0);
                        t.setMinutes(t.getMinutes() + minutes);
                        onCellClick(d, t.toISOString());
                      }}
                    >
                      <div className="h-1/2 border-b border-dashed border-border/25" />
                    </div>
                  ))}
                  {dayBookings.map((b: any) => {
                    const s = new Date(b.starts_at);
                    const e = new Date(b.ends_at);
                    const top = (s.getHours() - START_HOUR + s.getMinutes() / 60) * HOUR_PX;
                    const height = Math.max(28, ((e.getTime() - s.getTime()) / 3600000) * HOUR_PX);
                    const palette = paletteFor(b.staff_id);
                    const isCustom = !!b.is_custom;
                    const bg = isCustom ? `color-mix(in oklab, ${b.custom_color || "#a78bfa"} 22%, white)` : palette.bg;
                    const border = isCustom ? b.custom_color || "#a78bfa" : palette.border;
                    return (
                      <button
                        key={b.id}
                        onClick={(ev) => { ev.stopPropagation(); onSelect(b); }}
                        className="absolute left-1 right-1 rounded-xl px-1.5 py-1 text-left overflow-hidden shadow-soft hover:shadow-elegant hover:-translate-y-0.5 transition-all"
                        style={{
                          top, height,
                          background: bg,
                          border: `1.5px ${isCustom ? "dashed" : "solid"} ${border}`,
                          color: palette.ink,
                        }}
                      >
                        <div className="text-[11px] font-semibold truncate flex items-center gap-1">
                          {isCustom && <span className="text-[9px] uppercase tracking-wider bg-black/10 rounded px-1">Custom</span>}
                          {isCustom ? (b.custom_title || "Blocked") : b.customer_name}
                        </div>
                        {!isCustom && <div className="text-[10px] truncate opacity-80">{b.services?.name}</div>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Month View ===== */

function MonthView({
  bookings,
  monthStart,
  onSelect,
  onDayClick,
}: {
  bookings: any[];
  monthStart: Date;
  onSelect: (b: any) => void;
  onDayClick: (date: Date) => void;
}) {
  const firstDayOfWeek = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(monthStart); d.setDate(d.getDate() - (i + 1));
    cells.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), i), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last); d.setDate(d.getDate() + 1);
    cells.push({ date: d, inMonth: false });
  }

  const byDay = new Map<string, any[]>();
  bookings.forEach((b: any) => {
    const k = new Date(b.starts_at).toDateString();
    const arr = byDay.get(k) ?? []; arr.push(b); byDay.set(k, arr);
  });

  return (
    <div className="rounded-3xl border bg-card overflow-hidden shadow-soft">
      <div className="grid grid-cols-7 border-b bg-muted/20">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-muted-foreground py-2.5 text-center font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const dayBookings = byDay.get(c.date.toDateString()) ?? [];
          const isToday = c.date.toDateString() === new Date().toDateString();
          return (
            <div
              key={i}
              className={`min-h-[118px] p-2 border-b border-r last:border-r-0 ${
                c.inMonth ? "" : "bg-muted/20 text-muted-foreground"
              } ${isToday ? "bg-primary/[0.04]" : ""} hover:bg-secondary/40 transition-colors cursor-pointer`}
              onClick={() => onDayClick(c.date)}
            >
              <div
                className={`text-xs tabular-nums inline-grid place-items-center h-7 w-7 rounded-full font-medium ${
                  isToday ? "bg-primary text-primary-foreground shadow-glow" : ""
                }`}
              >
                {c.date.getDate()}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {dayBookings.slice(0, 3).map((b: any) => {
                  const palette = paletteFor(b.staff_id);
                  return (
                    <button
                      key={b.id}
                      onClick={(e) => { e.stopPropagation(); onSelect(b); }}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded-lg truncate transition-transform hover:translate-x-0.5"
                      style={{
                        background: palette.bg,
                        border: `1px solid ${palette.border}`,
                        color: palette.ink,
                      }}
                    >
                      {fmtTime(b.starts_at)} · {b.customer_name}
                    </button>
                  );
                })}
                {dayBookings.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">+{dayBookings.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
