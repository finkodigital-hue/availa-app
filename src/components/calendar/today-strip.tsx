import { CircleDollarSign, CalendarDays, TimerReset, CheckCircle2, Ban } from "lucide-react";

import { fmtMoney } from "@/lib/format";
import { useHours } from "./hours-context";
import { useNow } from "./use-now";

export function TodayStrip({ bookings, staff, date }: { bookings: any[]; staff: any[]; date: Date }) {
  const { START_HOUR, END_HOUR } = useHours();
  const now = useNow();
  const isToday = date.toDateString() === now.toDateString();
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
    { label: isToday ? "Today's revenue" : "Day revenue", value: fmtMoney(revenue), icon: CircleDollarSign, tint: "var(--confirmed-bg)", ink: "var(--confirmed)" },
    { label: "Bookings", value: String(active.length), icon: CalendarDays, tint: "var(--gold-wash)", ink: "var(--gold-deep)" },
    { label: "Free time", value: `${freeHours}h`, icon: TimerReset, tint: "#F3F1EB", ink: "var(--charcoal-soft)" },
    { label: "Check-ins", value: String(checkins), icon: CheckCircle2, tint: "var(--pending-bg)", ink: "var(--pending)" },
    { label: "Cancellations", value: String(cancellations), icon: Ban, tint: "#F5E5E1", ink: "#A8503E" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.label} className="rounded-2xl border bg-card p-3 sm:p-4 shadow-soft transition-transform hover:-translate-y-0.5 hover:shadow-elegant">
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
