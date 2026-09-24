import { useRef, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { startBalanceCheckout } from "@/lib/stripe-connect.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

/** Keep the appointment open. Only the database can confirm payment. */
export function BookingBalanceCheckout({
  bookingId,
  businessId,
  disabled,
  onUpdated,
}: {
  bookingId: string;
  businessId: string;
  disabled?: boolean;
  onUpdated: (booking: Record<string, unknown>) => void;
}) {
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);

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
      <p className="text-sm font-medium">Remaining payment</p>
      <p className="text-xs text-muted-foreground">
        The customer approves payment in secure Stripe Checkout. Opening the
        link does not mark this visit as paid.
      </p>
      <div className="flex flex-wrap gap-2">
        {!checkoutUrl ? (
          <Button disabled={busy || disabled} onClick={() => void run(true)}>
            <CreditCard className="mr-1.5 h-4 w-4" />
            {busy ? "Preparing payment…" : "Prepare payment"}
          </Button>
        ) : (
          <Button asChild>
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
              Open secure payment <ExternalLink className="ml-1.5 h-4 w-4" />
              <span className="sr-only"> (new tab)</span>
            </a>
          </Button>
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
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
