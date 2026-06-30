import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  CheckCircle2,
  XCircle,
  UserX,
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
import { fmtMoney, fmtTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const HOUR_PX = 60;
const SLOT_MIN = 15;
const SLOT_PX = HOUR_PX / (60 / SLOT_MIN); // 15px per 15 min
const START_HOUR = 7;
const END_HOUR = 22;

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

  // Range to query
  const range = useMemo(() => {
    if (view === "day") {
      const s = new Date(anchor);
      s.setHours(0, 0, 0, 0);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return { start: s, end: e };
    }
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = new Date(s);
      e.setDate(e.getDate() + 7);
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

  const setStatus = async (id: string, status: "completed" | "cancelled" | "no_show") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(
      status === "completed" ? "Marked complete" : status === "cancelled" ? "Booking cancelled" : "Marked no-show",
    );
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  const openNewBooking = (cell?: { staffId?: string; isoTime?: string; date?: Date }) => {
    setPrefill(cell);
    setNewOpen(true);
  };

  // Drag drop
  const dropMove = async (bookingId: string, newStaffId: string, newStart: Date) => {
    const b = (bookings ?? []).find((x: any) => x.id === bookingId);
    if (!b) return;
    const duration = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    const prev = { staff_id: b.staff_id, starts_at: b.starts_at, ends_at: b.ends_at };
    // optimistic
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
      // rollback
      qc.setQueryData<any[]>(
        ["calendar", bid, range.start.toISOString(), range.end.toISOString()],
        (old) => old?.map((x: any) => (x.id === bookingId ? { ...x, ...prev } : x)) ?? [],
      );
      toast.error(error.message);
    } else {
      toast.success("Booking moved");
    }
  };

  const title = (() => {
    if (view === "day") return anchor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    if (view === "week") {
      const e = new Date(range.start);
      e.setDate(e.getDate() + 6);
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

  return (
    <div className="p-3 sm:p-5 md:p-8 max-w-[1800px]">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle={title}
        action={
          <Button onClick={() => openNewBooking()} className="h-9 shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> New booking
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="inline-flex rounded-xl border bg-card p-0.5">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              setAnchor(d);
            }}
          >
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigate(1)}>
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
          onDayClick={(date) => {
            setAnchor(date);
            setView("day");
          }}
        />
      )}

      {/* Booking details sheet */}
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
            <div className="rounded-xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <DetailRow label="Service" value={selected.services?.name} />
              <DetailRow
                label="With"
                value={
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {selected.staff?.name}
                  </span>
                }
              />
              <DetailRow label="Contact" value={selected.customer_email || selected.customer_phone || "—"} />
              <DetailRow label="Price" value={fmtMoney(selected.price_cents ?? 0)} />
              <DetailRow
                label="Status"
                value={
                  <Badge variant={selected.status === "confirmed" ? "default" : "secondary"} className="capitalize">
                    {String(selected.status).replace("_", " ")}
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
          <DialogFooter className="flex-wrap gap-2">
            {selected?.status === "confirmed" && (
              <>
                <Button variant="outline" onClick={() => setStatus(selected.id, "completed")}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Complete
                </Button>
                <Button variant="outline" onClick={() => setStatus(selected.id, "no_show")}>
                  <UserX className="h-4 w-4 mr-1.5" /> No-show
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive">
                      <XCircle className="h-4 w-4 mr-1.5" /> Cancel
                    </Button>
                  }
                  title="Cancel this booking?"
                  description="The customer will be notified if reminders are enabled."
                  confirmLabel="Cancel booking"
                  onConfirm={async () => { await setStatus(selected.id, "cancelled"); }}
                />
              </>
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
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const totalH = hours.length * HOUR_PX;

  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();
  const nowTop =
    isToday && now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? (now.getHours() - START_HOUR + now.getMinutes() / 60) * HOUR_PX
      : null;

  if (isLoading) return <Skeleton className="h-[600px] w-full rounded-2xl" />;
  if (staff.length === 0)
    return (
      <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center text-sm text-muted-foreground">
        Add a team member on the Staff page to start scheduling.
      </div>
    );

  const colWidth = "minmax(160px, 1fr)";
  const gridTemplate = `60px repeat(${staff.length}, ${colWidth})`;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 60 + staff.length * 160 }}>
          {/* Header */}
          <div className="grid sticky top-0 z-10 bg-card/95 backdrop-blur border-b" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="bg-muted/30" />
            {staff.map((s) => (
              <StaffColumnHeader key={s.id} staff={s} />
            ))}
          </div>

          {/* Body */}
          <div className="grid relative" style={{ gridTemplateColumns: gridTemplate, height: totalH }}>
            {/* Hour gutter */}
            <div className="border-r relative">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="text-[10px] text-muted-foreground text-right pr-2 -mt-1.5 tabular-nums"
                  style={{ height: HOUR_PX, position: "absolute", top: i * HOUR_PX, right: 0, left: 0 }}
                >
                  {h % 12 || 12}
                  {h < 12 ? "a" : "p"}
                </div>
              ))}
            </div>

            {staff.map((s) => (
              <StaffColumn
                key={s.id}
                staff={s}
                date={date}
                hours={hours}
                bookings={bookings.filter((b: any) => b.staff_id === s.id)}
                blocked={blocked.filter((b: any) => !b.staff_id || b.staff_id === s.id)}
                onSelect={onSelect}
                onCellClick={(iso) => onCellClick(s.id, iso)}
                onDrop={(id, iso) => onMove(id, s.id, new Date(iso))}
                nowTop={nowTop}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StaffColumnHeader({ staff }: { staff: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staff.photo_url) return setUrl(null);
    signedUrl(staff.photo_url).then(setUrl).catch(() => setUrl(null));
  }, [staff.photo_url]);
  return (
    <div className="border-r last:border-r-0 px-3 py-3 flex items-center gap-2.5 min-w-0">
      {url ? (
        <img src={url} alt={staff.name} className="h-9 w-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium shrink-0">
          {staff.name[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{staff.name}</div>
        {staff.role && <div className="text-[11px] text-muted-foreground truncate">{staff.role}</div>}
      </div>
    </div>
  );
}

function StaffColumn({
  staff,
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
  date: Date;
  hours: number[];
  bookings: any[];
  blocked: any[];
  onSelect: (b: any) => void;
  onCellClick: (iso: string) => void;
  onDrop: (bookingId: string, iso: string) => void;
  nowTop: number | null;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const [hoverTop, setHoverTop] = useState<number | null>(null);

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
      }}
    >
      {/* slot grid */}
      {hours.map((_, i) => (
        <div
          key={i}
          className="border-b border-border/60 hover:bg-secondary/30 cursor-pointer transition-colors"
          style={{ height: HOUR_PX }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = i * HOUR_PX + (e.clientY - rect.top);
            const d = yToDate(y);
            onCellClick(d.toISOString());
          }}
        />
      ))}

      {/* blocked overlays */}
      {blocked.map((b: any) => {
        const bs = new Date(b.starts_at);
        const be = new Date(b.ends_at);
        const dayStart = new Date(date);
        dayStart.setHours(START_HOUR, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(END_HOUR, 0, 0, 0);
        const s = bs < dayStart ? dayStart : bs;
        const e = be > dayEnd ? dayEnd : be;
        if (e <= s) return null;
        const top = ((s.getTime() - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
        const height = ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_PX;
        return (
          <div
            key={b.id}
            className="absolute left-0 right-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,oklch(0_0_0/0.06)_6px,oklch(0_0_0/0.06)_12px)] border-y border-dashed border-foreground/15 pointer-events-none"
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
          <div className="h-px bg-primary relative">
            <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary animate-pulse-ring" />
          </div>
        </div>
      )}

      {/* drop preview */}
      {hoverTop !== null && (
        <div
          className="absolute left-1 right-1 rounded-lg bg-primary/15 border border-primary/40 pointer-events-none"
          style={{ top: hoverTop, height: 4 * SLOT_PX }}
        />
      )}

      {/* bookings */}
      {bookings.map((b: any) => {
        const s = new Date(b.starts_at);
        const e = new Date(b.ends_at);
        const dayStart = new Date(date);
        dayStart.setHours(START_HOUR, 0, 0, 0);
        const top = ((s.getTime() - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
        const height = Math.max(28, ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_PX);
        const color = b.services?.color || "var(--color-primary)";
        return (
          <button
            key={b.id}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData("text/booking-id", b.id);
              ev.dataTransfer.effectAllowed = "move";
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(b);
            }}
            className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden transition-shadow shadow-soft hover:shadow-elegant cursor-grab active:cursor-grabbing animate-rise"
            style={{
              top,
              height,
              background: `color-mix(in oklab, ${color} 18%, var(--color-card))`,
              borderLeft: `3px solid ${color}`,
            }}
          >
            <div className="text-[11px] font-medium truncate flex items-center gap-1">
              {b.customer_name}
              {b.source === "walkin" && (
                <span className="inline-block px-1 rounded text-[8px] uppercase tracking-wider bg-foreground/10">
                  Walk-in
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{b.services?.name}</div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {fmtTime(b.starts_at)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ===== Week View — day columns, click cells to create ===== */

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
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  if (isLoading) return <Skeleton className="h-[600px] w-full rounded-2xl" />;

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
      <div className="grid sticky top-0 z-10 bg-card/95 backdrop-blur" style={{ gridTemplateColumns: "60px repeat(7, minmax(80px, 1fr))" }}>
        <div className="border-b border-r bg-muted/30 py-2" />
        {days.map((d) => {
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={d.toISOString()} className="border-b py-3 text-center text-xs">
              <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {d.toLocaleDateString([], { weekday: "short" })}
              </div>
              <div
                className={`mt-1 mx-auto h-8 w-8 grid place-items-center rounded-full font-display text-base tabular-nums ${
                  isToday ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid relative overflow-x-auto" style={{ gridTemplateColumns: "60px repeat(7, minmax(80px, 1fr))" }}>
        <div className="border-r">
          {hours.map((h) => (
            <div key={h} className="text-[10px] text-muted-foreground text-right pr-2 -mt-1.5 tabular-nums" style={{ height: HOUR_PX }}>
              {h % 12 || 12}
              {h < 12 ? "a" : "p"}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayBookings = bookings.filter((b: any) => new Date(b.starts_at).toDateString() === d.toDateString());
          return (
            <div key={d.toISOString()} className="relative border-r last:border-r-0">
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="border-b border-border/60 hover:bg-secondary/30 cursor-pointer"
                  style={{ height: HOUR_PX }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const minutes = Math.round((e.clientY - rect.top) / SLOT_PX) * SLOT_MIN;
                    const t = new Date(d);
                    t.setHours(START_HOUR + i, 0, 0, 0);
                    t.setMinutes(t.getMinutes() + minutes);
                    onCellClick(d, t.toISOString());
                  }}
                />
              ))}
              {dayBookings.map((b: any) => {
                const s = new Date(b.starts_at);
                const e = new Date(b.ends_at);
                const top = (s.getHours() - START_HOUR + s.getMinutes() / 60) * HOUR_PX;
                const height = Math.max(28, ((e.getTime() - s.getTime()) / 3600000) * HOUR_PX);
                const color = b.services?.color || "var(--color-primary)";
                return (
                  <button
                    key={b.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(b);
                    }}
                    className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden transition-shadow shadow-soft hover:shadow-elegant animate-rise"
                    style={{
                      top,
                      height,
                      background: `color-mix(in oklab, ${color} 18%, var(--color-card))`,
                      borderLeft: `3px solid ${color}`,
                    }}
                  >
                    <div className="text-[11px] font-medium truncate">{b.customer_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{b.services?.name}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
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
  // leading
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(monthStart);
    d.setDate(d.getDate() - (i + 1));
    cells.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), i), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, inMonth: false });
  }

  const byDay = new Map<string, any[]>();
  bookings.forEach((b: any) => {
    const k = new Date(b.starts_at).toDateString();
    const arr = byDay.get(k) ?? [];
    arr.push(b);
    byDay.set(k, arr);
  });

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
      <div className="grid grid-cols-7 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wider text-muted-foreground py-2 text-center">
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
              className={`min-h-[110px] p-1.5 border-b border-r last:border-r-0 ${
                c.inMonth ? "" : "bg-muted/30 text-muted-foreground"
              } hover:bg-secondary/40 transition-colors cursor-pointer`}
              onClick={() => onDayClick(c.date)}
            >
              <div
                className={`text-xs tabular-nums inline-grid place-items-center h-6 w-6 rounded-full ${
                  isToday ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {c.date.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayBookings.slice(0, 3).map((b: any) => {
                  const color = b.services?.color || "var(--color-primary)";
                  return (
                    <button
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(b);
                      }}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate"
                      style={{
                        background: `color-mix(in oklab, ${color} 18%, var(--color-card))`,
                        borderLeft: `2px solid ${color}`,
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
