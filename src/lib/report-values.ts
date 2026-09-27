export type CollectedAmounts = {
  amount_paid_cents: number | null;
  amount_refunded_cents: number | null;
};

/** Net money retained for an appointment after any recorded refunds. */
export function netCollected(booking: CollectedAmounts) {
  return Math.max(
    0,
    (booking.amount_paid_cents ?? 0) - (booking.amount_refunded_cents ?? 0),
  );
}

export function displayedBookingCollection(
  booking: CollectedAmounts & {
    payment_status?: string | null;
    price_cents?: number | null;
  },
) {
  const gross =
    booking.payment_status === "paid"
      ? Math.max(booking.amount_paid_cents ?? 0, booking.price_cents ?? 0)
      : (booking.amount_paid_cents ?? 0);
  return Math.max(0, gross - (booking.amount_refunded_cents ?? 0));
}

export type PaymentLedgerRow = {
  type: "charge" | "refund" | "failure" | string;
  status: string;
  amount_cents: number;
  currency: string;
  payment_method: "card" | "cash" | string;
};

export type DailyTakingsCurrency = {
  currency: string;
  card: { received: number; refunded: number; net: number };
  cash: { received: number; refunded: number; net: number };
  total: { received: number; refunded: number; net: number };
};

/**
 * Summarise money actually recorded in the payment ledger during a day.
 * Failed/pending rows are deliberately excluded and refunds are kept on the
 * day they happened. A day can therefore have a negative net figure.
 */
export function aggregateDailyTakings(
  rows: PaymentLedgerRow[],
  defaultCurrency?: string,
): DailyTakingsCurrency[] {
  const currencies = new Map<string, DailyTakingsCurrency>();
  const ensure = (rawCurrency: string) => {
    const currency = rawCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new Error("Payment ledger contains an unsupported currency.");
    let value = currencies.get(currency);
    if (!value) {
      value = {
        currency,
        card: { received: 0, refunded: 0, net: 0 },
        cash: { received: 0, refunded: 0, net: 0 },
        total: { received: 0, refunded: 0, net: 0 },
      };
      currencies.set(currency, value);
    }
    return value;
  };

  if (defaultCurrency) ensure(defaultCurrency);
  for (const row of rows) {
    if (row.status !== "succeeded" || !["charge", "refund"].includes(row.type))
      continue;
    if (!Number.isSafeInteger(row.amount_cents) || row.amount_cents < 0)
      throw new Error("Payment ledger contains an invalid amount.");
    if (row.payment_method !== "card" && row.payment_method !== "cash")
      throw new Error("Payment ledger contains an unsupported payment method.");
    const value = ensure(row.currency);
    const method = value[row.payment_method];
    if (row.type === "charge") method.received += row.amount_cents;
    else method.refunded += row.amount_cents;
  }

  for (const value of currencies.values()) {
    for (const method of [value.card, value.cash])
      method.net = method.received - method.refunded;
    value.total.received = value.card.received + value.cash.received;
    value.total.refunded = value.card.refunded + value.cash.refunded;
    value.total.net = value.total.received - value.total.refunded;
  }
  return Array.from(currencies.values()).sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}
