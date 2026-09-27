/* eslint-disable @typescript-eslint/no-explicit-any -- Terminal tables are server-only and intentionally absent from browser-generated types. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_READER = /^tmr_[A-Za-z0-9]+$/;

export type TerminalReaderSummary = {
  id: string;
  label: string;
  deviceType: string;
  status: string;
  livemode?: boolean;
};

export type TerminalAttemptSummary = {
  attemptId: string;
  state: string;
  amountCents: number;
  currency: string;
  message?: string;
};

type TerminalAttemptRow = {
  id: string;
  business_id: string;
  booking_id: string;
  reader_id: string;
  amount_cents: number;
  currency: string;
  stripe_account_id: string;
  stripe_reader_id: string;
  stripe_payment_intent_id: string | null;
  state: string;
  failure_message?: string | null;
};

async function ownerBusiness(context: any) {
  const { data: business, error } = await context.supabase
    .from("businesses")
    .select("id, currency, stripe_account_id, stripe_charges_enabled")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!business)
    throw new Error("Only the business owner can manage card readers.");
  if (!business.stripe_account_id || !business.stripe_charges_enabled)
    throw new Error("Finish connecting Stripe before using a card reader.");
  if (String(business.currency).toLowerCase() !== "gbp")
    throw new Error(
      "The first card-reader release supports GBP businesses only.",
    );
  return business as {
    id: string;
    currency: string;
    stripe_account_id: string;
    stripe_charges_enabled: boolean;
  };
}

function attemptSummary(attempt: TerminalAttemptRow): TerminalAttemptSummary {
  return {
    attemptId: attempt.id,
    state: attempt.state,
    amountCents: attempt.amount_cents,
    currency: attempt.currency,
    ...(attempt.failure_message ? { message: attempt.failure_message } : {}),
  };
}

async function reconcileAttempt(
  admin: any,
  attempt: TerminalAttemptRow,
): Promise<TerminalAttemptSummary> {
  if (!attempt.stripe_payment_intent_id) return attemptSummary(attempt);
  const { retrieveTerminalPaymentIntent } =
    await import("@/lib/stripe-terminal.server");
  const intent = await retrieveTerminalPaymentIntent(
    attempt.stripe_account_id,
    attempt.stripe_payment_intent_id,
  );

  if (
    intent.id !== attempt.stripe_payment_intent_id ||
    intent.amount !== attempt.amount_cents ||
    intent.currency?.toLowerCase() !== attempt.currency.toLowerCase() ||
    intent.metadata?.terminal_attempt_id !== attempt.id ||
    intent.metadata?.business_id !== attempt.business_id ||
    intent.metadata?.booking_id !== attempt.booking_id
  ) {
    throw new Error(
      "Stripe returned a payment that does not match this booking.",
    );
  }

  if (intent.status === "succeeded") {
    const chargeId =
      typeof intent.latest_charge === "string" ? intent.latest_charge : "";
    const { error } = await admin.rpc("fulfill_terminal_payment", {
      p_attempt_id: attempt.id,
      p_payment_intent_id: intent.id,
      p_charge_id: chargeId,
      p_amount_cents: intent.amount,
      p_currency: intent.currency,
    });
    if (error) throw error;
    return {
      attemptId: attempt.id,
      state: "succeeded",
      amountCents: attempt.amount_cents,
      currency: attempt.currency,
    };
  }

  if (["canceled", "requires_payment_method"].includes(intent.status)) {
    if (
      intent.status === "requires_payment_method" &&
      attempt.state === "review"
    ) {
      const { retrieveTerminalReader } =
        await import("@/lib/stripe-terminal.server");
      const reader = await retrieveTerminalReader(
        attempt.stripe_account_id,
        attempt.stripe_reader_id,
      );
      if (reader.action?.status !== "failed") {
        return {
          attemptId: attempt.id,
          state: "review",
          amountCents: attempt.amount_cents,
          currency: attempt.currency,
          message:
            "The result is still uncertain. Keep this payment open and check again before retrying.",
        };
      }
    }
    const state = intent.status === "canceled" ? "canceled" : "failed";
    const { error } = await admin.rpc("close_terminal_payment", {
      p_attempt_id: attempt.id,
      p_payment_intent_id: intent.id,
      p_state: state,
      p_failure_code: intent.status,
      p_failure_message:
        state === "canceled"
          ? "The reader payment was canceled."
          : "The card was not accepted. Try again or use the secure payment link.",
    });
    if (error) throw error;
    return {
      attemptId: attempt.id,
      state,
      amountCents: attempt.amount_cents,
      currency: attempt.currency,
      message:
        state === "canceled"
          ? "The reader payment was canceled."
          : "The card was not accepted. Try again or use the secure payment link.",
    };
  }

  return {
    attemptId: attempt.id,
    state: "processing",
    amountCents: attempt.amount_cents,
    currency: attempt.currency,
  };
}

export const listTerminalReaders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const business = await ownerBusiness(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("terminal_readers")
      .select("id,label,device_type,provider_status")
      .eq("business_id", business.id)
      .eq("stripe_account_id", business.stripe_account_id)
      .eq("enabled", true)
      .order("registered_at", { ascending: true });
    if (error) throw error;
    const { isStripeTestMode } = await import("@/lib/stripe-terminal.server");
    return {
      readers: (data ?? []).map((reader: any) => ({
        id: reader.id,
        label: reader.label,
        deviceType: reader.device_type,
        status: reader.provider_status,
      })) as TerminalReaderSummary[],
      canCreateSimulator: isStripeTestMode(),
    };
  });

export const createTestTerminalReader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { label?: string }) => {
    const label = data.label?.trim() || "Bookzenvo test reader";
    if (label.length > 80)
      throw new Error("Keep the reader name under 80 characters.");
    return { label };
  })
  .handler(async ({ data, context }) => {
    const business = await ownerBusiness(context);
    const { createSimulatedReader } =
      await import("@/lib/stripe-terminal.server");
    const created = await createSimulatedReader(
      business.stripe_account_id,
      business.id,
      data.label,
    );
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: reader, error } = await (supabaseAdmin as any).rpc(
      "upsert_terminal_reader",
      {
        p_business_id: business.id,
        p_stripe_account_id: business.stripe_account_id,
        p_stripe_location_id: created.locationId,
        p_stripe_reader_id: created.reader.id,
        p_label: created.reader.label,
        p_device_type: created.reader.device_type,
        p_provider_status: created.reader.status,
      },
    );
    if (error) throw error;
    return {
      id: reader.id,
      label: reader.label,
      deviceType: reader.device_type,
      status: reader.provider_status,
      livemode: created.reader.livemode,
    } as TerminalReaderSummary;
  });

export const startTerminalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: { bookingId: string; readerId: string; requestId: string }) => {
      if (!UUID.test(data.bookingId))
        throw new Error("Choose a valid booking.");
      if (!UUID.test(data.readerId))
        throw new Error("Choose a valid card reader.");
      if (!UUID.test(data.requestId))
        throw new Error("Invalid payment request.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const business = await ownerBusiness(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: claimed, error: claimError } = await (
      supabaseAdmin as any
    ).rpc("claim_terminal_payment", {
      p_business_id: business.id,
      p_booking_id: data.bookingId,
      p_reader_id: data.readerId,
      p_request_id: data.requestId,
      p_actor: context.userId,
    });
    if (claimError) throw claimError;
    const attempt = claimed as TerminalAttemptRow;
    if (!attempt?.id || !STRIPE_READER.test(attempt.stripe_reader_id))
      throw new Error("The selected card reader is not available.");
    if (attempt.stripe_account_id !== business.stripe_account_id)
      throw new Error("The card reader belongs to a different Stripe account.");

    if (attempt.stripe_payment_intent_id) {
      return reconcileAttempt(supabaseAdmin, attempt);
    }

    let intentId: string | null = null;
    try {
      const {
        createTerminalPaymentIntent,
        isStripeTestMode,
        presentSimulatedTerminalPayment,
        processTerminalPaymentIntent,
      } = await import("@/lib/stripe-terminal.server");
      const intent = await createTerminalPaymentIntent(
        business.stripe_account_id,
        {
          attemptId: attempt.id,
          businessId: business.id,
          bookingId: attempt.booking_id,
          amountCents: attempt.amount_cents,
          currency: attempt.currency,
          idempotencyKey: `bookzenvo-terminal-${attempt.id}`,
        },
      );
      intentId = intent.id;
      const { error: attachError } = await (supabaseAdmin as any).rpc(
        "attach_terminal_payment_intent",
        { p_attempt_id: attempt.id, p_payment_intent_id: intent.id },
      );
      if (attachError) throw attachError;
      await processTerminalPaymentIntent(
        business.stripe_account_id,
        attempt.stripe_reader_id,
        intent.id,
      );
      if (isStripeTestMode()) {
        // Stripe's simulator waits for this test-helper call after the reader
        // action starts. Real readers reject it, so a failed helper call is
        // deliberately ignored and the physical reader remains in control.
        await presentSimulatedTerminalPayment(
          business.stripe_account_id,
          attempt.stripe_reader_id,
        ).catch(() => undefined);
      }
      return {
        attemptId: attempt.id,
        state: "processing",
        amountCents: attempt.amount_cents,
        currency: attempt.currency,
      } satisfies TerminalAttemptSummary;
    } catch (error) {
      const { StripeTerminalRequestError } =
        await import("@/lib/stripe-terminal.server");
      if (error instanceof StripeTerminalRequestError && error.uncertain) {
        if (intentId) {
          const { error: reviewError } = await (supabaseAdmin as any).rpc(
            "close_terminal_payment",
            {
              p_attempt_id: attempt.id,
              p_payment_intent_id: intentId,
              p_state: "review",
              p_failure_code: "provider_timeout",
              p_failure_message: error.message,
            },
          );
          if (reviewError) throw reviewError;
        }
        return {
          attemptId: attempt.id,
          state: "review",
          amountCents: attempt.amount_cents,
          currency: attempt.currency,
          message: error.message,
        } satisfies TerminalAttemptSummary;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The reader could not start the payment.";
      const { error: closeError } = await (supabaseAdmin as any).rpc(
        "close_terminal_payment",
        {
          p_attempt_id: attempt.id,
          p_payment_intent_id: intentId,
          p_state: "failed",
          p_failure_code:
            error instanceof StripeTerminalRequestError
              ? (error.code ?? null)
              : null,
          p_failure_message: message,
        },
      );
      if (closeError) throw closeError;
      throw new Error(message);
    }
  });

export const getTerminalPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { attemptId: string }) => {
    if (!UUID.test(data.attemptId)) throw new Error("Invalid reader payment.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownerBusiness(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: attempt, error } = await (supabaseAdmin as any)
      .from("terminal_payment_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .eq("business_id", business.id)
      .eq("stripe_account_id", business.stripe_account_id)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) throw new Error("Reader payment not found.");
    if (["succeeded", "failed", "canceled"].includes(attempt.state))
      return attemptSummary(attempt as TerminalAttemptRow);
    return reconcileAttempt(supabaseAdmin, attempt as TerminalAttemptRow);
  });

export const cancelTerminalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { attemptId: string }) => {
    if (!UUID.test(data.attemptId)) throw new Error("Invalid reader payment.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownerBusiness(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: attempt, error } = await (supabaseAdmin as any)
      .from("terminal_payment_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .eq("business_id", business.id)
      .eq("stripe_account_id", business.stripe_account_id)
      .maybeSingle();
    if (error) throw error;
    if (!attempt) throw new Error("Reader payment not found.");
    if (["succeeded", "failed", "canceled"].includes(attempt.state))
      return attemptSummary(attempt as TerminalAttemptRow);

    try {
      const { cancelTerminalReaderAction } =
        await import("@/lib/stripe-terminal.server");
      await cancelTerminalReaderAction(
        business.stripe_account_id,
        attempt.stripe_reader_id,
      );
    } catch (cancelError) {
      const { StripeTerminalRequestError } =
        await import("@/lib/stripe-terminal.server");
      if (
        !(
          cancelError instanceof StripeTerminalRequestError &&
          /no action|not.*action/i.test(cancelError.message)
        )
      )
        throw cancelError;
    }
    if (!attempt.stripe_payment_intent_id) {
      const { error: closeError } = await (supabaseAdmin as any).rpc(
        "close_terminal_payment",
        {
          p_attempt_id: attempt.id,
          p_payment_intent_id: null,
          p_state: "canceled",
          p_failure_code: "operator_canceled",
          p_failure_message: "The reader payment was canceled.",
        },
      );
      if (closeError) throw closeError;
      return {
        attemptId: attempt.id,
        state: "canceled",
        amountCents: attempt.amount_cents,
        currency: attempt.currency,
      } satisfies TerminalAttemptSummary;
    }

    try {
      const { cancelTerminalPaymentIntent } =
        await import("@/lib/stripe-terminal.server");
      const canceled = await cancelTerminalPaymentIntent(
        business.stripe_account_id,
        attempt.stripe_payment_intent_id,
      );
      if (canceled.status !== "canceled")
        return reconcileAttempt(supabaseAdmin, attempt as TerminalAttemptRow);
      const { error: closeError } = await (supabaseAdmin as any).rpc(
        "close_terminal_payment",
        {
          p_attempt_id: attempt.id,
          p_payment_intent_id: attempt.stripe_payment_intent_id,
          p_state: "canceled",
          p_failure_code: "operator_canceled",
          p_failure_message: "The reader payment was canceled.",
        },
      );
      if (closeError) throw closeError;
      return {
        attemptId: attempt.id,
        state: "canceled",
        amountCents: attempt.amount_cents,
        currency: attempt.currency,
      } satisfies TerminalAttemptSummary;
    } catch {
      // A cancellation can race the card approval. Retrieve the authoritative
      // PaymentIntent instead of declaring it canceled locally.
      return reconcileAttempt(supabaseAdmin, attempt as TerminalAttemptRow);
    }
  });

export const refreshTerminalReader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { readerId: string }) => {
    if (!UUID.test(data.readerId))
      throw new Error("Choose a valid card reader.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownerBusiness(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await (supabaseAdmin as any)
      .from("terminal_readers")
      .select("*")
      .eq("id", data.readerId)
      .eq("business_id", business.id)
      .eq("stripe_account_id", business.stripe_account_id)
      .maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("Card reader not found.");
    const { retrieveTerminalReader } =
      await import("@/lib/stripe-terminal.server");
    const reader = await retrieveTerminalReader(
      business.stripe_account_id,
      saved.stripe_reader_id,
    );
    const { data: updated, error: updateError } = await (
      supabaseAdmin as any
    ).rpc("upsert_terminal_reader", {
      p_business_id: business.id,
      p_stripe_account_id: business.stripe_account_id,
      p_stripe_location_id: saved.stripe_location_id,
      p_stripe_reader_id: reader.id,
      p_label: reader.label,
      p_device_type: reader.device_type,
      p_provider_status: reader.status,
    });
    if (updateError) throw updateError;
    return {
      id: updated.id,
      label: updated.label,
      deviceType: updated.device_type,
      status: updated.provider_status,
      livemode: reader.livemode,
    } as TerminalReaderSummary;
  });
