import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Wallet, Undo2, Plus } from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/format";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  classifyReceipt,
  getDailyTakings,
  getUnpaidBookings,
  recordManualReceipt,
} from "@/lib/takings.functions";
import {
  businessDay,
  PAYMENT_METHODS,
  summariseTakings,
  type PaymentMethod,
} from "@/lib/takings";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const manualMethods = Object.entries(PAYMENT_METHODS).filter(
  ([key]) => key !== "unknown",
);

export function DailyTakings({
  businessId,
  currency,
  timezone,
}: {
  businessId: string;
  currency: string;
  timezone: string;
}) {
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [today, setToday] = useState(() => businessDay(timezone));
  const [recording, setRecording] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    const update = () => setToday(businessDay(timezone));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [timezone]);
  const day = chosenDay ?? today;
  const query = useQuery({
    queryKey: ["daily-takings", businessId, day],
    queryFn: async () =>
      getDailyTakings({
        data: { day },
        headers: await getServerFnAuthHeaders(),
      }),
    refetchInterval: 60_000,
  });
  const currencies = [
    ...new Set([
      currency.toUpperCase(),
      ...(query.data?.rows.map((row) => row.currency) ?? []),
    ]),
  ];
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["daily-takings"] }),
      qc.invalidateQueries({ queryKey: ["payments"] }),
      qc.invalidateQueries({ queryKey: ["takings-unpaid"] }),
      qc.invalidateQueries({ queryKey: ["bookings"] }),
    ]);
  };
  const classify = async (id: string, method: string) => {
    setClassifying(id);
    try {
      await classifyReceipt({
        data: { id, method },
        headers: await getServerFnAuthHeaders(),
      });
      await refresh();
      toast.success("Payment method saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save payment method.",
      );
    } finally {
      setClassifying(null);
    }
  };

  return (
    <section className="space-y-6 pt-4" aria-label="Daily takings">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="takings-date">Payment date</Label>
            <Input
              id="takings-date"
              type="date"
              value={day}
              onChange={(event) => {
                if (event.target.value) setChosenDay(event.target.value);
              }}
              className="w-auto"
            />
          </div>
          <Button variant="outline" onClick={() => setChosenDay(null)}>
            Today
          </Button>
        </div>
        <Button onClick={() => setRecording(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record payment
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Payments received on {day === today ? "today’s date" : day}, using{" "}
        {query.data?.timezone ?? timezone} time. Amounts are before processing
        fees; bank payouts arrive separately.
      </p>
      {query.isError ? (
        <div role="alert" className="rounded-xl border p-5 space-y-3">
          <p>
            We couldn’t load daily takings. Your figures have not been replaced
            with zeroes.
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {currencies.map((unit) => {
            const totals = summariseTakings(query.data?.rows ?? [], unit);
            return (
              <div className="space-y-3" key={unit}>
                {currencies.length > 1 && (
                  <h2 className="font-medium">{unit} payments</h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard
                    accent
                    icon={Wallet}
                    label="Total received"
                    value={fmtMoney(totals.received, unit)}
                    loading={query.isPending}
                  />
                  <StatCard
                    icon={Banknote}
                    label="Cash"
                    value={fmtMoney(totals.byMethod.cash, unit)}
                    hint="After cash refunds"
                    loading={query.isPending}
                  />
                  <StatCard
                    icon={CreditCard}
                    label="Card"
                    value={fmtMoney(totals.byMethod.card, unit)}
                    hint="Online and recorded terminal payments, after refunds"
                    loading={query.isPending}
                  />
                  <StatCard
                    icon={Undo2}
                    label="Net takings"
                    value={fmtMoney(totals.net, unit)}
                    hint={`Refunds: ${fmtMoney(totals.refunds, unit)}`}
                    loading={query.isPending}
                  />
                </div>
                {!query.isPending && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span>
                      Bank transfer:{" "}
                      {fmtMoney(totals.byMethod.bank_transfer, unit)}
                    </span>
                    <span>Other: {fmtMoney(totals.byMethod.other, unit)}</span>
                    <span>
                      Unclassified: {fmtMoney(totals.byMethod.unknown, unit)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {!query.isPending && (
            <div className="rounded-xl border overflow-hidden">
              <div className="border-b px-4 py-3 font-medium">
                Payments and refunds
              </div>
              {!query.data?.rows.length ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No recorded payments or refunds for this date.
                </p>
              ) : (
                <ul className="divide-y">
                  {query.data.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">
                          {row.customerName ?? "Customer"}
                          {row.type === "refund" ? " · Refund" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleTimeString("en-GB", {
                            timeZone: query.data.timezone,
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {PAYMENT_METHODS[row.method]}
                          {row.description === "Gift card purchase" &&
                            " · Gift card purchase"}
                        </p>
                      </div>
                      {row.method === "unknown" && row.type === "charge" && (
                        <select
                          aria-label={`Payment method for ${row.customerName ?? "customer"}`}
                          className={`${selectClass} max-w-44`}
                          value=""
                          disabled={classifying !== null}
                          onChange={(event) =>
                            void classify(row.id, event.target.value)
                          }
                        >
                          <option value="" disabled>
                            Choose method
                          </option>
                          {manualMethods.map(([key, label]) => (
                            <option value={key} key={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="font-medium tabular-nums">
                        {row.type === "refund" ? "−" : ""}
                        {fmtMoney(row.amountCents, row.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Older payments marked as paid without a dated receipt aren’t included
        here. Payments recorded with a new booking appear as unclassified until
        you choose their method. Gift-card redemptions aren’t new cash or card
        receipts.
      </p>
      {recording && (
        <RecordPayment
          businessId={businessId}
          currency={currency}
          timezone={timezone}
          onClose={() => setRecording(false)}
          onSaved={async () => {
            setChosenDay(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}

function RecordPayment({
  businessId,
  currency,
  timezone,
  onClose,
  onSaved,
}: {
  businessId: string;
  currency: string;
  timezone: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] =
    useState<Exclude<PaymentMethod, "unknown">>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retrying an uncertain request reuses its key; edits create a new request.
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const bookings = useQuery({
    queryKey: ["takings-unpaid", businessId, debounced],
    queryFn: async () =>
      getUnpaidBookings({
        data: { search: debounced },
        headers: await getServerFnAuthHeaders(),
      }),
  });
  const selected = bookings.data?.find((row) => row.id === bookingId);
  const amountCents = Math.round(Number(amount) * 100);
  const valid =
    selected &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    amountCents > 0 &&
    amountCents <= selected.remaining_cents;
  const submit = async () => {
    if (!valid || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError(null);
    const payload = JSON.stringify({
      bookingId,
      amountCents,
      method,
      currency,
    });
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      await recordManualReceipt({
        data: {
          bookingId,
          amountCents,
          method,
          currency,
          key: attempt.current.key,
        },
        headers: await getServerFnAuthHeaders(),
      });
      toast.success("Payment recorded.");
      await onSaved();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not record payment. Try again.",
      );
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record payment received</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Use this for money you’ve already received in cash, by bank transfer
          or on a separate card machine. Bookzenvo’s online Stripe payments
          appear automatically. This doesn’t charge the customer.
        </p>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="receipt-search">Find customer</Label>
            <Input
              id="receipt-search"
              value={search}
              maxLength={100}
              disabled={submitting}
              onChange={(event) => {
                setSearch(event.target.value);
                setBookingId("");
              }}
              placeholder="Search by customer name"
            />
          </div>
          {bookings.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn’t load bookings.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void bookings.refetch()}
              >
                Try again
              </button>
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="receipt-booking">
                Booking with an unpaid balance
              </Label>
              <select
                id="receipt-booking"
                className={selectClass}
                value={bookingId}
                disabled={
                  submitting || bookings.isFetching || search !== debounced
                }
                onChange={(event) => {
                  setBookingId(event.target.value);
                  const row = bookings.data?.find(
                    (b) => b.id === event.target.value,
                  );
                  setAmount(row ? (row.remaining_cents / 100).toFixed(2) : "");
                }}
              >
                <option value="">
                  {bookings.isPending ? "Loading…" : "Choose booking"}
                </option>
                {bookings.data?.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.customer_name} ·{" "}
                    {new Date(row.starts_at).toLocaleDateString("en-GB", {
                      timeZone: timezone,
                    })}{" "}
                    · {fmtMoney(row.remaining_cents, currency)} due
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {bookings.data?.length === 0
                  ? "No matching unpaid bookings."
                  : "Shows up to 50 bookings. Search by name to find older bookings."}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="receipt-method">Payment method</Label>
              <select
                id="receipt-method"
                className={selectClass}
                value={method}
                disabled={submitting}
                onChange={(event) =>
                  setMethod(event.target.value as typeof method)
                }
              >
                {manualMethods.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt-amount">Amount ({currency})</Label>
              <Input
                id="receipt-amount"
                inputMode="decimal"
                value={amount}
                disabled={submitting}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Recorded at the current date and time. You can record part of a
            balance, then add the rest using another payment method.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={!valid || submitting}
          >
            {submitting ? "Recording…" : "Record payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
