import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { paletteFor } from "@/lib/staff-colors";
import { useHours, HOUR_PX, SLOT_PX, SLOT_MIN } from "./hours-context";
import { useNow } from "./use-now";
import { StaffColumnHeader } from "./staff-column-header";
import { StaffColumn } from "./staff-column";
import type { DragMode, DragState } from "./types";

export function DayView({
  staff,
  bookings,
  blocked,
  date,
  isLoading,
  onSelect,
  onCellClick,
  onMove,
  onResize,
  fullscreen = false,
}: {
  staff: any[];
  bookings: any[];
  blocked: any[];
  date: Date;
  isLoading: boolean;
  onSelect: (b: any) => void;
  onCellClick: (staffId: string, isoTime: string) => void;
  onMove: (id: string, newStaffId: string, newStart: Date) => void;
  onResize: (id: string, edge: "start" | "end", newIso: string) => void;
  fullscreen?: boolean;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const totalH = hours.length * HOUR_PX;

  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRaf = useRef<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Auto-scroll near edges of the scroll container while dragging/resizing
  const autoScroll = (clientY: number) => {
    if (!scrollRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const EDGE = 64;
    let dy = 0;
    if (y < EDGE) dy = -Math.ceil((EDGE - y) / 4);
    else if (y > rect.height - EDGE) dy = Math.ceil((y - (rect.height - EDGE)) / 4);
    if (dy !== 0) {
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
      const step = () => {
        if (scrollRef.current) scrollRef.current.scrollTop += dy;
        autoScrollRaf.current = requestAnimationFrame(step);
      };
      autoScrollRaf.current = requestAnimationFrame(step);
    } else if (autoScrollRaf.current) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  };
  const stopAutoScroll = () => {
    if (autoScrollRaf.current) {
      cancelAnimationFrame(autoScrollRaf.current);
      autoScrollRaf.current = null;
    }
  };

  const topToIso = (top: number) => {
    const minutes = Math.max(0, Math.round(top / SLOT_PX) * SLOT_MIN);
    const d = new Date(date);
    d.setHours(START_HOUR, 0, 0, 0);
    d.setMinutes(d.getMinutes() + minutes);
    return d.toISOString();
  };

  const beginDrag = (b: any, mode: DragMode, staffId: string, top: number, height: number, clientY: number) => {
    setDrag({
      id: b.id,
      mode,
      originStaffId: staffId,
      startClientY: clientY,
      origTop: top,
      origHeight: height,
      origStartIso: b.starts_at,
      origEndIso: b.ends_at,
      currentStaffId: staffId,
      currentTop: top,
      currentHeight: height,
      currentStartIso: b.starts_at,
      currentEndIso: b.ends_at,
      customerName: b.customer_name || "Booking",
    });
  };

  const updateDrag = (e: React.PointerEvent) => {
    autoScroll(e.clientY);
    setDrag((d) => {
      if (!d) return d;
      const deltaY = e.clientY - d.startClientY;
      if (d.mode === "move") {
        let top = Math.round((d.origTop + deltaY) / SLOT_PX) * SLOT_PX;
        top = Math.max(0, Math.min(top, totalH - d.origHeight));
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-staff-col]") as HTMLElement | null;
        const currentStaffId = el?.dataset.staffId || d.currentStaffId;
        return {
          ...d,
          currentTop: top,
          currentStaffId,
          currentStartIso: topToIso(top),
          currentEndIso: topToIso(top + d.origHeight),
        };
      }
      if (d.mode === "resize-end") {
        let height = Math.round((d.origHeight + deltaY) / SLOT_PX) * SLOT_PX;
        height = Math.max(SLOT_PX, Math.min(height, totalH - d.origTop));
        return { ...d, currentHeight: height, currentEndIso: topToIso(d.origTop + height) };
      }
      // resize-start
      let top = Math.round((d.origTop + deltaY) / SLOT_PX) * SLOT_PX;
      top = Math.max(0, Math.min(top, d.origTop + d.origHeight - SLOT_PX));
      const height = d.origHeight + (d.origTop - top);
      return { ...d, currentTop: top, currentHeight: height, currentStartIso: topToIso(top) };
    });
  };

  const endDrag = () => {
    stopAutoScroll();
    setDrag((d) => {
      if (!d) return null;
      if (d.mode === "move") {
        if (d.currentStaffId !== d.originStaffId || d.currentStartIso !== d.origStartIso) {
          onMove(d.id, d.currentStaffId, new Date(d.currentStartIso));
        }
      } else if (d.mode === "resize-end") {
        if (d.currentEndIso !== d.origEndIso) onResize(d.id, "end", d.currentEndIso);
      } else {
        if (d.currentStartIso !== d.origStartIso) onResize(d.id, "start", d.currentStartIso);
      }
      return null;
    });
  };

  // Shared clock (not a one-shot `new Date()`) so the now-line stays
  // correct even if this tab is left open across midnight.
  const now = useNow();
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
      <div ref={scrollRef} className={`overflow-auto scroll-smooth ${fullscreen ? "max-h-[calc(100dvh-64px)]" : "max-h-[calc(100vh-280px)]"}`}>
        <div style={{ minWidth: 64 + staff.length * 180 }}>
          {/* Sticky staff header */}
          <div className="grid sticky top-0 z-20 bg-card/85 backdrop-blur-xl border-b" style={{ gridTemplateColumns: gridTemplate }}>
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
                  className={`text-[10px] text-muted-foreground/80 text-right pr-2 tabular-nums font-medium ${i === 0 ? "" : "-mt-1.5"}`}
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
                  nowTop={nowTop}
                  drag={drag}
                  onDragStart={beginDrag}
                  onDragMove={updateDrag}
                  onDragEnd={endDrag}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
