import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  details_submitted: boolean;
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

async function createOnboardingLink(accountId: string) {
  const origin = appOrigin();
  return stripeRequest<{ url: string }>("/v1/account_links", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/settings?tab=payments&stripe=refresh`,
      return_url: `${origin}/settings?tab=payments&stripe=return`,
      "collection_options[fields]": "eventually_due",
    }),
  });
}

export const startStripeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, stripe_account_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Only the business owner can connect Stripe.");

    let accountId = business.stripe_account_id;
    if (!accountId) {
      const account = await stripeRequest<StripeAccount>("/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
          type: "express",
          country: "GB",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "controller[fees][payer]": "application",
          "controller[losses][payments]": "application",
          "controller[stripe_dashboard][type]": "express",
        }),
      });
      accountId = account.id;
      const { error: updateError } = await context.supabase
        .from("businesses")
        .update({
          stripe_account_id: account.id,
          stripe_charges_enabled: account.charges_enabled,
          stripe_details_submitted: account.details_submitted,
        })
        .eq("id", business.id);
      if (updateError) throw updateError;
    }

    const link = await createOnboardingLink(accountId);
    return { url: link.url };
  });

export const refreshStripeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, stripe_account_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business?.stripe_account_id) throw new Error("Stripe is not connected yet.");

    const account = await stripeRequest<StripeAccount>(`/v1/accounts/${business.stripe_account_id}`);
    const { error: updateError } = await context.supabase
      .from("businesses")
      .update({
        stripe_charges_enabled: account.charges_enabled,
        stripe_details_submitted: account.details_submitted,
      })
      .eq("id", business.id);
    if (updateError) throw updateError;
    return { chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted };
  });
