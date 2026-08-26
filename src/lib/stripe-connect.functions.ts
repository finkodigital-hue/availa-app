import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  details_submitted: boolean;
};

type CheckoutInput = {
  businessId: string;
  serviceId: string;
  staffId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  returnPath: string;
};

type BalanceCheckoutInput = {
  bookingId: string;
};

type RefundInput = {
  bookingId: string;
};

type StripePaymentMethods = {
  data: Array<{ id: string }>;
};

type StripePaymentIntent = {
  id: string;
  status: string;
};

type StripeRefund = {
  id: string;
  status: string;
};

type RefundChargeResult = {
  paymentIntentId: string;
  amountCents: number;
  ok: boolean;
  error?: string;
};

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new Error(
      "Stripe is not configured yet. Add STRIPE_SECRET_KEY to the server environment first.",
    );
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
  if (!response.ok)
    throw new Error(body?.error?.message ?? "Stripe could not complete that request.");
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
          country: "GB",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "controller[fees][payer]": "application",
          "controller[losses][payments]": "application",
          "controller[stripe_dashboard][type]": "express",
        }),
      });
      accountId = account.id;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: updateError } = await supabaseAdmin
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

    const account = await stripeRequest<StripeAccount>(
      `/v1/accounts/${business.stripe_account_id}`,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("businesses")
      .update({
        stripe_charges_enabled: account.charges_enabled,
        stripe_details_submitted: account.details_submitted,
      })
      .eq("id", business.id);
    if (updateError) throw updateError;
    return { chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted };
  });

export const startBookingCheckout = createServerFn({ method: "POST" })
  .validator((data: CheckoutInput) => {
    if (
      !data.businessId ||
      !data.serviceId ||
      !data.staffId ||
      !data.customerName.trim() ||
      !data.customerEmail.trim()
    ) {
      throw new Error("Please complete your booking details first.");
    }
    if (
      data.customerName.length > 200 ||
      data.customerEmail.length > 254 ||
      data.customerPhone.length > 40 ||
      data.notes.length > 500
    ) {
      throw new Error("One of the booking details is too long.");
    }
    if (!/^\/book\/[a-z0-9-]+$/i.test(data.returnPath))
      throw new Error("Invalid booking return path.");
    if (Number.isNaN(Date.parse(data.startsAt)) || Number.isNaN(Date.parse(data.endsAt)))
      throw new Error("Invalid booking time.");
    return data;
  })
  .handler(async ({ data }): Promise<{ checkoutUrl: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select(
        "id, name, currency, payment_mode, deposit_percent, stripe_account_id, stripe_charges_enabled",
      )
      .eq("id", data.businessId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) throw new Error("This business is no longer available.");
    if (business.payment_mode === "none") return { checkoutUrl: null };
    if (!business.stripe_account_id || !business.stripe_charges_enabled)
      throw new Error("Online payment is not available for this business yet.");

    const [{ data: service, error: serviceError }, { data: staff, error: staffError }] =
      await Promise.all([
        supabaseAdmin
          .from("services")
          .select("id, name, price_cents, active, gap_min, active_after_min")
          .eq("id", data.serviceId)
          .eq("business_id", business.id)
          .maybeSingle(),
        supabaseAdmin
          .from("staff")
          .select("id")
          .eq("id", data.staffId)
          .eq("business_id", business.id)
          .maybeSingle(),
      ]);
    if (serviceError) throw serviceError;
    if (staffError) throw staffError;
    if (!service?.active || !staff)
      throw new Error("That service or team member is no longer available.");

    const amount =
      business.payment_mode === "deposit"
        ? Math.round(service.price_cents * (business.deposit_percent / 100))
        : service.price_cents;
    if (amount < 50) throw new Error("This booking amount is too small for online payment.");

    const origin = appOrigin();
    const paymentLabel =
      business.payment_mode === "deposit" ? `Deposit for ${service.name}` : service.name;
    const session = await stripeRequest<{ url: string }>("/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Account": business.stripe_account_id,
      },
      body: formBody({
        mode: "payment",
        customer_creation: "always",
        customer_email: data.customerEmail.trim(),
        success_url: `${origin}${data.returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${data.returnPath}?payment=cancelled`,
        "line_items[0][price_data][currency]": business.currency.toLowerCase(),
        "line_items[0][price_data][product_data][name]": paymentLabel,
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][quantity]": "1",
        "metadata[business_id]": business.id,
        "metadata[service_id]": data.serviceId,
        "metadata[staff_id]": data.staffId,
        "metadata[customer_name]": data.customerName.trim(),
        "metadata[customer_email]": data.customerEmail.trim(),
        "metadata[customer_phone]": data.customerPhone.trim(),
        "metadata[starts_at]": data.startsAt,
        "metadata[ends_at]": data.endsAt,
        "metadata[notes]": data.notes.trim(),
        "metadata[payment_mode]": business.payment_mode,
        "metadata[gap_min]": service.gap_min != null ? String(service.gap_min) : "",
        "metadata[active_after_min]":
          service.active_after_min != null ? String(service.active_after_min) : "",
        "payment_intent_data[metadata][business_id]": business.id,
        "payment_intent_data[metadata][service_id]": data.serviceId,
        "payment_intent_data[metadata][staff_id]": data.staffId,
        "payment_intent_data[setup_future_usage]": "off_session",
      }),
    });
    return { checkoutUrl: session.url };
  });

