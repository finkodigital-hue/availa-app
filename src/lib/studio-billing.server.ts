import type { supabaseAdmin as AdminClient } from "@/integrations/supabase/client.server";

type Subscription = {
  id: string; status: string; customer: string;
  metadata?: Record<string, string>;
  items?: { data: Array<{ price: { lookup_key?: string; currency: string; unit_amount: number; recurring?: { interval: string; interval_count: number } } }> };
};

/** Re-fetch Stripe truth so delayed or duplicate events cannot replay old state. */
export async function reconcileStudioSubscription(subscriptionId: string, dependencies?: {
  database: typeof AdminClient; stripeFetch: typeof fetch; key: string;
}) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) throw new Error("Invalid subscription");
  const key = dependencies?.key ?? process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  const syncStartedAt = new Date().toISOString();
  const response = await (dependencies?.stripeFetch ?? fetch)(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Could not verify the subscription with Stripe");
  const subscription = await response.json() as Subscription;
  const businessId = subscription.metadata?.business_id;
  if (!businessId) throw new Error("Subscription has no workspace identity");
  const price = subscription.items?.data[0]?.price;
  if (subscription.items?.data.length !== 1 || price?.lookup_key !== "bookzenvo_studio_monthly"
    || price.currency !== "gbp" || price.unit_amount !== 2200
    || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
    throw new Error("Subscription does not match the Studio plan");
  }
  const supabaseAdmin = dependencies?.database ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data: business, error } = await supabaseAdmin.from("businesses")
    .select("id, plan, stripe_billing_customer_id, stripe_subscription_id, stripe_subscription_status, deletion_requested_at")
    .eq("id", businessId).maybeSingle();
  if (error) throw error;
  if (!business || business.stripe_billing_customer_id !== subscription.customer) throw new Error("Subscription customer mismatch");
  if (business.deletion_requested_at) return { activated: false, businessId };
  if (business.stripe_subscription_id && business.stripe_subscription_id !== subscription.id) {
    if (["canceled", "unpaid", "incomplete_expired", "paused"].includes(subscription.status)) return { activated: false, businessId };
    if (!["canceled", "unpaid", "incomplete_expired"].includes(business.stripe_subscription_status ?? "")) {
      throw new Error("Another subscription is already attached to this workspace");
    }
  }
  const active = ["active", "trialing"].includes(subscription.status);
  const terminal = ["canceled", "unpaid", "incomplete_expired", "paused"].includes(subscription.status);
  const update = supabaseAdmin.from("businesses").update({
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: subscription.status,
    billing_synced_at: syncStartedAt,
    ...(active ? { plan: "studio" } : terminal ? { plan: "free" } : {}),
  }).eq("id", businessId).is("deletion_requested_at", null)
    .or(`billing_synced_at.is.null,billing_synced_at.lte.${syncStartedAt}`);
  const { error: updateError } = await (business.stripe_subscription_id
    ? update.eq("stripe_subscription_id", business.stripe_subscription_id)
    : update.is("stripe_subscription_id", null));
  if (updateError) throw updateError;
  return { activated: active, businessId };
}
