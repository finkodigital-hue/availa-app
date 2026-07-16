import { useEffect, useRef, useState } from "react";
import { Sparkle, Wallet, Footprints, Globe, StickyNote } from "lucide-react";

import { fmtTime, fmtMoney } from "@/lib/format";
import { packedStyle, type LayoutSlot, type OverflowGroup } from "@/lib/calendar-layout";
import { useHours, HOUR_PX, SLOT_PX } from "./hours-context";
import { bookingColors } from "./booking-colors";
import { StaffAvatarChip } from "./staff-avatar-chip";
import type { DragMode, DragState } from "./types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Shared minimums so a real 15-minute (or tightly packed) booking never
// renders too short to read — tuned against the real imported dataset,
// where back-to-back (<5min gap) bookings, not deep overlap, are the
// dominant crowding case.
export const MIN_BASE_HEIGHT = 38;
const MIN_DISPLAY_HEIGHT = 34;
const INSET = 4;

// The real-time duration MIN_BASE_HEIGHT implies at this pixel scale.
// staff-column.tsx / week-view.tsx feed this into layoutOverlaps as each
// booking's *effective* end time, so overlap/packing decisions match what's
// actually rendered. Without it, a short booking's height-padded box can
// visually bleed past its real end time into whatever renders right after
// it — the packing algorithm, working only from real timestamps, has no
// way to know a "20-minute" box is actually ~36 minutes tall on screen.
export const MIN_DURATION_MS = (MIN_BASE_HEIGHT / HOUR_PX) * 3_600_000;

/* ===== BookingCard — Day (draggable/resizable) & Week (static) ===== */

type BookingCardProps = {
  b: any;
  variant: "day" | "week";
  date: Date;
  staffId?: string;
  slot: LayoutSlot | undefined;
  onSelect: (b: any) => void;
  drag?: DragState | null;
  onDragStart?: (b: any, mode: DragMode, staffId: string, top: number, height: number, clientY: number) => void;
  onDragMove?: (e: React.PointerEvent) => void;
  onDragEnd?: () => void;
};

