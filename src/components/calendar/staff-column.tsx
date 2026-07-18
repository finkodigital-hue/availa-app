import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { fmtTime } from "@/lib/format";
import { layoutOverlaps } from "@/lib/calendar-layout";
import type { StaffPalette } from "@/lib/staff-colors";
import { unavailableRanges, isMinuteWithinPeriods, type DayPeriod } from "@/lib/staff-hours";
import { useHours, HOUR_PX, SLOT_PX, SLOT_MIN } from "./hours-context";
import { BookingCard, OverflowChip, MIN_DURATION_MS } from "./booking-card";
import type { DragMode, DragState } from "./types";

export function StaffColumn({
  staff,
  palette,
  date,
  hours,
  periods,
  dayOff = false,
  bookings,
  blocked,
  onSelect,
  onCellClick,
  nowTop,
  drag,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  staff: any;
  palette: StaffPalette;
  date: Date;
  hours: number[];
  periods?: DayPeriod[];
  dayOff?: boolean;
  bookings: any[];
  blocked: any[];
  onSelect: (b: any) => void;
  onCellClick: (iso: string) => void;
  nowTop: number | null;
  drag: DragState | null;
  onDragStart: (b: any, mode: DragMode, staffId: string, top: number, height: number, clientY: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const [hoverTop, setHoverTop] = useState<number | null>(null);

  const isDragTargetHere = drag?.mode === "move" && drag.currentStaffId === staff.id;
  const isForeignTarget = isDragTargetHere && drag!.originStaffId !== staff.id;

  // Whether this staff member is bookable at all right now — read-only
  // (inactive/archived) columns and full days off are both non-interactive.
  const interactive = !staff._readOnly && !dayOff;

  // Non-working stretches within the visible window (before their first
  // period opens, gaps between periods, after their last period closes).
  // Only computed when we actually know their hours — `periods` is
  // undefined while the day-scoped hours queries are still loading, in
  // which case we don't shade anything rather than flash a false "closed".
  const closedRanges = useMemo(() => {
    if (dayOff || !periods) return [];
    return unavailableRanges(periods, START_HOUR * 60, END_HOUR * 60);
  }, [periods, dayOff, START_HOUR, END_HOUR]);

  const isTimeBookable = (d: Date) => {
    if (!interactive) return false;
    if (periods) {
      const minutes = d.getHours() * 60 + d.getMinutes();
      if (!isMinuteWithinPeriods(periods, minutes)) return false;
    }
    if (blocked.some((b: any) => new Date(b.starts_at) <= d && new Date(b.ends_at) > d)) return false;
    return true;
  };

  // Pack overlapping bookings into side-by-side columns (capped, with a
  // "+N" overflow chip beyond that) so a busy day never renders
  // appointments stacked or shrunk into unreadable slivers.
  const { slots, overflow } = useMemo(
    () =>
      layoutOverlaps(
        bookings.map((b: any) => {
          const startMs = new Date(b.starts_at).getTime();
          const endMs = new Date(b.ends_at).getTime();
          // Effective end, not real end — see MIN_DURATION_MS.
          return { id: b.id, startMs, endMs: Math.max(endMs, startMs + MIN_DURATION_MS) };
        }),
      ),
    [bookings],
  );
  const overflowIds = useMemo(() => new Set(overflow.flatMap((g) => g.ids)), [overflow]);
  const visibleBookings = useMemo(() => bookings.filter((b) => !overflowIds.has(b.id)), [bookings, overflowIds]);

  return (
    <div data-staff-col data-staff-id={staff.id} className={`relative border-r last:border-r-0 ${dayOff ? "bg-muted/25" : ""}`}>
      {/* slot grid — lighter lines, hour separators stronger */}
      {hours.map((_, i) => (
        <div
          key={i}
          className={`border-b border-border/40 transition-colors group ${interactive ? "hover:bg-secondary/30 cursor-pointer" : ""}`}
          style={{ height: HOUR_PX }}
          onMouseMove={(e) => {
            if (drag || !interactive) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = Math.round((i * HOUR_PX + (e.clientY - rect.top)) / SLOT_PX) * SLOT_PX;
            const minutes = Math.max(0, Math.round(y / SLOT_PX) * SLOT_MIN);
            const d = new Date(date);
            d.setHours(START_HOUR, 0, 0, 0);
            d.setMinutes(d.getMinutes() + minutes);
            setHoverTop(isTimeBookable(d) ? y : null);
          }}
          onMouseLeave={() => setHoverTop(null)}
          onClick={(e) => {
            if (!interactive) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const y = i * HOUR_PX + (e.clientY - rect.top);
            const minutes = Math.max(0, Math.round(y / SLOT_PX) * SLOT_MIN);
            const d = new Date(date);
            d.setHours(START_HOUR, 0, 0, 0);
            d.setMinutes(d.getMinutes() + minutes);
            if (!isTimeBookable(d)) {
              toast.error(`${staff.name} isn't working then.`);
              return;
            }
            onCellClick(d.toISOString());
          }}
        >
          {/* half-hour subtle line */}
          <div className="h-1/2 border-b border-dashed border-border/25" />
        </div>
      ))}

      {/* non-working hours — before/after this staff member's hours, or the
          whole column on a day off. Purely visual (clicks are already
          gated above); a subtle hatch keeps it distinct from the darker
          time-off/blocked overlay below. */}
      {!dayOff &&
        closedRanges.map(([s, e], i) => {
          const top = ((s - START_HOUR * 60) / 60) * HOUR_PX;
          const height = ((e - s) / 60) * HOUR_PX;
          if (height <= 0) return null;
          return (
            <div
              key={i}
              className="absolute left-0 right-0 bg-muted/25 pointer-events-none"
              style={{ top, height }}
            />
          );
        })}

      {/* new-booking hover preview — shows exactly where a click will land */}
      {hoverTop !== null && !drag && (
        <div
          className="absolute left-1 right-1 rounded-xl pointer-events-none create-preview flex items-center gap-1 px-2"
          style={{
            top: hoverTop,
            height: 2 * SLOT_PX,
            background: `color-mix(in oklab, ${palette.border} 14%, transparent)`,
            border: `1.5px dashed color-mix(in oklab, ${palette.border} 55%, transparent)`,
          }}
        >
          <Plus className="h-3 w-3 opacity-50 shrink-0" style={{ color: palette.ink }} />
        </div>
      )}

      {/* day-off label — centered over the whole column */}
      {dayOff && (
        <div className="absolute inset-0 flex items-start justify-center pt-8 pointer-events-none">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 bg-card/80 px-2 py-1 rounded-full">
            Not working today
          </span>
        </div>
      )}

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
          <div className="h-px relative" style={{ background: "var(--gold-deep)" }}>
            <div
              className="absolute -left-1 -top-1 h-2 w-2 rounded-full animate-pulse-ring"
              style={{ background: "var(--gold-deep)" }}
            />
          </div>
        </div>
      )}

      {/* cross-column drag ghost — shown in the column the pointer is over
          when it differs from the booking's origin column */}
      {isForeignTarget && (
        <div
          className="absolute left-1.5 right-1.5 rounded-2xl pointer-events-none drag-ghost overflow-hidden"
          style={{
            top: drag!.currentTop,
            height: drag!.currentHeight,
            background: `color-mix(in oklab, ${palette.border} 26%, transparent)`,
            border: `1.5px dashed ${palette.border}`,
          }}
        >
          <div className="px-2.5 py-1.5">
            <div className="text-[12px] font-semibold truncate" style={{ color: palette.ink }}>
              {drag!.customerName}
            </div>
            <div className="text-[10px] tabular-nums opacity-75" style={{ color: palette.ink }}>
              {fmtTime(drag!.currentStartIso)} – {fmtTime(drag!.currentEndIso)}
            </div>
          </div>
        </div>
      )}

      {/* bookings */}
      {visibleBookings.map((b: any) => (
        <BookingCard
          key={b.id}
          b={b}
          variant="day"
          date={date}
          staffId={staff.id}
          slot={slots.get(b.id)}
          onSelect={onSelect}
          drag={drag}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
        />
      ))}

      {/* overflow — beyond MAX_REAL_COLS concurrent bookings in one cluster */}
      {overflow.map((g, i) => (
        <OverflowChip key={i} group={g} date={date} bookings={bookings} onSelect={onSelect} />
      ))}
    </div>
  );
}
