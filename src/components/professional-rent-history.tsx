import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { collectRequestPages } from "@/lib/appointment-waitlist";
import { fmtMoney } from "@/lib/format";
import { rentDateLabel, rentStatus, rentToday } from "@/lib/rent";

export function ProfessionalRentHistory({
  linkId,
  timeZone,
}: {
  linkId: string;
  timeZone: string;
}) {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["professional-rent-history", linkId],
    queryFn: () =>
      collectRequestPages<any>((from, to) =>
        supabase
          .from("rent_payments")
          .select(
            "id,period_start,period_end,amount_cents,currency,status,due_date,paid_at",
          )
          .eq("salon_professional_id", linkId)
          .order("period_start", { ascending: false })
          .order("id")
          .range(from, to),
      ),
  });
  return (
    <div className="mt-5 border-t pt-4">
      <h4 className="font-medium">Rent history</h4>
      <p className="text-xs text-muted-foreground mt-1">
        Entries recorded by the salon. Payments are handled outside Bookzenvo.
        Period end dates are not included.
      </p>
      {isLoading && <p className="text-sm mt-3">Loading rent history…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-3">
          Rent history could not load. Please refresh.
        </p>
      )}
      {!isLoading && !error && data.length === 0 && (
        <p className="text-sm text-muted-foreground mt-3">
          No rent entries recorded.
        </p>
      )}
      <ul className="divide-y mt-3">
        {data.map((row) => (
          <li
            key={row.id}
            className="py-3 flex flex-wrap justify-between gap-2 text-sm"
          >
            <div>
              {rentDateLabel(row.period_start)} –{" "}
              {rentDateLabel(row.period_end)}
              <p className="text-xs text-muted-foreground">
                Due {rentDateLabel(row.due_date)}
              </p>
            </div>
            <div className="text-right">
              <p>
                {row.currency
                  ? fmtMoney(row.amount_cents, row.currency)
                  : `${(row.amount_cents / 100).toFixed(2)} (currency not recorded)`}
              </p>
              <span className="capitalize text-xs text-muted-foreground">
                {rentStatus(row, rentToday(timeZone))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
