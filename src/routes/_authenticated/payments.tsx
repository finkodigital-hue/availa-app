import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
const PAGE_SIZE = 50;
const TOTALS_BATCH_SIZE = 500;

const collectedFor = (booking: { payment_status?: string | null; amount_paid_cents?: number | null; price_cents?: number | null }) =>
  booking.payment_status === "paid"
    ? Math.max(booking.amount_paid_cents ?? 0, booking.price_cents ?? 0)
    : (booking.amount_paid_cents ?? 0);

function PaymentsPage() {
  const { data: biz } = useMyBusiness();
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const [refundConfirming, setRefundConfirming] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundResults, setRefundResults] = useState<Array<{ paymentIntentId: string; amountCents: number; ok: boolean; error?: string }> | null>(null);

  const refundReviews = useQuery({
    queryKey: ["stripe-refund-reviews", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { count, error } = await (supabase as any).from("stripe_refund_reviews")
        .select("stripe_refund_id", { count: "exact", head: true }).eq("business_id", bid).eq("manual_review", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["payments", bid, page],
    enabled: !!bid,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("bookings")
        .select("id, customer_name, price_cents, payment_status, amount_paid_cents, amount_refunded_cents, starts_at, services(name)", { count: "exact" })
        .eq("business_id", bid!)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []).map((b) => ({ ...b, collected: collectedFor(b) })), count: count ?? 0 };
    },
  });

  const { data: totals, isLoading: totalsLoading, isError: totalsError } = useQuery({
    queryKey: ["payments-totals", bid],
    enabled: !!bid,
    queryFn: async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const nextMonth = new Date(monthStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      let collected = 0;
      let outstanding = 0;
      // Fetch only the fields needed for totals in bounded batches. A single
      // Supabase request may otherwise silently stop at the API row limit.
      for (let offset = 0; ; offset += TOTALS_BATCH_SIZE) {
        const { data: batch, error } = await supabase
          .from("bookings")
          .select("id, starts_at, price_cents, payment_status, amount_paid_cents")
          .eq("business_id", bid!)
          .neq("status", "cancelled")
          .order("id", { ascending: true })
          .range(offset, offset + TOTALS_BATCH_SIZE - 1);
        if (error) throw error;
        for (const booking of batch ?? []) {
          const paid = collectedFor(booking);
          if (booking.starts_at >= monthStart.toISOString() && booking.starts_at < nextMonth.toISOString()) collected += paid;
          if (booking.payment_status !== "refunded") outstanding += Math.max(0, (booking.price_cents ?? 0) - paid);
        }
        if (!batch || batch.length < TOTALS_BATCH_SIZE) break;
      }
      return { collected, outstanding };
    },
  });
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);
  useEffect(() => {
    if (data && page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [data, page, totalPages]);

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
      qc.invalidateQueries({ queryKey: ["payments-totals", bid] });
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
      {refundReviews.isError && <p role="alert" className="mb-4 rounded-xl border p-4 text-sm">Refund review status could not be loaded. Check Stripe before retrying a refund.</p>}
      {(refundReviews.data ?? 0) > 0 && <p role="alert" className="mb-4 rounded-xl border border-amber-500 p-4 text-sm">{refundReviews.data} refund(s) need review. Stripe reported a failure, cancellation or required action. Check their current status and reconcile the payment with support before refunding again or restoring gift credit.</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <StatCard accent loading={totalsLoading} icon={CreditCard} label="Paid value of this month's visits" hint="Based on appointment dates, not payment settlement dates." value={totalsError ? "Unavailable" : fmtMoney(totals?.collected ?? 0)} />
        <StatCard loading={totalsLoading} icon={RefreshCcw} label="Outstanding" value={totalsError ? "Unavailable" : fmtMoney(totals?.outstanding ?? 0)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : isError ? (
        <EmptyState icon={CreditCard} title="Could not load payments" description="Please refresh and try again." />
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

      {!isLoading && !isError && (data?.count ?? 0) > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data!.count)} of {data!.count} bookings</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
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
                    {refundResults.every((r) => r.ok) ? "Refund submitted" : "Some refund requests need attention"}
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
                          <div className="tabular-nums">{fmtMoney(r.amountCents)} {r.ok ? "submitted" : "not accepted"}</div>
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
