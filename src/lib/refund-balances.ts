type Payment = { stripe_payment_intent_id: string | null; amount_cents: number };

/** Only confirmed ledger refunds reduce the remaining refundable amount. */
export function refundableCharges(charges: Payment[], refunds: Payment[]) {
  return charges.filter(charge => charge.stripe_payment_intent_id).map(charge => {
    const refunded = refunds.filter(refund => refund.stripe_payment_intent_id === charge.stripe_payment_intent_id)
      .reduce((total, refund) => total + refund.amount_cents, 0);
    if (!Number.isSafeInteger(charge.amount_cents) || charge.amount_cents <= 0 ||
      refunds.some(refund => !Number.isSafeInteger(refund.amount_cents) || refund.amount_cents <= 0) ||
      refunded > charge.amount_cents) throw new Error("The payment ledger needs review before refunding.");
    return { paymentIntentId: charge.stripe_payment_intent_id!, amountCents: charge.amount_cents - refunded };
  }).filter(charge => charge.amountCents > 0);
}
