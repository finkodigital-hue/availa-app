export const PAYMENT_METHODS = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
  unknown: "Unclassified",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;
export type TakingsReceipt = {
  id: string;
  bookingId: string | null;
  customerName: string | null;
  amountCents: number;
  currency: string;
  type: "charge" | "refund";
  method: PaymentMethod;
  createdAt: string;
  description: string | null;
};
export type DailyTakings = { rows: TakingsReceipt[]; timezone: string };
export type UnpaidBooking = {
  id: string;
  customer_name: string;
  starts_at: string;
  remaining_cents: number;
};

export function businessDay(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Group currencies instead of treating e.g. USD receipts as GBP after a setting change.
export function summariseTakings(rows: TakingsReceipt[], currency: string) {
  const byMethod: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    bank_transfer: 0,
    other: 0,
    unknown: 0,
  };
  let received = 0;
  let refunds = 0;
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const signed = row.type === "refund" ? -row.amountCents : row.amountCents;
    byMethod[row.method] += signed;
    if (row.type === "refund") refunds += row.amountCents;
    else received += row.amountCents;
  }
  return { received, refunds, net: received - refunds, byMethod };
}
