import { createFileRoute } from "@tanstack/react-router";
import { readBodyWithLimit } from "@/lib/request-limits";

const MAX_STRIPE_EVENT_BYTES = 1 * 1024 * 1024;

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const webhookSecrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_PLATFORM_WEBHOOK_SECRET]
          .filter((value): value is string => Boolean(value));
        const body = await readBodyWithLimit(request, MAX_STRIPE_EVENT_BYTES);
        if (body === null) {
          return new Response("Webhook body too large", { status: 413 });
        }
        const rawBody = new TextDecoder().decode(body);
        if (
          !signature ||
          webhookSecrets.length === 0 ||
          !(await Promise.all(webhookSecrets.map(secret => isValidStripeSignature(rawBody, signature, secret)))).some(Boolean)
        ) {
          return new Response("Invalid Stripe signature", { status: 400 });
        }

        let event: any;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Studio belongs to the platform account. Connected-account events
        // must never grant platform subscription access.
        if (!event.account && (event.type?.startsWith("customer.subscription.") ||
          (event.type === "checkout.session.completed" && event.data?.object?.mode === "subscription"))) {
          const subscriptionId = event.type.startsWith("customer.subscription.")
            ? event.data?.object?.id : event.data?.object?.subscription;
          try {
            const { reconcileStudioSubscription } = await import("@/lib/studio-billing.server");
            await reconcileStudioSubscription(subscriptionId);
            return Response.json({ received: true });
          } catch (error) {
            console.error("Studio subscription reconciliation failed", error);
            return new Response("Subscription reconciliation failed", { status: 500 });
          }
        }

        if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
          const refund = event.data?.object;
          const needsReview = ["failed", "canceled", "requires_action"].includes(refund?.status);
          if (refund?.status !== "succeeded" && !needsReview)
            return Response.json({ received: true });
          const metadata = refund.metadata ?? {};
          // These refunds have no booking ledger row; the durable recovery
          // sweep verifies their status using the payment-issue record.
          if (metadata.resolution === "unfulfilled_booking") return Response.json({ received: true });
          if (
            !refund.payment_intent ||
            !event.account
          ) {
            return new Response("Missing refund details", { status: 400 });
          }
          try {
            const { supabaseAdmin } =
              await import("@/integrations/supabase/client.server");
            const { data: business, error: businessError } = await supabaseAdmin
              .from("businesses")
              .select("id, stripe_account_id")
              .eq("stripe_account_id", event.account)
              .maybeSingle();
            if (businessError) throw businessError;
            if (
              !business?.stripe_account_id ||
              business.stripe_account_id !== event.account
            ) {
              return new Response("Connected account mismatch", {
                status: 400,
              });
            }
            if (needsReview) {
              if (metadata.business_id && metadata.business_id !== business.id) {
                return new Response("Refund identity mismatch", { status: 400 });
              }
              const { error: reviewError } = await (supabaseAdmin as any).rpc("record_stripe_refund_review", {
                p_business_id: business.id,
                p_stripe_payment_intent_id: refund.payment_intent,
                p_stripe_refund_id: refund.id,
                p_status: refund.status,
              });
              if (reviewError) throw reviewError;
              return Response.json({ received: true });
            }
            // Dashboard refunds need not carry our metadata. Resolve the
            // booking from its recorded charge inside the signed account.
            const { data: charge, error: chargeError } = await supabaseAdmin
              .from("payments")
              .select("booking_id")
              .eq("business_id", business.id)
              .eq("stripe_payment_intent_id", refund.payment_intent)
              .eq("type", "charge")
              .eq("status", "succeeded")
              .maybeSingle();
            if (chargeError) throw chargeError;
            if (!charge?.booking_id) {
              if ((metadata.business_id && metadata.business_id !== business.id) || metadata.booking_id) {
                return new Response("Refund identity mismatch", { status: 400 });
              }
              // The private function matches an issued Stripe gift card and
              // returns an error until its purchase has been reconciled.
              const { error: giftError } = await (supabaseAdmin as any).rpc("fulfill_gift_card_refund", {
                p_business_id: business.id,
                p_stripe_payment_intent_id: refund.payment_intent,
                p_stripe_refund_id: refund.id,
                p_amount_cents: refund.amount,
                p_currency: refund.currency,
              });
              if (giftError) throw giftError;
              return Response.json({ received: true });
            }
            if ((metadata.business_id && metadata.business_id !== business.id) ||
              (metadata.booking_id && metadata.booking_id !== charge.booking_id)) {
              return new Response("Refund identity mismatch", { status: 400 });
            }
            const { error } = await (supabaseAdmin as any).rpc(
              "fulfill_stripe_refund",
              {
                p_business_id: business.id,
                p_booking_id: charge.booking_id,
                p_amount_cents: refund.amount,
                p_currency: refund.currency,
                p_stripe_refund_id: refund.id,
                p_stripe_payment_intent_id: refund.payment_intent,
                p_initiated_by_user_id: metadata.initiated_by_user_id || null,
              },
            );
            if (error) throw error;
          } catch (error) {
            console.error("Stripe refund fulfilment failed", error);
            return new Response("Could not fulfil refund", { status: 500 });
          }
          return Response.json({ received: true });
        }

        if (
          event.type !== "checkout.session.completed" ||
          event.data?.object?.payment_status !== "paid"
        ) {
          return Response.json({ received: true });
        }

        const session = event.data.object;
        const metadata = session.metadata ?? {};
        if (metadata.checkout_flow === "gift_card") {
          if (
            !metadata.gift_card_order_id ||
            !metadata.business_id ||
            !session.payment_intent ||
            !session.id ||
            !event.account
          ) {
            return new Response("Missing gift card payment details", {
              status: 400,
            });
          }
          try {
            const { supabaseAdmin } =
              await import("@/integrations/supabase/client.server");
            const { data: business, error: businessError } = await supabaseAdmin
              .from("businesses")
              .select("stripe_account_id")
              .eq("id", metadata.business_id)
              .maybeSingle();
            if (businessError) throw businessError;
            if (
              !business?.stripe_account_id ||
              business.stripe_account_id !== event.account
            ) {
              return new Response("Connected account mismatch", {
                status: 400,
              });
            }
            const { error } = await (supabaseAdmin as any).rpc(
              "fulfill_gift_card_purchase",
              {
                p_order_id: metadata.gift_card_order_id,
                p_business_id: metadata.business_id,
                p_amount_cents: session.amount_total,
                p_currency: session.currency,
                p_stripe_checkout_session_id: session.id,
                p_stripe_payment_intent_id: session.payment_intent,
              },
            );
            if (error) throw error;
          } catch (error) {
            console.error("Stripe gift card fulfilment failed", error);
            return new Response("Could not fulfil gift card", { status: 500 });
          }
          return Response.json({ received: true });
        }
        if (metadata.checkout_flow === "balance_payment") {
          if (
            !metadata.booking_id ||
            !metadata.business_id ||
            !session.payment_intent ||
            !event.account
          ) {
            return new Response("Missing balance payment details", {
              status: 400,
            });
          }
          try {
            const { supabaseAdmin } =
              await import("@/integrations/supabase/client.server");
            const { data: business, error: businessError } = await supabaseAdmin
              .from("businesses")
              .select("stripe_account_id")
              .eq("id", metadata.business_id)
              .maybeSingle();
            if (businessError) throw businessError;
            if (
              !business?.stripe_account_id ||
              business.stripe_account_id !== event.account
            ) {
              return new Response("Connected account mismatch", {
                status: 400,
              });
            }
            if (metadata.balance_attempt_id) {
              const { data: attempt, error: attemptError } = await (supabaseAdmin as any)
                .from("balance_checkout_attempts").select("id").eq("id", metadata.balance_attempt_id)
                .eq("business_id", metadata.business_id).eq("booking_id", metadata.booking_id)
                .eq("stripe_account_id", event.account).maybeSingle();
              if (attemptError) throw attemptError;
              if (!attempt) return new Response("Balance checkout workspace mismatch", { status: 400 });
            }
            const { error } = metadata.balance_attempt_id
              ? await (supabaseAdmin as any).rpc("fulfill_balance_checkout", {
                p_attempt_id: metadata.balance_attempt_id, p_session_id: session.id,
                p_payment_intent_id: session.payment_intent, p_amount_cents: session.amount_total, p_currency: session.currency,
              })
              : await (supabaseAdmin as any).rpc("fulfill_stripe_balance_payment", {
                p_booking_id: metadata.booking_id,
                p_business_id: metadata.business_id,
                p_amount_cents: session.amount_total,
                p_currency: session.currency,
                p_stripe_payment_intent_id: session.payment_intent,
                p_stripe_charge_id: null,
              });
            if (error) throw error;
            const { error: resolveError } = await (supabaseAdmin as any).from("booking_payment_issues")
              .update({ status: "resolved", resolved_at: new Date().toISOString() })
              .eq("payment_intent_id", session.payment_intent).eq("status", "open");
            if (resolveError) throw resolveError;
          } catch (error) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error: issueError } = await (supabaseAdmin as any).from("booking_payment_issues").upsert({
              payment_intent_id: session.payment_intent, business_id: metadata.business_id,
              stripe_account_id: event.account, hold_id: null, manual_review: true,
              reason: "Balance payment was received but not reconciled; verify the booking and Stripe before another charge",
            }, { onConflict: "payment_intent_id", ignoreDuplicates: true });
            if (issueError) console.error("Could not record the balance payment review");
            console.error("Stripe balance payment fulfilment requires review");
            return new Response("Could not fulfil balance payment", {
              status: 500,
            });
          }
          return Response.json({ received: true });
        }
        const required = [
          "business_id",
          "service_id",
          "staff_id",
          "customer_name",
          "customer_email",
          "starts_at",
          "ends_at",
          "payment_mode",
        ];
        if (
          required.some((key) => !metadata[key]) ||
          !session.payment_intent ||
          !event.account
        ) {
          return new Response("Missing checkout details", { status: 400 });
        }

        try {
          const { supabaseAdmin } =
            await import("@/integrations/supabase/client.server");
          const { data: business, error: businessError } = await supabaseAdmin
            .from("businesses")
            .select("stripe_account_id")
            .eq("id", metadata.business_id)
            .maybeSingle();
          if (businessError) throw businessError;
          if (
            !business?.stripe_account_id ||
            business.stripe_account_id !== event.account
          ) {
            return new Response("Connected account mismatch", { status: 400 });
          }

          if (metadata.hold_id) {
            const { data: hold, error: holdError } = await (supabaseAdmin as any).from("booking_checkout_holds")
              .select("business_id").eq("id", metadata.hold_id).eq("business_id", metadata.business_id).maybeSingle();
            if (holdError) throw holdError;
            if (!hold) return new Response("Checkout reservation workspace mismatch", { status: 400 });
          }
          const { data: issue, error: issueError } = await (supabaseAdmin as any).from("booking_payment_issues")
            .select("status").eq("payment_intent_id", session.payment_intent).maybeSingle();
          if (issueError) throw issueError;
          if (issue?.status === "refunded") return Response.json({ received: true });
          const { data: bookingId, error } = metadata.hold_id
            ? await (supabaseAdmin as any).rpc("fulfill_held_booking", {
              p_hold_id: metadata.hold_id, p_amount_cents: session.amount_total,
              p_currency: session.currency, p_payment_intent_id: session.payment_intent,
              p_customer_name: metadata.customer_name, p_customer_email: metadata.customer_email,
              p_customer_phone: metadata.customer_phone ?? "", p_notes: metadata.notes ?? "",
              p_stripe_customer_id: typeof session.customer === "string" ? session.customer : "",
            })
            : await (supabaseAdmin as any).rpc(
            "fulfill_stripe_checkout",
            {
              p_business_id: metadata.business_id,
              p_service_id: metadata.service_id,
              p_staff_id: metadata.staff_id,
              p_customer_name: metadata.customer_name,
              p_customer_email: metadata.customer_email,
              p_customer_phone: metadata.customer_phone ?? "",
              p_starts_at: metadata.starts_at,
              p_ends_at: metadata.ends_at,
              p_notes: metadata.notes ?? "",
              p_payment_mode: metadata.payment_mode,
              p_amount_cents: session.amount_total,
              p_currency: session.currency,
              p_stripe_payment_intent_id: session.payment_intent,
              p_stripe_charge_id: null,
              p_stripe_customer_id:
                typeof session.customer === "string" ? session.customer : "",
              p_gap_min: metadata.gap_min ? Number(metadata.gap_min) : null,
              p_active_after_min: metadata.active_after_min
                ? Number(metadata.active_after_min)
                : null,
            },
          );
          if (error) {
            const { error: recordError } = await (supabaseAdmin as any).from("booking_payment_issues").upsert({
              payment_intent_id: session.payment_intent, business_id: metadata.business_id,
              stripe_account_id: event.account, hold_id: metadata.hold_id ?? null,
              reason: "Booking fulfilment failed; payment requires reconciliation",
            }, { onConflict: "payment_intent_id", ignoreDuplicates: true });
            if (recordError) console.error("Could not record payment issue", recordError);
            throw error;
          }
          const { error: resolutionError } = await (supabaseAdmin as any).from("booking_payment_issues")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("payment_intent_id", session.payment_intent).eq("status", "open");
          if (resolutionError) throw resolutionError;
          if (
            bookingId &&
            metadata.sms_reminder_consent === "true" &&
            metadata.customer_phone
          ) {
            const { error: consentError } = await (supabaseAdmin as any)
              .from("bookings")
              .update({
                sms_reminder_consent_at: new Date().toISOString(),
                sms_reminder_consent_version: "appointment-sms-v1",
              })
              .eq("id", bookingId)
              .eq("business_id", metadata.business_id);
            if (consentError) throw consentError;
          }
          if (
            bookingId &&
            metadata.email_marketing_consent === "true" &&
            metadata.customer_email
          ) {
            const { recordBookingEmailMarketingConsent } =
              await import("@/lib/marketing-consent.server");
            await recordBookingEmailMarketingConsent({
              bookingId,
              businessId: metadata.business_id,
            });
          }
        } catch (error) {
          console.error("Stripe checkout fulfillment failed", error);
          return new Response("Could not fulfil checkout", { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});

async function isValidStripeSignature(
  payload: string,
  header: string,
  secret: string,
) {
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter(Boolean) as string[];
  if (
    !timestamp ||
    !Number.isFinite(Number(timestamp)) ||
    signatures.length === 0 ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return signatures.some((candidate) => constantTimeEqual(candidate, expected));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}
