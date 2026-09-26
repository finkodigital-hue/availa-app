import { useRef, useState } from "react";
import {
  Banknote,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startBalanceCheckout } from "@/lib/stripe-connect.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { useWorkspaceAccess } from "@/lib/business";
import { recordCashPayment } from "@/lib/cash-payment.functions";
import { fmtMoney } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

/** Keep the appointment open. Only the database can confirm payment. */
export function BookingBalanceCheckout({
  bookingId,
  businessId,
  amountDueCents,
  currency,
  disabled,
  onUpdated,
}: {
  bookingId: string;
  businessId: string;
  amountDueCents: number;
  currency: string;
  disabled?: boolean;
  onUpdated: (booking: Record<string, unknown>) => void;
}) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const { isOwner } = useWorkspaceAccess();
  const qc = useQueryClient();
  const [cashConfirming, setCashConfirming] = useState(false);
  const cashRequest = useRef<string | null>(null);

  async function receiveCash() {
    if (lock.current || disabled || !isOwner) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    cashRequest.current ??= crypto.randomUUID();
    try {
      const headers = await getServerFnAuthHeaders();
      const booking = await recordCashPayment({
        data: {
          bookingId,
          businessId,
          amountCents: amountDueCents,
          currency,
          requestId: cashRequest.current,
        },
        headers,
      });
      setCashConfirming(false);
      setCheckoutUrl(null);
      setMessage("Cash payment recorded. This visit is paid.");
      for (const key of [
        "payments",
        "payments-totals",
        "booking-payment-history",
        "calendar",
        "bookings-list",
        "dashboard-overview",
        "report-bookings",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      onUpdated(booking);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not confirm the cash payment. Retry to check the same payment.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function refresh() {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, payment_status, amount_paid_cents, price_cents, status")
      .eq("business_id", businessId)
      .eq("id", bookingId)
      .single();
    if (error) throw error;
    onUpdated(data);
    setMessage(
      data.payment_status === "paid"
        ? "Payment confirmed. You can now book the next visit."
        : "Payment is not confirmed yet. If the customer just paid, wait a moment and check again.",
    );
  }

  async function run(prepare: boolean) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (prepare) {
        const headers = await getServerFnAuthHeaders();
        const result = await startBalanceCheckout({
          data: { bookingId },
          headers,
        });
        if ("checkoutUrl" in result) {
          const url = new URL(result.checkoutUrl);
          if (
            url.protocol !== "https:" ||
            url.hostname !== "checkout.stripe.com"
          )
            throw new Error("The secure payment link could not be verified.");
          setCheckoutUrl(url.href);
          setCopied(false);
          setMessage(
            "Ready for customer approval. Your appointment stays open here.",
          );
        } else await refresh();
      } else await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not check payment. Please try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-3 rounded-xl border bg-secondary/30 p-3">
      <p className="text-sm font-medium">
        Remaining payment · {fmtMoney(amountDueCents, currency)}
      </p>
      <p className="text-xs text-muted-foreground">
        Choose how the customer is paying. For card payments, the customer
        approves payment in secure Stripe Checkout.
      </p>
      <div className="flex flex-wrap gap-2">
        {isOwner && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || disabled || amountDueCents <= 0}
            onClick={() => {
              setCashConfirming(true);
              setMessage("");
            }}
          >
            <Banknote className="mr-1.5 h-4 w-4" /> Cash
          </Button>
        )}
        {isOwner && (
          <Button
            asChild
            variant="outline"
            disabled={disabled || busy || cashConfirming}
          >
            <Link
              to="/gift-cards"
              search={{ bookingId }}
              aria-disabled={disabled || busy || cashConfirming}
              tabIndex={disabled || busy || cashConfirming ? -1 : undefined}
              onClick={(event) => {
                if (disabled || busy || cashConfirming) event.preventDefault();
              }}
            >
              <Gift className="mr-1.5 h-4 w-4" /> Apply gift card
            </Link>
          </Button>
        )}
        {!checkoutUrl ? (
          <Button
            disabled={busy || disabled || cashConfirming}
            onClick={() => void run(true)}
          >
            <CreditCard className="mr-1.5 h-4 w-4" />
            {busy ? "Preparing payment…" : "Prepare payment"}
          </Button>
        ) : (
          <>
            <Button asChild>
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                Open secure payment <ExternalLink className="ml-1.5 h-4 w-4" />
                <span className="sr-only"> (new tab)</span>
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(checkoutUrl);
                  setCopied(true);
                  setMessage(
                    "Link copied. Share it privately with this customer only.",
                  );
                } catch {
                  setCopied(false);
                  setMessage(
                    "Could not copy the link. Open it instead or try again.",
                  );
                }
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" />
              {copied ? "Copied" : "Copy payment link"}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={busy || disabled}
          onClick={() => void run(false)}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {busy ? "Please wait…" : "Check payment status"}
        </Button>
      </div>
      {cashConfirming && (
        <div className="space-y-2 rounded-lg border bg-background p-3">
          <p className="text-sm">
            Confirm you have received {fmtMoney(amountDueCents, currency)} in
            cash. This will mark the remaining balance as paid.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || disabled}
              onClick={() => void receiveCash()}
            >
              {busy
                ? "Recording…"
                : `Confirm ${fmtMoney(amountDueCents, currency)} cash received`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setCashConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
