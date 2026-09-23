type Attempt = {
  id: string; booking_id: string; business_id: string; amount_cents: number;
  currency: string; stripe_account_id: string; customer_email?: string;
  return_origin: string; business_slug: string; created_at: string;
  session_id?: string; state: string;
};
type Session = {
  id: string; status: string; payment_status: string; amount_total: number;
  currency: string; payment_intent?: string; url?: string;
  metadata?: Record<string, string>;
};

/** Every retry uses one immutable request. An uncertain old attempt is never
 * replaced merely because Stripe's idempotency retention may have elapsed. */
export async function openBalanceCheckout(businessId: string, bookingId: string, dependencies: {
  database: any; stripeFetch: typeof fetch; key: string; origin: string; now?: number;
}): Promise<{ checkoutUrl: string } | { paid: true }> {
  const { database: db, stripeFetch, key, origin } = dependencies;
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message ?? "Payment state could not be verified");
    return data;
  }
  const attempt: Attempt = await rpc("claim_balance_checkout", { p_business_id: businessId, p_booking_id: bookingId, p_origin: origin });
  if (!attempt || attempt.business_id !== businessId || attempt.booking_id !== bookingId) throw new Error("Payment workspace mismatch");
  if (attempt.state === "review") throw new Error("The previous payment attempt needs support review. Do not start another charge.");
  const headers = { Authorization: `Bearer ${key}`, "Stripe-Account": attempt.stripe_account_id };
  const getSession = async (id: string): Promise<Session> => {
    const response = await stripeFetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Could not verify the existing checkout. Please retry later; no new payment was started.");
    return response.json() as Promise<Session>;
  };
  let session: Session;
  if (attempt.session_id) session = await getSession(attempt.session_id);
  else {
    if ((dependencies.now ?? Date.now()) - Date.parse(attempt.created_at) >= 23 * 60 * 60 * 1000) {
      const { error } = await db.from("balance_checkout_attempts").update({ state: "review", last_error: "Uncertain checkout exceeded safe retry window; verify Stripe before replacing" }).eq("id", attempt.id).eq("state", "active");
      if (error) throw new Error("Payment review state could not be recorded");
      throw new Error("The previous payment attempt needs support review. Do not start another charge.");
    }
    const returnUrl = `${attempt.return_origin}/book/${encodeURIComponent(attempt.business_slug)}`;
    const fields: Record<string, string> = {
      mode: "payment", "payment_method_types[0]": "card",
      "adaptive_pricing[enabled]": "false",
      success_url: `${returnUrl}?payment=balance-success`, cancel_url: `${returnUrl}?payment=cancelled`,
      "line_items[0][price_data][currency]": attempt.currency,
      "line_items[0][price_data][product_data][name]": "Remaining booking balance",
      "line_items[0][price_data][unit_amount]": String(attempt.amount_cents), "line_items[0][quantity]": "1",
      "metadata[checkout_flow]": "balance_payment", "metadata[business_id]": businessId,
      "metadata[booking_id]": bookingId, "metadata[balance_attempt_id]": attempt.id,
      "payment_intent_data[metadata][checkout_flow]": "balance_payment",
      "payment_intent_data[metadata][business_id]": businessId,
      "payment_intent_data[metadata][booking_id]": bookingId,
      "payment_intent_data[metadata][balance_attempt_id]": attempt.id,
      ...(attempt.customer_email ? { customer_email: attempt.customer_email } : {}),
    };
    const response = await stripeFetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `bookzenvo-balance-checkout-${attempt.id}` },
      body: new URLSearchParams(fields), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Stripe could not confirm the checkout. Please retry later; the same attempt will be checked.");
    const created = await response.json() as Session;
    if (!/^cs_[A-Za-z0-9_]+$/.test(created.id)) throw new Error("Stripe returned an invalid checkout identifier");
    await rpc("record_balance_checkout_session", { p_attempt_id: attempt.id, p_session_id: created.id });
    attempt.session_id = created.id;
    // A cached creation response can still say open after payment. Re-fetch.
    session = await getSession(created.id);
  }
  if (session.metadata?.balance_attempt_id !== attempt.id || session.metadata.business_id !== businessId
    || session.metadata.booking_id !== bookingId || session.amount_total !== attempt.amount_cents || session.currency !== attempt.currency
    || (attempt.session_id && session.id !== attempt.session_id)) throw new Error("Checkout details do not match this booking");
  if (session.status === "complete" && session.payment_status === "paid" && typeof session.payment_intent === "string") {
    await rpc("fulfill_balance_checkout", { p_attempt_id: attempt.id, p_session_id: session.id, p_payment_intent_id: session.payment_intent, p_amount_cents: session.amount_total, p_currency: session.currency });
    return { paid: true };
  }
  if (session.status === "expired" && session.payment_status === "unpaid") {
    await rpc("expire_balance_checkout", { p_attempt_id: attempt.id, p_session_id: session.id });
    throw new Error("The old checkout has expired safely. Choose Collect balance again to create a new one.");
  }
  if (session.status !== "open" || session.payment_status !== "unpaid" || !session.url?.startsWith("https://checkout.stripe.com/")) {
    throw new Error("Payment is being checked. Do not start another charge.");
  }
  return { checkoutUrl: session.url };
}
