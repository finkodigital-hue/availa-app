import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, RefreshCcw } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { getDailyTakings } from "@/lib/reports";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

export function DailyTakings({ businessId }: { businessId?: string }) {
  const report = useQuery({
    queryKey: ["daily-takings", businessId],
    enabled: !!businessId,
    queryFn: async () =>
      getDailyTakings({ headers: await getServerFnAuthHeaders() }),
  });

  return (
    <section
      className="mt-6 print:hidden"
      aria-labelledby="daily-takings-title"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2
            id="daily-takings-title"
            className="font-display text-2xl tracking-tight"
          >
            Today’s takings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Money recorded today, split by payment method. Refunds count on the
            day they were recorded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void report.refetch()}
          disabled={report.isFetching}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm disabled:opacity-50"
        >
          <RefreshCcw
            className={`h-4 w-4 ${report.isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {report.isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-4 text-sm"
        >
          Today’s payment ledger could not be loaded. No amount has been shown
          as zero; refresh before using the figure.
        </div>
      ) : (
        <div className="space-y-3" aria-busy={report.isLoading}>
          {(report.data?.currencies ?? []).map((entry) => (
            <div
              key={entry.currency}
              className="rounded-2xl border bg-card p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-4 border-b pb-3">
                <span className="font-medium">
                  Net recorded · {entry.currency}
                </span>
                <span className="text-xl font-semibold tabular-nums">
                  {fmtMoney(entry.total.net, entry.currency)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MethodRow
                  icon={CreditCard}
                  label="Card"
                  values={entry.card}
                  currency={entry.currency}
                />
                <MethodRow
                  icon={Banknote}
                  label="Cash"
                  values={entry.cash}
                  currency={entry.currency}
                />
                {entry.other && (
                  <MethodRow
                    icon={Banknote}
                    label="Other / unclassified"
                    values={entry.other}
                    currency={entry.currency}
                  />
                )}
              </div>
              {entry.total.refunded > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Received {fmtMoney(entry.total.received, entry.currency)} ·
                  refunds {fmtMoney(entry.total.refunded, entry.currency)}
                </p>
              )}
            </div>
          ))}
          {report.isLoading && (
            <div className="h-32 animate-pulse rounded-2xl border bg-secondary/40" />
          )}
          {report.data && (
            <p className="text-xs text-muted-foreground">
              Day boundary: {report.data.timeZone}. This uses successful payment
              ledger entries, not appointment prices or Stripe payout dates.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function MethodRow({
  icon: Icon,
  label,
  values,
  currency,
}: {
  icon: typeof CreditCard;
  label: string;
  values: { received: number; refunded: number; net: number };
  currency: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/40 p-3">
      <span className="inline-flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4" /> {label}
      </span>
      <span className="text-sm font-medium tabular-nums">
        {fmtMoney(values.net, currency)}
      </span>
    </div>
  );
}
