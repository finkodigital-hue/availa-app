import { Download, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import type { ServicePerformance } from "@/lib/reports";

export function ServicesBreakdownTable({
  services,
  currency,
  rangeLabel,
}: {
  services: ServicePerformance[];
  currency: string;
  rangeLabel: string;
}) {
  const exportCsv = () => {
    downloadCsv(
      `services-breakdown-${rangeLabel}`,
      services.map((s) => ({
        Service: s.name,
        Bookings: s.bookings,
        "Revenue ($)": (s.revenue / 100).toFixed(2),
        "List price ($)": (s.price / 100).toFixed(2),
      })),
    );
  };

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-xl">Services breakdown</h3>
          <p className="text-xs text-muted-foreground">Revenue and booking count per service for the selected range.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={services.length === 0}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {services.length === 0 ? (
        <EmptyState icon={Scissors} title="No services booked" description="No bookings were recorded in this range." />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                <th className="px-2 py-2 font-medium">Service</th>
                <th className="px-2 py-2 font-medium text-right">Bookings</th>
                <th className="px-2 py-2 font-medium text-right">List price</th>
                <th className="px-2 py-2 font-medium text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.serviceId} className="border-b last:border-b-0 hover:bg-secondary/30">
                  <td className="px-2 py-2.5 font-medium truncate">{s.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{s.bookings}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmtMoney(s.price, currency)}</td>
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
