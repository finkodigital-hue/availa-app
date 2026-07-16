import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, CalendarCheck, TrendingUp } from "lucide-react";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { fmtMoney } from "@/lib/format";
import {
  fetchBookingsInRange,
  aggregateStaffPerformance,
  aggregateServicePerformance,
  computeTotals,
  pctDelta,
} from "@/lib/reports";
import { presetRange, comparisonRange, fmtRange, type DatePreset, type CompareMode } from "@/lib/report-dates";
import { ReportDateRangePicker } from "@/components/reports/date-range-picker";
import { StaffEarningsTable } from "@/components/reports/staff-earnings-table";
import { ServicesBreakdownTable } from "@/components/reports/services-breakdown-table";
import { PeriodSummary } from "@/components/reports/period-summary";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const currency = biz?.currency ?? "USD";

  const [{ from, to, preset }, setRange] = useState<{ from: Date; to: Date; preset: DatePreset }>(() => ({
    ...presetRange("this_month"),
    preset: "this_month",
  }));
  const [compareMode, setCompareMode] = useState<CompareMode>("previous_period");

  const { from: prevFrom, to: prevTo } = useMemo(
    () => comparisonRange(from, to, compareMode),
    [from, to, compareMode],
  );

  const { data: current, isLoading } = useQuery({
    queryKey: ["report-bookings", bid, from.toISOString(), to.toISOString()],
    enabled: !!bid,
    queryFn: () => fetchBookingsInRange(bid!, from, to),
  });

  const { data: previous, isLoading: prevLoading } = useQuery({
    queryKey: ["report-bookings", bid, prevFrom.toISOString(), prevTo.toISOString()],
    enabled: !!bid,
    queryFn: () => fetchBookingsInRange(bid!, prevFrom, prevTo),
  });

  const totals = useMemo(() => computeTotals(current ?? []), [current]);
  const prevTotals = useMemo(() => computeTotals(previous ?? []), [previous]);
  const staff = useMemo(() => aggregateStaffPerformance(current ?? []), [current]);
  const services = useMemo(() => aggregateServicePerformance(current ?? []), [current]);

  const revenueTrend = pctDelta(totals.revenue, prevTotals.revenue);
  const bookingsTrend = pctDelta(totals.bookings, prevTotals.bookings);
  const avgTrend = pctDelta(totals.avg, prevTotals.avg);

  const rangeSlug = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;
  const compareLabel = compareMode === "same_period_last_year" ? "Same period last year" : "Previous period";
  const loading = isLoading || prevLoading;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        subtitle="Deep-dive numbers and exports for your accountant, payroll, or your own records."
        action={<ReportDateRangePicker from={from} to={to} preset={preset} onChange={setRange} />}
      />

      {/* Period comparison */}
      <div className="print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-2xl tracking-tight">Period comparison</h2>
          <div className="inline-flex rounded-xl border bg-card p-0.5">
            {(["previous_period", "same_period_last_year"] as CompareMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setCompareMode(m)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  compareMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "previous_period" ? "vs previous period" : "vs last year"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            accent
            loading={loading}
            icon={DollarSign}
            label="Revenue"
            value={fmtMoney(totals.revenue, currency)}
            trend={revenueTrend ?? undefined}
            hint={`${compareLabel}: ${fmtMoney(prevTotals.revenue, currency)}`}
          />
          <StatCard
            loading={loading}
            icon={CalendarCheck}
            label="Bookings"
            value={totals.bookings}
            trend={bookingsTrend ?? undefined}
            hint={`${compareLabel}: ${prevTotals.bookings}`}
          />
          <StatCard
            loading={loading}
            icon={TrendingUp}
            label="Avg booking value"
            value={fmtMoney(totals.avg, currency)}
            trend={avgTrend ?? undefined}
            hint={`${compareLabel}: ${fmtMoney(prevTotals.avg, currency)}`}
          />
        </div>

        {!isLoading && (current?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            No bookings in {fmtRange(from, to)} — figures above are zero for this range.
          </p>
        )}
      </div>

      {/* Staff earnings */}
      <div className="mt-6 print:hidden">
        <StaffEarningsTable staff={staff} currency={currency} rangeLabel={rangeSlug} />
      </div>

      {/* Services breakdown */}
      <div className="mt-4 print:hidden">
        <ServicesBreakdownTable services={services} currency={currency} rangeLabel={rangeSlug} />
      </div>

      {/* End-of-period summary (the print/PDF target) */}
      <div className="mt-6">
        <PeriodSummary
          businessName={biz?.name ?? "Your business"}
          from={from}
          to={to}
          totals={totals}
          prevTotals={prevTotals}
          compareLabel={compareLabel}
          staff={staff}
          services={services}
          currency={currency}
        />
      </div>
    </div>
  );
}
