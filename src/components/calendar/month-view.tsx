import { useNow } from "./use-now";
import { BookingChip } from "./booking-card";

export function MonthView({
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
  const now = useNow();
  const firstDayOfWeek = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
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
          const isToday = c.date.toDateString() === now.toDateString();
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
                {dayBookings.slice(0, 3).map((b: any) => (
                  <BookingChip key={b.id} b={b} onSelect={onSelect} />
                ))}
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