export const startBalanceCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: BalanceCheckoutInput) => {
    if (!data.bookingId) throw new Error("Choose a booking first.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ checkoutUrl: string }> => {
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("id, slug, name, currency, stripe_account_id, stripe_charges_enabled")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
      throw new Error("Connect Stripe before taking a balance payment.");
    }

    const { data: booking, error: bookingError } = await context.supabase
      .from("bookings")
      .select(
        "id, customer_name, customer_email, price_cents, amount_paid_cents, payment_status, services(name)",
      )
      .eq("id", data.bookingId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) throw new Error("Booking not found.");
    if (booking.payment_status === "paid") throw new Error("This booking is already paid in full.");

    const amount = Math.max(0, (booking.price_cents ?? 0) - (booking.amount_paid_cents ?? 0));
    if (amount < 50) throw new Error("There is no remaining balance to collect.");

    const origin = appOrigin();
    const serviceName = (booking.services as { name?: string } | null)?.name ?? "Booking";
    const checkoutFields: Record<string, string> = {
      mode: "payment",
      success_url: `${origin}/book/${business.slug}?payment=balance-success`,
      cancel_url: `${origin}/book/${business.slug}?payment=cancelled`,
      "line_items[0][price_data][currency]": business.currency.toLowerCase(),
      "line_items[0][price_data][product_data][name]": `Remaining balance for ${serviceName}`,
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][quantity]": "1",
      "metadata[checkout_flow]": "balance_payment",
      "metadata[business_id]": business.id,
      "metadata[booking_id]": booking.id,
      "payment_intent_data[metadata][checkout_flow]": "balance_payment",
      "payment_intent_data[metadata][business_id]": business.id,
      "payment_intent_data[metadata][booking_id]": booking.id,
    };
    if (booking.customer_email) checkoutFields.customer_email = booking.customer_email;

    const session = await stripeRequest<{ url: string }>("/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Account": business.stripe_account_id,
      },
      body: formBody(checkoutFields),
    });
    return { checkoutUrl: session.url };
  });

// Charges a card previously saved by Stripe Checkout. We never receive or store
// a card number in Bookzenvo; if the card needs bank authentication we return
// the owner to Stripe Checkout instead.
export const takeSavedBalancePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: BalanceCheckoutInput) => {
    if (!data.bookingId) throw new Error("Choose a booking first.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ charged: boolean }> => {
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("id, currency, stripe_account_id, stripe_charges_enabled")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
      throw new Error("Connect Stripe before taking a balance payment.");
    }

    const { data: booking, error: bookingError } = await context.supabase
      .from("bookings")
      .select("id, customer_id, price_cents, amount_paid_cents, payment_status")
      .eq("id", data.bookingId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) throw new Error("Booking not found.");
    if (booking.payment_status === "paid") throw new Error("This booking is already paid in full.");

    const amount = Math.max(0, (booking.price_cents ?? 0) - (booking.amount_paid_cents ?? 0));
    if (amount < 50) throw new Error("There is no remaining balance to collect.");
    if (!booking.customer_id) return { charged: false };

    const { data: customer, error: customerError } = await context.supabase
      .from("customers")
      .select("stripe_customer_id")
      .eq("id", booking.customer_id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer?.stripe_customer_id) return { charged: false };

    const stripeHeaders = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": business.stripe_account_id,
    };
    const savedMethods = await stripeRequest<StripePaymentMethods>(
      `/v1/payment_methods?customer=${encodeURIComponent(customer.stripe_customer_id)}&type=card`,
      { headers: { "Stripe-Account": business.stripe_account_id } },
    );
    const paymentMethod = savedMethods.data[0];
    if (!paymentMethod) return { charged: false };

    let intent: StripePaymentIntent;
    try {
      intent = await stripeRequest<StripePaymentIntent>("/v1/payment_intents", {
        method: "POST",
        headers: {
          ...stripeHeaders,
          "Idempotency-Key": `bookzenvo-balance-${booking.id}-${amount}`,
        },
        body: formBody({
          amount: String(amount),
          currency: business.currency.toLowerCase(),
          customer: customer.stripe_customer_id,
          payment_method: paymentMethod.id,
          off_session: "true",
          confirm: "true",
          "metadata[checkout_flow]": "balance_payment",
          "metadata[business_id]": business.id,
          "metadata[booking_id]": booking.id,
        }),
      });
    } catch {
      // A decline or required bank authentication is handled through Checkout.
      return { charged: false };
    }
    if (intent.status !== "succeeded") return { charged: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: fulfilmentError } = await (supabaseAdmin as any).rpc(
      "fulfill_stripe_balance_payment",
      {
        p_booking_id: booking.id,
        p_business_id: business.id,
        p_amount_cents: amount,
        p_currency: business.currency,
        p_stripe_payment_intent_id: intent.id,
        p_stripe_charge_id: null,
      },
    );
    if (fulfilmentError) throw fulfilmentError;
    return { charged: true };
  });

