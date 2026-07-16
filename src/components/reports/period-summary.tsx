import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import { fmtRange } from "@/lib/report-dates";
import type { PeriodTotals, StaffPerformance, ServicePerformance } from "@/lib/reports";

// The single printable/PDF-able page an owner hands to an accountant —
// deliberately separate from the interactive report sections above it
// (which stay on-screen only) so printing produces one clean document
// instead of the whole dashboard-style page.
export function PeriodSummary({
  businessName,
  from,
  to,
  totals,
  prevTotals,
  compareLabel,
  staff,
  services,
  currency,
}: {
  businessName: string;
  from: Date;
  to: Date;
  totals: PeriodTotals;
  prevTotals: PeriodTotals;
  compareLabel: string;
  staff: StaffPerformance[];
  services: ServicePerformance[];
  currency: string;
}) {
  const sortedStaff = [...staff].sort((a, b) => b.revenue - a.revenue);

  return (
    <div id="period-summary" className="rounded-2xl border bg-card p-6 sm:p-8 shadow-soft print:shadow-none print:border-0 print:rounded-none print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h3 className="font-display text-xl">End-of-period summary</h3>
          <p className="text-xs text-muted-foreground">One clean page combining the reports above — ready to print or save as a PDF.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF
        </Button>
      </div>

      <div className="mb-6 pb-6 border-b">
        <div className="font-display text-2xl">{businessName}</div>
        <div className="text-sm text-muted-foreground mt-1">
          {fmtRange(from, to)} · Generated {new Date().toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 print:grid-cols-3">
        <SummaryStat label="Revenue" value={fmtMoney(totals.revenue, currency)} sub={`${compareLabel}: ${fmtMoney(prevTotals.revenue, currency)}`} />
        <SummaryStat label="Bookings" value={String(totals.bookings)} sub={`${compareLabel}: ${prevTotals.bookings}`} />
        <SummaryStat label="Avg booking value" value={fmtMoney(totals.avg, currency)} sub={`${compareLabel}: ${fmtMoney(prevTotals.avg, currency)}`} />
      </div>

      <div className="mb-8">
        <h4 className="font-display text-lg mb-3">Staff earnings</h4>
        {sortedStaff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff bookings in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-1.5 font-medium">Staff</th>
                <th className="py-1.5 font-medium text-right">Bookings</th>
                <th className="py-1.5 font-medium text-right">Hours</th>
                <th className="py-1.5 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {sortedStaff.map((s) => (
                <tr key={s.staffId} className="border-b last:border-b-0">
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.bookings}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.hours}h</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{fmtMoney(s.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h4 className="font-display text-lg mb-3">Services breakdown</h4>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">No services booked in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="py-1.5 font-medium">Service</th>
                <th className="py-1.5 font-medium text-right">Bookings</th>
                <th className="py-1.5 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.serviceId} className="border-b last:border-b-0">
                  <td className="py-1.5">{s.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.bookings}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{fmtMoney(s.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-secondary/30 p-4 print:bg-transparent print:border print:rounded-none">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
