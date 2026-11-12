import { CircleDollarSign, CalendarDays, TimerReset, CheckCircle2, Ban } from "lucide-react";

import { fmtMoney } from "@/lib/format";
import { useHours } from "./hours-context";
import { useNow } from "./use-now";

export function TodayStrip({ bookings, staff, date, currency = "GBP" }: { bookings: any[]; staff: any[]; date: Date; currency?: string }) {
  const { START_HOUR, END_HOUR } = useHours();
  const now = useNow();
  const isToday = date.toDateString() === now.toDateString();
  const active = bookings.filter((b) => b.status !== "cancelled");
  const bookedValue = active.reduce((sum, b) => sum + (b.price_cents ?? 0), 0);
  const cancellations = bookings.filter((b) => b.status === "cancelled").length;
  const completed = bookings.filter((b) => b.status === "completed").length;

  // Free time across all staff between START and END
  const totalMinutes = staff.length * (END_HOUR - START_HOUR) * 60;
  const bookedMinutes = active.reduce((sum, b) => sum + Math.max(0, (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000), 0);
  const freeMinutes = Math.max(0, totalMinutes - bookedMinutes);
  const freeHours = (freeMinutes / 60).toFixed(1);

  const cards = [
    { label: isToday ? "Today's booked value" : "Booked value", value: fmtMoney(bookedValue, currency), description: "Prices of non-cancelled bookings. See Daily takings for payments received.", icon: CircleDollarSign, tint: "var(--confirmed-bg)", ink: "var(--confirmed)" },
    { label: "Bookings", value: String(active.length), icon: CalendarDays, tint: "var(--gold-wash)", ink: "var(--gold-deep)" },
    { label: "Estimated unbooked", value: `${freeHours}h`, description: "Staff window less appointment durations. Breaks, time off and individual hours aren't included.", icon: TimerReset, tint: "#F3F1EB", ink: "var(--charcoal-soft)" },
    { label: "Completed", value: String(completed), icon: CheckCircle2, tint: "var(--pending-bg)", ink: "var(--pending)" },
    { label: "Cancellations", value: String(cancellations), icon: Ban, tint: "#F5E5E1", ink: "#A8503E" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-2" data-calendar-stats>
      {cards.map((c, index) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="rounded-2xl border bg-card p-3 sm:p-4 shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elegant" data-calendar-stat data-calendar-stat-index={index}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground" data-calendar-stat-label>
              <span className="h-6 w-6 rounded-full grid place-items-center" style={{ background: c.tint, color: c.ink }} data-calendar-stat-icon>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{c.label}</span>
            </div>
            <div className="mt-2 font-display text-xl sm:text-2xl tabular-nums tracking-tight" data-calendar-stat-value>{c.value}</div>
            {c.description && <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>}
          </div>
        );
      })}
    </div>
  );
}
