import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { layoutOverlaps } from "@/lib/calendar-layout";
import { useHours, HOUR_PX, SLOT_PX, SLOT_MIN } from "./hours-context";
import { useNow } from "./use-now";
import { BookingCard, OverflowChip, MIN_DURATION_MS } from "./booking-card";

function WeekDayColumn({
  date,
  hours,
  bookings,
  isToday,
  onSelect,
  onCellClick,
}: {
  date: Date;
  hours: number[];
  bookings: any[];
  isToday: boolean;
  onSelect: (b: any) => void;
  onCellClick: (date: Date, isoTime: string) => void;
}) {
  const { START_HOUR } = useHours();
  const { slots, overflow } = useMemo(
    () =>
      layoutOverlaps(
        bookings.map((b: any) => {
          const startMs = new Date(b.starts_at).getTime();
          const endMs = new Date(b.ends_at).getTime();
          // Effective end, not real end — see MIN_DURATION_MS.
          return { id: b.id, startMs, endMs: Math.max(endMs, startMs + MIN_DURATION_MS) };
        }),
        // A week-day column pools every staff member into one narrower
        // column (unlike Day view's per-staff columns), so 3 real slots
        // leaves too little width to show a name — cap at 2 and let the
        // rest overflow into the "+N" chip sooner.
        2,
      ),
    [bookings],
  );
  const overflowIds = useMemo(() => new Set(overflow.flatMap((g) => g.ids)), [overflow]);
  const visibleBookings = useMemo(() => bookings.filter((b) => !overflowIds.has(b.id)), [bookings, overflowIds]);

  return (
    <div className={`relative border-r last:border-r-0 ${isToday ? "bg-primary/[0.025]" : ""}`}>
      {hours.map((h, i) => (
        <div
          key={h}
          className="border-b border-border/40 hover:bg-secondary/30 cursor-pointer"
          style={{ height: HOUR_PX }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const minutes = Math.round((e.clientY - rect.top) / SLOT_PX) * SLOT_MIN;
            const t = new Date(date);
            t.setHours(START_HOUR + i, 0, 0, 0);
            t.setMinutes(t.getMinutes() + minutes);
            onCellClick(date, t.toISOString());
          }}
        >
          <div className="h-1/2 border-b border-dashed border-border/25" />
        </div>
      ))}
      {visibleBookings.map((b: any) => (
        <BookingCard key={b.id} b={b} variant="week" date={date} slot={slots.get(b.id)} onSelect={onSelect} />
      ))}
      {overflow.map((g, i) => (
        <OverflowChip key={i} group={g} date={date} bookings={bookings} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function WeekView({
  bookings,
  weekStart,
  isLoading,
  onSelect,
  onCellClick,
  fullscreen = false,
}: {
  bookings: any[];
  weekStart: Date;
  isLoading: boolean;
  onSelect: (b: any) => void;
  onCellClick: (date: Date, isoTime: string) => void;
  fullscreen?: boolean;
}) {
  const { START_HOUR, END_HOUR } = useHours();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const now = useNow();

  if (isLoading) return <Skeleton className="h-[600px] w-full rounded-3xl" />;

  return (
    <div className="rounded-3xl border bg-card overflow-hidden shadow-soft">
      <div className={`overflow-auto scroll-smooth ${fullscreen ? "max-h-[calc(100dvh-64px)]" : "max-h-[calc(100vh-260px)]"}`}>
        <div className="min-w-[1184px]">
          <div className="grid sticky top-0 z-20 bg-card/85 backdrop-blur-xl border-b" style={{ gridTemplateColumns: "64px repeat(7, minmax(160px, 1fr))" }}>
            <div className="border-r bg-muted/30 py-2" />
            {days.map((d) => {
              const isToday = d.toDateString() === now.toDateString();
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

          <div className="grid relative" style={{ gridTemplateColumns: "64px repeat(7, minmax(160px, 1fr))" }}>
            <div className="border-r">
              {hours.map((h, i) => (
                <div key={h} className={`text-[10px] text-muted-foreground/80 text-right pr-2 tabular-nums font-medium ${i === 0 ? "" : "-mt-1.5"}`} style={{ height: HOUR_PX }}>
                  {h % 12 || 12}
                  <span className="ml-0.5 opacity-60">{h < 12 ? "AM" : "PM"}</span>
                </div>
              ))}
            </div>
            {days.map((d) => {
              const isToday = d.toDateString() === now.toDateString();
              const dayBookings = bookings.filter((b: any) => new Date(b.starts_at).toDateString() === d.toDateString());
              return (
                <WeekDayColumn
                  key={d.toISOString()}
                  date={d}
                  hours={hours}
                  bookings={dayBookings}
                  isToday={isToday}
                  onSelect={onSelect}
                  onCellClick={onCellClick}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
