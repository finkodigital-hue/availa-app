import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  RefreshCw,
  Radio,
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
import {
  cancelTerminalPayment,
  createTestTerminalReader,
  getTerminalPaymentStatus,
  listTerminalReaders,
  startTerminalPayment,
  type TerminalReaderSummary,
} from "@/lib/terminal.functions";

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
  const [readers, setReaders] = useState<TerminalReaderSummary[]>([]);
  const [readerId, setReaderId] = useState("");
  const [canCreateSimulator, setCanCreateSimulator] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalMessage, setTerminalMessage] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const terminalRequest = useRef<string | null>(null);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    void (async () => {
      try {
        const headers = await getServerFnAuthHeaders();
        const result = await listTerminalReaders({ headers });
        if (!active) return;
        setReaders(result.readers);
        setReaderId((current) => current || result.readers[0]?.id || "");
        setCanCreateSimulator(result.canCreateSimulator);
      } catch {
        // Reader controls stay hidden until Stripe Terminal is configured.
      }
    })();
    return () => {
      active = false;
    };
  }, [isOwner]);

  function applyTerminalResult(result: {
    attemptId: string;
    state: string;
    message?: string;
  }) {
    setAttemptId(result.attemptId);
    if (result.state === "succeeded") {
      setTerminalMessage(
        "Card payment confirmed by Stripe. This visit is paid.",
      );
      setAttemptId(null);
      terminalRequest.current = null;
      void refresh();
    } else if (result.state === "failed") {
      setTerminalMessage(
        result.message || "The card was not accepted. Try again.",
      );
      setAttemptId(null);
      terminalRequest.current = null;
    } else if (result.state === "canceled") {
      setTerminalMessage("Reader payment canceled. No payment was recorded.");
      setAttemptId(null);
      terminalRequest.current = null;
    } else if (result.state === "review") {
      setTerminalMessage(
        result.message ||
          "The result is uncertain. Check the same payment before trying again.",
      );
    } else {
      setTerminalMessage(
        "Present the card to the reader and follow its instructions.",
      );
    }
  }

  async function takeReaderPayment() {
    if (!readerId || terminalBusy || disabled) return;
    setTerminalBusy(true);
    setTerminalMessage("");
    terminalRequest.current ??= crypto.randomUUID();
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await startTerminalPayment({
        data: {
          bookingId,
          readerId,
          requestId: terminalRequest.current,
        },
        headers,
      });
      applyTerminalResult(result);
    } catch (error) {
      setTerminalMessage(
        error instanceof Error
          ? error.message
          : "The reader could not start the payment.",
      );
    } finally {
      setTerminalBusy(false);
    }
  }

  async function checkReaderPayment() {
    if (!attemptId || terminalBusy) return;
    setTerminalBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      applyTerminalResult(
        await getTerminalPaymentStatus({ data: { attemptId }, headers }),
      );
    } catch (error) {
      setTerminalMessage(
        error instanceof Error
          ? error.message
          : "Could not check the reader payment.",
      );
    } finally {
      setTerminalBusy(false);
    }
  }

  async function cancelReaderPayment() {
    if (!attemptId || terminalBusy) return;
    setTerminalBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      applyTerminalResult(
        await cancelTerminalPayment({ data: { attemptId }, headers }),
      );
    } catch (error) {
      setTerminalMessage(
        error instanceof Error
          ? error.message
          : "Could not cancel the reader payment.",
      );
    } finally {
      setTerminalBusy(false);
    }
  }

  async function addTestReader() {
    if (terminalBusy) return;
    setTerminalBusy(true);
    setTerminalMessage("Creating a free Stripe test reader…");
    try {
      const headers = await getServerFnAuthHeaders();
      const reader = await createTestTerminalReader({ data: {}, headers });
      setReaders((current) => [
        ...current.filter((r) => r.id !== reader.id),
        reader,
      ]);
      setReaderId(reader.id);
      setTerminalMessage(
        "Test reader ready. No hardware or live charge is involved.",
      );
    } catch (error) {
      setTerminalMessage(
        error instanceof Error
          ? error.message
          : "Could not create the test reader.",
      );
    } finally {
      setTerminalBusy(false);
    }
  }

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
        Choose cash, the salon card reader, or a secure payment link on the
        customer&apos;s phone.
      </p>
      {isOwner && (readers.length > 0 || canCreateSimulator) && (
        <div className="space-y-2 rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            {readers.length > 0 && (
              <select
                aria-label="Card reader"
                className="h-9 min-w-48 rounded-md border bg-background px-3 text-sm"
                value={readerId}
                disabled={terminalBusy || Boolean(attemptId)}
                onChange={(event) => setReaderId(event.target.value)}
              >
                {readers.map((reader) => (
                  <option key={reader.id} value={reader.id}>
                    {reader.label} · {reader.status}
                  </option>
                ))}
              </select>
            )}
            {readers.length > 0 && !attemptId && (
              <Button
                type="button"
                disabled={terminalBusy || disabled || amountDueCents <= 0}
                onClick={() => void takeReaderPayment()}
              >
                <Radio className="mr-1.5 h-4 w-4" />
                {terminalBusy ? "Starting reader…" : "Take card payment"}
              </Button>
            )}
            {attemptId && (
              <>
                <Button
                  type="button"
                  disabled={terminalBusy}
                  onClick={() => void checkReaderPayment()}
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  {terminalBusy ? "Checking…" : "Check reader"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={terminalBusy}
                  onClick={() => void cancelReaderPayment()}
                >
                  Cancel reader
                </Button>
              </>
            )}
            {readers.length === 0 && canCreateSimulator && (
              <Button
                type="button"
                variant="outline"
                disabled={terminalBusy}
                onClick={() => void addTestReader()}
              >
                <Radio className="mr-1.5 h-4 w-4" />
                {terminalBusy ? "Creating…" : "Create free test reader"}
              </Button>
            )}
          </div>
          {terminalMessage && (
            <p role="status" className="text-sm">
              {terminalMessage}
            </p>
          )}
        </div>
      )}
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
