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
