import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, RefreshCcw, Undo2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtMoney as formatMoney } from "@/lib/format";
import { refundBooking } from "@/lib/stripe-connect.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

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
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [refundConfirming, setRefundConfirming] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundResults, setRefundResults] = useState<Array<{ paymentIntentId: string; amountCents: number; ok: boolean; error?: string }> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payments", bid],
    enabled: !!bid,
    queryFn: async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, customer_name, price_cents, payment_status, amount_paid_cents, amount_refunded_cents, starts_at, services(name)")
        .eq("business_id", bid!)
        .neq("status", "cancelled")
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

  const closeDetail = () => {
    setSelected(null);
    setRefundConfirming(false);
    setRefundResults(null);
  };

  const refundableFor = (b: any) => Math.max(0, (b?.amount_paid_cents ?? 0) - (b?.amount_refunded_cents ?? 0));

  const submitRefund = async () => {
    if (!selected) return;
    setRefundSubmitting(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const { results } = await refundBooking({ data: { bookingId: selected.id }, headers });
      qc.invalidateQueries({ queryKey: ["payments", bid] });
      if (results.every((r) => r.ok)) {
        toast.success(`Refund submitted for ${fmtMoney(results.reduce((a, r) => a + r.amountCents, 0))}.`);
        closeDetail();
      } else {
        // Partial or full failure — keep the dialog open and show exactly what
        // went through and what didn't, rather than a toast that disappears.
        setRefundConfirming(false);
        setRefundResults(results);
      }
    } catch (error: any) {
      toast.error(error.message ?? "Could not start the refund.");
    } finally {
      setRefundSubmitting(false);
    }
  };

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
              onClick={() => { setSelected(p); setRefundConfirming(false); setRefundResults(null); }}
              onKeyDown={(e) => e.key === "Enter" && (setSelected(p), setRefundConfirming(false), setRefundResults(null))}
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{selected?.customer_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
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

              {refundResults ? (
                <div className="pt-3 border-t space-y-2">
                  <div className="text-sm font-medium">
                    {refundResults.every((r) => r.ok) ? "Refund submitted" : "Refund partially went through"}
                  </div>
                  <div className="space-y-1.5">
                    {refundResults.map((r) => (
                      <div key={r.paymentIntentId} className="flex items-start gap-2 text-sm">
                        {r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="tabular-nums">{fmtMoney(r.amountCents)} {r.ok ? "refunded" : "failed"}</div>
                          {!r.ok && r.error && <div className="text-xs text-muted-foreground">{r.error}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!refundResults.every((r) => r.ok) && (
                    <p className="text-xs text-muted-foreground">
                      The amount that failed hasn't been touched — nothing was double-charged or double-refunded. Retry to finish the rest.
                    </p>
                  )}
                </div>
              ) : refundConfirming ? (
                <div className="pt-3 border-t space-y-3">
                  <p className="text-sm">
                    Refund <span className="font-medium tabular-nums">{fmtMoney(refundableFor(selected))}</span> to{" "}
                    <span className="font-medium">{selected.customer_name}</span>? It goes back to their original payment
                    method. This does not cancel the booking.
                  </p>
                </div>
              ) : null}
            </div>
            <DialogFooter className="flex-wrap gap-2">
              {refundResults ? (
                <>
                  {!refundResults.every((r) => r.ok) && (
                    <Button onClick={submitRefund} disabled={refundSubmitting}>
                      {refundSubmitting ? "Retrying…" : "Retry failed refund"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={closeDetail}>Close</Button>
                </>
              ) : refundConfirming ? (
                <>
                  <Button variant="ghost" onClick={() => setRefundConfirming(false)} disabled={refundSubmitting}>Cancel</Button>
                  <Button onClick={submitRefund} disabled={refundSubmitting}>
                    {refundSubmitting ? "Refunding…" : `Refund ${fmtMoney(refundableFor(selected))}`}
                  </Button>
                </>
              ) : (
                <>
                  {refundableFor(selected) > 0 && (
                    <Button variant="outline" onClick={() => setRefundConfirming(true)}>
                      <Undo2 className="h-4 w-4 mr-1.5" /> Refund
                    </Button>
                  )}
                  <Button variant="ghost" onClick={closeDetail}>Close</Button>
                </>
              )}
            </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
