import { Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { StaffPerformance } from "@/lib/reports";

export function StaffEarningsTable({
  staff,
  currency,
  rangeLabel,
}: {
  staff: StaffPerformance[];
  currency: string;
  rangeLabel: string;
}) {
  const sorted = [...staff].sort((a, b) => b.revenue - a.revenue);

  const exportCsv = () => {
    downloadCsv(
      `staff-earnings-${rangeLabel}`,
      sorted.map((s) => ({
        Staff: s.name,
        Bookings: s.bookings,
        "Revenue ($)": (s.revenue / 100).toFixed(2),
        "Hours booked": s.hours,
        "Avg per booking ($)": (s.avg / 100).toFixed(2),
      })),
    );
  };

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-xl">Staff earnings</h3>
          <p className="text-xs text-muted-foreground">Bookings, revenue, and hours per staff member for the selected range.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={sorted.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={Users} title="No staff bookings" description="No bookings were assigned to staff in this range." />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="px-2 py-2 font-medium">Staff</th>
                <th className="px-2 py-2 font-medium text-right">Bookings</th>
                <th className="px-2 py-2 font-medium text-right">Hours booked</th>
                <th className="px-2 py-2 font-medium text-right">Avg / booking</th>
                <th className="px-2 py-2 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.staffId} className="border-b last:border-b-0 hover:bg-secondary/30">
                  <td className="px-2 py-2.5 font-medium truncate">{s.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{s.bookings}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{s.hours}h</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtMoney(s.avg, currency)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-medium">{fmtMoney(s.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
