import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["payments", bid],
    enabled: !!bid,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, customer_name, price_cents, paid_amount_cents, payment_status, starts_at, services(name)")
        .eq("business_id", bid!)
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const monthly = (data ?? []).filter((b: any) => new Date(b.starts_at) >= monthStart);
      const collected = monthly.reduce((a, b: any) => a + (b.paid_amount_cents ?? 0), 0);
      const outstanding = (data ?? [])
        .filter((b: any) => b.payment_status !== "paid" && b.payment_status !== "refunded")
        .reduce((a, b: any) => a + Math.max(0, (b.price_cents ?? 0) - (b.paid_amount_cents ?? 0)), 0);
      return { rows: data ?? [], collected, outstanding };
    },
  });

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader eyebrow="Money" title="Payments" subtitle="All transactions in one place." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatCard accent loading={isLoading} icon={CreditCard} label="Collected this month" value={fmtMoney(data?.collected ?? 0)} />
        <StatCard loading={isLoading} icon={RefreshCcw} label="Outstanding" value={fmtMoney(data?.outstanding ?? 0)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments yet"
          description="Connect Stripe in Settings to start collecting deposits and full payments on your booking page."
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden divide-y">
          {data!.rows.map((p: any) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/40">
              <div className="min-w-0">
                <div className="font-medium truncate">{p.customer_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.services?.name} · {new Date(p.starts_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <Badge
                variant={p.payment_status === "paid" ? "default" : p.payment_status === "refunded" ? "secondary" : "outline"}
                className="capitalize"
              >
                {p.payment_status ?? "unpaid"}
              </Badge>
              <div className="text-sm font-medium tabular-nums w-24 text-right">{fmtMoney(p.paid_amount_cents ?? 0)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