// Refunds every succeeded charge on a booking, in full, back to the
// customer's original card. A booking can have more than one succeeded
// charge (a deposit, then a balance collected separately later) — this
// refunds all of them, not just the first. Each charge gets its own
// deterministic Idempotency-Key so a retry after a partial failure can
// never double-refund a charge that already succeeded: Stripe sees the
// same key + same request again and hands back the original refund
// instead of creating a second one.
//
// This never marks the booking refunded itself — booking.payment_status
// is only ever set by fulfill_stripe_refund, from a confirmed
// refund.updated webhook event. A failed refund call is logged as a
// payments row (type: "failure") so there's a record of who tried, when,
// and why it didn't go through, without touching the booking at all.
export const refundBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: RefundInput) => {
    if (!data.bookingId) throw new Error("Choose a booking first.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ results: RefundChargeResult[] }> => {
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("id, currency, stripe_account_id, stripe_charges_enabled")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
      throw new Error("Connect Stripe before issuing a refund.");
    }

    const { data: booking, error: bookingError } = await context.supabase
      .from("bookings")
      .select("id, customer_name, customer_email")
      .eq("id", data.bookingId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) throw new Error("Booking not found.");

    const { data: chargeRows, error: chargesError } = await context.supabase
      .from("payments")
      .select("stripe_payment_intent_id, amount_cents")
      .eq("booking_id", booking.id)
      .eq("business_id", business.id)
      .eq("type", "charge")
      .eq("status", "succeeded");
    if (chargesError) throw chargesError;
    const charges = (chargeRows ?? []).filter(
      (c): c is { stripe_payment_intent_id: string; amount_cents: number } => !!c.stripe_payment_intent_id,
    );
    if (charges.length === 0) throw new Error("This booking has no online payment to refund.");

    const { data: refundRows, error: refundsError } = await context.supabase
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("booking_id", booking.id)
      .eq("business_id", business.id)
      .eq("type", "refund")
      .eq("status", "succeeded");
    if (refundsError) throw refundsError;
    const alreadyRefunded = new Set((refundRows ?? []).map((r) => r.stripe_payment_intent_id));

    const outstanding = charges.filter((c) => !alreadyRefunded.has(c.stripe_payment_intent_id));
    if (outstanding.length === 0) throw new Error("This booking has already been fully refunded.");

    const results: RefundChargeResult[] = charges
      .filter((c) => alreadyRefunded.has(c.stripe_payment_intent_id))
      .map((c) => ({ paymentIntentId: c.stripe_payment_intent_id, amountCents: c.amount_cents, ok: true }));

    const stripeHeaders = { "Content-Type": "application/x-www-form-urlencoded", "Stripe-Account": business.stripe_account_id };
    for (const charge of outstanding) {
      const paymentIntentId = charge.stripe_payment_intent_id;
      try {
        await stripeRequest<StripeRefund>("/v1/refunds", {
          method: "POST",
          headers: { ...stripeHeaders, "Idempotency-Key": `bookzenvo-refund-${paymentIntentId}` },
          body: formBody({
            payment_intent: paymentIntentId,
            "metadata[business_id]": business.id,
            "metadata[booking_id]": booking.id,
            "metadata[initiated_by_user_id]": context.userId,
          }),
        });
        results.push({ paymentIntentId, amountCents: charge.amount_cents, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe could not process this refund.";
        results.push({ paymentIntentId, amountCents: charge.amount_cents, ok: false, error: message });
        await context.supabase.from("payments").insert({
          business_id: business.id,
          booking_id: booking.id,
          stripe_payment_intent_id: paymentIntentId,
          type: "failure",
          status: "failed",
          amount_cents: charge.amount_cents,
          currency: business.currency.toLowerCase(),
          customer_name: booking.customer_name,
          customer_email: booking.customer_email,
          description: "Refund attempt failed",
          error_message: message,
          initiated_by_user_id: context.userId,
        });
      }
    }
    return { results };
  });