export function BookingCard({
  b,
  variant,
  date,
  staffId,
  slot,
  onSelect,
  drag,
  onDragStart,
  onDragMove,
  onDragEnd,
}: BookingCardProps) {
  const { START_HOUR } = useHours();
  const interactive = variant === "day";
  const s = new Date(b.starts_at);
  const e = new Date(b.ends_at);
  const dayStart = new Date(date);
  dayStart.setHours(START_HOUR, 0, 0, 0);
  const baseTop = ((s.getTime() - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
  const baseHeight = Math.max(MIN_BASE_HEIGHT, ((e.getTime() - s.getTime()) / 60000 / 60) * HOUR_PX);

  const isActive = interactive && drag?.id === b.id;
  const isMoving = isActive && drag!.mode === "move";
  const isResizing = isActive && drag!.mode !== "move";
  const isElsewhere = isMoving && drag!.currentStaffId !== staffId;

  const top = isActive && !isElsewhere ? drag!.currentTop : baseTop;
  const height = isActive && !isElsewhere ? drag!.currentHeight : baseHeight;
  // A small vertical inset so back-to-back bookings (touching in time, not
  // overlapping) still show a hairline of breathing room instead of
  // reading as one merged block. Skipped while actively dragging/resizing
  // so the box always tracks the real occupied time precisely.
  const displayHeight = isActive ? height : Math.max(MIN_DISPLAY_HEIGHT, height - INSET);
  // Widen to the full column while actively being dragged/resized, so it's
  // easy to see and drop; otherwise sit in its packed side-by-side slot.
  const { left, width } = packedStyle(isActive ? undefined : slot);
  const liveStartIso = isActive ? drag!.currentStartIso : b.starts_at;
  const liveEndIso = isActive ? drag!.currentEndIso : b.ends_at;
  const liveDurationMin = Math.round((new Date(liveEndIso).getTime() - new Date(liveStartIso).getTime()) / 60000);

  const colors = bookingColors(b);

  // Brief settle bounce right after a drag/resize commits.
  const [justSettled, setJustSettled] = useState(false);
  const wasActive = useRef(false);
  useEffect(() => {
    if (!interactive) return;
    if (wasActive.current && !isActive) {
      setJustSettled(true);
      const t = setTimeout(() => setJustSettled(false), 320);
      return () => clearTimeout(t);
    }
    wasActive.current = isActive;
  }, [isActive, interactive]);

  // Pointer-driven drag/resize — a move only "commits" past a small
  // movement threshold, so a plain tap still opens the detail dialog.
  const pending = useRef<{ mode: DragMode; startX: number; startY: number; active: boolean } | null>(null);
  const draggedRef = useRef(false);

  const startPending = (mode: DragMode) => (ev: React.PointerEvent) => {
    if (!interactive) return;
    ev.stopPropagation();
    pending.current = { mode, startX: ev.clientX, startY: ev.clientY, active: false };
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  };

  const handlePointerMove = (ev: React.PointerEvent) => {
    if (!interactive) return;
    const p = pending.current;
    if (!p) return;
    if (!p.active) {
      if (Math.abs(ev.clientX - p.startX) < 4 && Math.abs(ev.clientY - p.startY) < 4) return;
      p.active = true;
      draggedRef.current = true;
      onDragStart?.(b, p.mode, staffId!, baseTop, baseHeight, p.startY);
    }
    onDragMove?.(ev);
  };

  const handlePointerUp = () => {
    if (!interactive) return;
    if (pending.current?.active) onDragEnd?.();
    pending.current = null;
  };

  const depositPaid = (b.amount_paid_cents ?? 0) > 0;
  const isWalkin = b.source === "walkin";
  const isOnline = b.source === "online" || b.source === "booking";
  const hasNotes = !!(b.notes && String(b.notes).trim().length);
  const isVip = !!b.is_vip;
  const title = colors.isCustom ? b.custom_title || "Blocked" : b.customer_name || "—";

  return (
    <>
      <button
        type="button"
        onPointerDown={startPending("move")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(ev) => {
          ev.stopPropagation();
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          onSelect(b);
        }}
        className={`group absolute rounded-2xl text-left overflow-hidden shadow-soft hover:shadow-elegant hover:-translate-y-0.5 active:scale-[0.99] transition-[left,width] duration-150 ${
          interactive ? "drag-lift touch-none" : "cursor-pointer"
        } ${isMoving && !isElsewhere ? "is-dragging" : ""} ${isResizing ? "is-resizing" : ""} ${
          isElsewhere ? "opacity-35" : ""
        } ${justSettled ? "drop-snap" : ""}`}
        style={{
          top,
          height: displayHeight,
          left,
          width,
          background: colors.bg,
          border: `1px ${colors.dashed ? "dashed" : "solid"} ${colors.border}`,
          color: colors.ink,
          zIndex: isActive ? 30 : undefined,
        }}
      >
        {/* Left status accent bar */}
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: colors.border }} />
        {/* Faded placeholder when moved into another column */}
        {isElsewhere && <span className="absolute inset-0 rounded-2xl border-2 border-dashed border-foreground/15 bg-card/60" />}
        <div className="relative px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {variant === "week" && !colors.isCustom && (
              <StaffAvatarChip staffId={b.staff_id} name={b.staff?.name} />
            )}
            {colors.isCustom && (
              <span className="shrink-0 text-[9px] uppercase tracking-wider bg-black/10 rounded px-1">Custom</span>
            )}
            <div className="text-[12px] font-semibold truncate flex-1" style={{ color: colors.ink }}>
              {title}
            </div>
            {isVip && <Sparkle className="h-3 w-3 shrink-0" style={{ color: colors.ink }} />}
          </div>
          {!colors.isCustom && height >= 44 && (
            <div className="text-[11px] truncate opacity-80">{b.services?.name}</div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] tabular-nums opacity-75">{fmtTime(b.starts_at)}</span>
            {b.price_cents > 0 && height >= 56 && (
              <span className="text-[10px] tabular-nums opacity-60">· {fmtMoney(b.price_cents)}</span>
            )}
            {!colors.isCustom && (
              <span className="ml-auto flex items-center gap-1 opacity-80">
                {depositPaid && <Wallet className="h-3 w-3" />}
                {isWalkin && <Footprints className="h-3 w-3" />}
                {isOnline && !isWalkin && <Globe className="h-3 w-3" />}
                {hasNotes && <StickyNote className="h-3 w-3" />}
              </span>
            )}
          </div>
        </div>

        {/* Resize handles — day view only, and only while not mid cross-column move */}
        {interactive && !isElsewhere && (
          <>
            <span
              className="absolute left-1/2 -translate-x-1/2 -top-0.5 h-2.5 w-10 rounded-full cursor-ns-resize resize-handle bg-foreground/30 group-hover:opacity-60 hover:!opacity-100 touch-none z-10"
              onPointerDown={startPending("resize-start")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <span
              className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 h-2.5 w-10 rounded-full cursor-ns-resize resize-handle bg-foreground/30 group-hover:opacity-60 hover:!opacity-100 touch-none z-10"
              onPointerDown={startPending("resize-end")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </>
        )}
      </button>

      {/* Live time badge while actively dragging/resizing this booking */}
      {isActive && !isElsewhere && (
        <div
          className="absolute z-40 pointer-events-none px-2.5 py-1.5 rounded-xl bg-foreground text-background text-[11px] shadow-elegant whitespace-nowrap drag-badge"
          style={{ top: Math.max(0, top - 40), left: 6 }}
        >
          <div className="font-medium tabular-nums">
            {fmtTime(liveStartIso)} – {fmtTime(liveEndIso)}
          </div>
          <div className="opacity-70 tabular-nums">{liveDurationMin} min</div>
        </div>
      )}
    </>
  );
}

/* ===== Overflow chip — the 4th packed slot once a cluster exceeds
   MAX_REAL_COLS individually-placed columns. Shown instead of shrinking
   every column into an unreadable sliver; opens a small popover listing
   the grouped bookings. ===== */

export function OverflowChip({
  group,
  date,
  bookings,
  onSelect,
}: {
  group: OverflowGroup;
  date: Date;
  bookings: any[];
  onSelect: (b: any) => void;
}) {
  const { START_HOUR } = useHours();
  const dayStart = new Date(date);
  dayStart.setHours(START_HOUR, 0, 0, 0);
  const top = ((group.startMs - dayStart.getTime()) / 60000 / 60) * HOUR_PX;
  const height = Math.max(MIN_DISPLAY_HEIGHT, ((group.endMs - group.startMs) / 60000 / 60) * HOUR_PX - INSET);
  const { left, width } = packedStyle(group);
  const items = group.ids.map((id) => bookings.find((b) => b.id === id)).filter(Boolean);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(ev) => ev.stopPropagation()}
          className="absolute rounded-2xl text-[11px] font-semibold shadow-soft hover:shadow-elegant hover:-translate-y-0.5 transition-all grid place-items-center"
          style={{
            top,
            height,
            left,
            width,
            background: "var(--color-muted)",
            border: "1px dashed var(--color-border)",
            color: "var(--color-foreground)",
          }}
          title={`${items.length} more booking${items.length === 1 ? "" : "s"}`}
        >
          +{items.length}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5" align="start">
        <div className="max-h-64 overflow-auto space-y-1">
          {items.map((b: any) => {
            const colors = bookingColors(b);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect(b)}
                className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-secondary/60 transition-colors"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: colors.border }} />
                <span className="tabular-nums text-muted-foreground shrink-0">{fmtTime(b.starts_at)}</span>
                <span className="truncate font-medium">{colors.isCustom ? b.custom_title || "Blocked" : b.customer_name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ===== BookingChip — Month view's compact flow-list entry ===== */

export function BookingChip({ b, onSelect }: { b: any; onSelect: (b: any) => void }) {
  const colors = bookingColors(b);
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect(b);
      }}
      className="w-full flex items-center gap-1 text-left text-[10px] px-1.5 py-0.5 rounded-lg truncate transition-transform hover:translate-x-0.5"
      style={{
        background: colors.bg,
        border: `1px ${colors.dashed ? "dashed" : "solid"} ${colors.border}`,
        color: colors.ink,
      }}
    >
      {!colors.isCustom && <StaffAvatarChip staffId={b.staff_id} name={b.staff?.name} className="h-3.5 w-3.5" />}
      <span className="truncate">
        {fmtTime(b.starts_at)} · {colors.isCustom ? b.custom_title || "Blocked" : b.customer_name}
      </span>
    </button>
  );
}
