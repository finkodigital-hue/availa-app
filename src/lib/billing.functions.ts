import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Subscription billing for the Studio plan (£22/month), charged on
// Bookzenvo's own Stripe account. Completely separate from
// stripe-connect.functions.ts, which manages each business's CONNECTED
// account (their customers' payments and payouts) — no Stripe-Account
// header is ever sent here.
//
// Flow, mirroring the existing fulfil-on-return pattern used for booking
// payments (no webhook endpoint required):
//   1. startStudioCheckout  -> Stripe Checkout (mode=subscription)
//   2. Stripe redirects back to /settings?tab=plan&billing=success&session_id=…
//   3. finalizeStudioCheckout(session_id) verifies the subscription is real
//      and active, then flips plan='studio' and stores the ids
//   4. the 15-min cron sweep (send-reminders route) re-checks each paid
//      subscription periodically and downgrades churned ones
// The £22/mo price object is found-or-created by lookup_key, so there is no
// dashboard setup step and no hardcoded price id per environment.

const STUDIO_PRICE_LOOKUP_KEY = "bookzenvo_studio_monthly";
const STUDIO_PRICE_PENCE = 2200;

type StripePrice = { id: string; unit_amount: number };
type StripePriceList = { data: StripePrice[] };
type StripeCustomer = { id: string };
type StripeCheckoutSession = {
  id: string;
  status: string;
  customer: string | null;
  subscription: string | null;
  metadata?: Record<string, string>;
};
export type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  current_period_end?: number;
};

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY to the server environment first.");
  return key;
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Stripe could not complete that request.");
  return body as T;
}

function formBody(values: Record<string, string>) {
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}

function appOrigin() {
  return process.env.APP_URL ?? new URL(getRequest().url).origin;
}

/** Find (or create on first ever use) the £22/month Studio price. */
export async function ensureStudioPrice(): Promise<string> {
  const existing = await stripeRequest<StripePriceList>(
    `/v1/prices?lookup_keys[]=${encodeURIComponent(STUDIO_PRICE_LOOKUP_KEY)}&active=true&limit=1`,
  );
  if (existing.data[0]) return existing.data[0].id;

  const price = await stripeRequest<StripePrice>("/v1/prices", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      currency: "gbp",
      unit_amount: String(STUDIO_PRICE_PENCE),
      "recurring[interval]": "month",
      lookup_key: STUDIO_PRICE_LOOKUP_KEY,
      "product_data[name]": "Bookzenvo Studio",
    }),
  });
  return price.id;
}

export const startStudioCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ checkoutUrl: string }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, name, plan, stripe_billing_customer_id, stripe_subscription_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Only the business owner can upgrade the plan.");
    if ((business.plan ?? "free") !== "free") throw new Error("This workspace is already on Studio.");

    // Reuse the billing customer across attempts so Stripe keeps one tidy
    // record per business instead of one per abandoned checkout.
    let customerId = business.stripe_billing_customer_id as string | null;
    if (!customerId) {
      const { data: userData } = await context.supabase.auth.getUser();
      const customer = await stripeRequest<StripeCustomer>("/v1/customers", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          name: business.name,
          ...(userData?.user?.email ? { email: userData.user.email } : {}),
          "metadata[business_id]": business.id,
        }),
      });
      customerId = customer.id;
      const { error: saveError } = await context.supabase
        .from("businesses")
        .update({ stripe_billing_customer_id: customerId })
        .eq("id", business.id);
      if (saveError) throw saveError;
    }

    const priceId = await ensureStudioPrice();
    const origin = appOrigin();
    const session = await stripeRequest<{ url: string }>("/v1/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/settings?tab=plan&billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/settings?tab=plan&billing=cancelled`,
        "metadata[business_id]": business.id,
        "subscription_data[metadata][business_id]": business.id,
      }),
    });
    return { checkoutUrl: session.url };
  });

export const finalizeStudioCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { sessionId: string }) => {
    if (!data.sessionId) throw new Error("Missing checkout session.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ activated: boolean }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, plan")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Only the business owner can manage the plan.");

    const session = await stripeRequest<StripeCheckoutSession>(
      `/v1/checkout/sessions/${encodeURIComponent(data.sessionId)}`,
    );
    // The session's own metadata proves this checkout was created for THIS
    // business — an owner can't activate Studio with someone else's session id.
    if (session.metadata?.business_id !== business.id) {
      throw new Error("That checkout doesn't belong to this workspace.");
    }
    if (session.status !== "complete" || !session.subscription) {
      return { activated: false };
    }

    const subscription = await stripeRequest<StripeSubscription>(
      `/v1/subscriptions/${encodeURIComponent(session.subscription)}`,
    );
    const active = subscription.status === "active" || subscription.status === "trialing";
    if (!active) return { activated: false };

    const { error: updateError } = await context.supabase
      .from("businesses")
      .update({
        plan: "studio",
        stripe_subscription_id: subscription.id,
        stripe_subscription_status: subscription.status,
        stripe_billing_customer_id: subscription.customer,
        billing_synced_at: new Date().toISOString(),
      })
      .eq("id", business.id);
    if (updateError) throw updateError;

    return { activated: true };
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, stripe_billing_customer_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business?.stripe_billing_customer_id) {
      throw new Error("No billing set up for this workspace yet.");
    }

    const origin = appOrigin();
    const session = await stripeRequest<{ url: string }>("/v1/billing_portal/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        customer: business.stripe_billing_customer_id,
        return_url: `${origin}/settings?tab=plan`,
      }),
    });
    return { url: session.url };
  });
