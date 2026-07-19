import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const rawBody = await request.text();
        if (!signature || !webhookSecret || !(await isValidStripeSignature(rawBody, signature, webhookSecret))) {
          return new Response("Invalid Stripe signature", { status: 400 });
        }

        let event: any;
        try { event = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
        if (event.type !== "checkout.session.completed" || event.data?.object?.payment_status !== "paid") {
          return Response.json({ received: true });
        }

        const session = event.data.object;
        const metadata = session.metadata ?? {};
        const required = ["business_id", "service_id", "staff_id", "customer_name", "customer_email", "starts_at", "ends_at", "payment_mode"];
        if (required.some((key) => !metadata[key]) || !session.payment_intent || !event.account) {
          return new Response("Missing checkout details", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: business, error: businessError } = await supabaseAdmin
            .from("businesses").select("stripe_account_id").eq("id", metadata.business_id).maybeSingle();
          if (businessError) throw businessError;
          if (!business?.stripe_account_id || business.stripe_account_id !== event.account) {
            return new Response("Connected account mismatch", { status: 400 });
          }

          const { error } = await (supabaseAdmin as any).rpc("fulfill_stripe_checkout", {
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
          });
          if (error) throw error;
        } catch (error) {
          console.error("Stripe checkout fulfillment failed", error);
          return new Response("Could not fulfil checkout", { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});

async function isValidStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter(Boolean) as string[];
  if (!timestamp || signatures.length === 0 || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => constantTimeEqual(candidate, expected));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}
