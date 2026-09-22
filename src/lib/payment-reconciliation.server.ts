/** Resolve captured payments that could not create their reserved appointment. */
export async function reconcileFailedBookingPayments(dependencies?: {
  key: string; database: any; stripeFetch: typeof fetch;
}) {
  const key = dependencies?.key ?? process.env.STRIPE_SECRET_KEY;
  if (!key) return { checked: 0, refunded: 0, failed: 0 };
  const db = dependencies?.database ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const stripeFetch = dependencies?.stripeFetch ?? fetch;
  const { data: issues, error } = await db.from("booking_payment_issues")
    .select("payment_intent_id").in("status", ["open", "refund_pending"])
    .eq("manual_review", false).lte("next_attempt_at", new Date().toISOString())
    .not("hold_id", "is", null).lt("created_at", new Date(Date.now()-15*60000).toISOString())
    .order("last_checked_at", { nullsFirst: true }).order("created_at").limit(3);
  if (error) throw error;
  let refunded = 0;
  let failed = 0;
  for (const issue of issues ?? []) {
    try {
    const { data: claim, error: claimError } = await db.rpc("claim_booking_payment_refund", {
      p_payment_intent_id: issue.payment_intent_id,
    });
    if (claimError) throw claimError;
    if (!claim) continue;
    const body = new URLSearchParams({ payment_intent: claim.payment_intent_id,
      "metadata[business_id]": claim.business_id, "metadata[resolution]": "unfulfilled_booking" });
    let refundId = claim.refund_id as string | undefined;
    if (!refundId) {
    const response = await stripeFetch("https://api.stripe.com/v1/refunds", {
      method: "POST", body, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Stripe-Account": claim.stripe_account_id,
        "Idempotency-Key": `unfulfilled-booking-${claim.payment_intent_id}`, "Content-Type": "application/x-www-form-urlencoded" },
    });
    const result = await response.json() as { id?: string; status?: string };
    if (!response.ok || !result.id) throw new Error("A booking payment refund needs another reconciliation attempt");
    refundId = result.id;
    }
    // Re-fetch on each sweep: Stripe's idempotent POST response may still say pending.
    const verified = await stripeFetch(`https://api.stripe.com/v1/refunds/${encodeURIComponent(refundId)}`, {
      headers: { Authorization: `Bearer ${key}`, "Stripe-Account": claim.stripe_account_id },
      signal: AbortSignal.timeout(15000),
    });
    if (!verified.ok) throw new Error("Could not verify booking refund status");
    const refund = await verified.json() as { status?: string };
    const { error: saveError } = await db.from("booking_payment_issues").update({
      refund_id: refundId,
      manual_review: ["failed", "canceled"].includes(refund.status ?? ""),
      ...(refund.status === "succeeded" ? { status: "refunded", resolved_at: new Date().toISOString() } : {}),
    }).eq("payment_intent_id", claim.payment_intent_id).eq("status", "refund_pending");
    if (saveError) throw saveError;
    if (refund.status === "succeeded") refunded++;
    if (["failed", "canceled"].includes(refund.status ?? "")) {
      throw new Error("Booking refund requires manual provider review");
    }
    } catch {
      // Keep the durable issue unresolved and allow other payments and the
      // notification backstop to continue. Do not log payment/customer data.
      failed++;
      console.error("[booking-payment-recovery] An unresolved refund needs review; inspect booking_payment_issues");
    }
  }
  return { checked: issues?.length ?? 0, refunded, failed };
}
