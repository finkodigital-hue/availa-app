import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  deposit_paid: "Deposit paid",
  unpaid: "Unpaid",
  pending: "Pending",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  failed: "Failed",
};

function PaymentsPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", bid],
    enabled: !!bid,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, customer_name, price_cents, payment_status, amount_paid_cents, starts_at, services(name)")
        .eq("business_id", bid!)
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      // amount_paid_cents is the source of truth for money actually
      // collected, but older bookings marked "paid" before it was tracked
      // may still have it at 0 — treat "paid" as the full price collected
      // at minimum so those don't show as $0.
      const collectedFor = (b: any) =>
        b.payment_status === "paid"
          ? Math.max(b.amount_paid_cents ?? 0, b.price_cents ?? 0)
          : (b.amount_paid_cents ?? 0);
      const monthly = (data ?? []).filter((b: any) => new Date(b.starts_at) >= monthStart);
      const collected = monthly.reduce((a, b: any) => a + collectedFor(b), 0);
      const outstanding = (data ?? [])
        .filter((b: any) => b.payment_status !== "refunded")
        .reduce((a, b: any) => a + Math.max(0, (b.price_cents ?? 0) - collectedFor(b)), 0);
      return { rows: (data ?? []).map((b: any) => ({ ...b, collected: collectedFor(b) })), collected, outstanding };
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
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(p)}
              onKeyDown={(e) => e.key === "Enter" && setSelected(p)}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/40 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{p.customer_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.services?.name} · {new Date(p.starts_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <Badge
                variant={p.payment_status === "paid" ? "default" : p.payment_status === "refunded" ? "secondary" : "outline"}
              >
                {PAYMENT_STATUS_LABEL[p.payment_status ?? "unpaid"] ?? p.payment_status}
              </Badge>
              <div className="text-sm font-medium tabular-nums w-24 text-right">
                {fmtMoney(p.collected ?? 0)}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{selected?.customer_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service</span>
                <span className="font-medium">{selected.services?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {new Date(selected.starts_at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant={selected.payment_status === "paid" ? "default" : selected.payment_status === "refunded" ? "secondary" : "outline"}
                >
                  {PAYMENT_STATUS_LABEL[selected.payment_status ?? "unpaid"] ?? selected.payment_status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service price</span>
                <span className="font-medium tabular-nums">{fmtMoney(selected.price_cents ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collected</span>
                <span className="font-medium tabular-nums">{fmtMoney(selected.collected ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-medium tabular-nums">{fmtMoney(Math.max(0, (selected.price_cents ?? 0) - (selected.collected ?? 0)))}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
