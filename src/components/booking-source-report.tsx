import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function BookingSourceReport({ businessId }: { businessId: string }) {
  const report = useQuery({
    queryKey: ["booking-source-report", businessId],
    enabled: !!businessId,
    retry: false,
    queryFn: async () => {
      const db = supabase as unknown as {
        rpc: (
          name: string,
          args: { p_business_id: string },
        ) => Promise<{ data: unknown; error: Error | null }>;
      };
      const { data, error } = await db.rpc("booking_source_report", {
        p_business_id: businessId,
      });
      if (error) throw error;
      return data as { source: string; booking_count: number }[];
    },
  });
  return (
    <section
      className="rounded-xl border bg-card p-4 space-y-3"
      aria-label="Bookings by source"
    >
      <div>
        <h3 className="text-sm font-semibold">Where bookings come from</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Confirmed bookings created in the last 30 days, including visits now
          in progress or completed.
        </p>
      </div>
      {report.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading booking sources…
        </p>
      ) : report.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Booking sources are unavailable. This report needs the latest
            database update and an owner account.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void report.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-2">
          {[
            ["google", "Google"],
            ["instagram", "Instagram"],
            ["unattributed", "Other / unattributed"],
          ].map(([source, label]) => (
            <div
              key={source}
              className="rounded-lg bg-secondary/40 p-3 flex items-center justify-between gap-3"
            >
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {Number(
                  report.data?.find((row) => row.source === source)
                    ?.booking_count ?? 0,
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        These are bookings, not link clicks or a conversion rate. Google and
        Instagram reflect the labelled booking link used, not independently
        verified referrals. Other includes unlabelled, manual and older
        bookings. Pending, cancelled and no-show appointments are excluded. No
        tracking cookies are used.
      </p>
    </section>
  );
}
