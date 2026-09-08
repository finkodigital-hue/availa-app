import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { trustedAppOrigin } from "@/lib/app-origin.server";

type PurchaseInput = {
  businessId: string;
  amountCents: number;
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail?: string;
  message?: string;
  returnPath: string;
};

type PurchaseResultInput = { orderId: string; claimToken: string };
type IssueInput = {
  amountCents: number;
  recipientName: string;
  recipientEmail?: string;
  message?: string;
};
type RedeemInput = { bookingId: string; code: string; requestId: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIFT_CODE_RE = /^BZV-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Gift card checkout is not configured yet.");
  return key;
}

function giftCardSecret() {
  const configured = process.env.GIFT_CARD_SECRET;
  if (configured) return configured;
  if (process.env.APP_ENV === "production") {
    throw new Error("GIFT_CARD_SECRET must be configured before gift cards can be used in production.");
  }
  // Local/preview convenience only. Production deliberately has no fallback:
  // rotating an unrelated service credential must never change issued codes.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Gift card security is not configured yet.");
  return secret;
}

function formBody(values: Record<string, string>) {
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${stripeSecretKey()}`, ...init.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Stripe could not start gift card checkout.");
  return body as T;
}

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function codeForCard(cardSeed: string, businessId: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(giftCardSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${businessId}:${cardSeed}`)),
  );
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let compact = "";
  for (let i = 0; i < 12; i++) compact += alphabet[signature[i] % alphabet.length];
  return `BZV-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

function cleanText(value: string | undefined, max: number, required = false) {
  const clean = (value ?? "").trim();
  if ((required && !clean) || clean.length > max) throw new Error("Please check the gift card details.");
  return clean;
}

function cleanEmail(value: string | undefined, required = false) {
  const clean = cleanText(value, 254, required).toLowerCase();
  if (clean && !EMAIL_RE.test(clean)) throw new Error("Please enter a valid email address.");
  return clean;
}

export const startGiftCardCheckout = createServerFn({ method: "POST" })
  .validator((data: PurchaseInput) => {
    if (!UUID_RE.test(data.businessId) || !Number.isInteger(data.amountCents)) throw new Error("Invalid gift card.");
    if (data.amountCents < 1000 || data.amountCents > 50000) throw new Error("Choose an amount between £10 and £500.");
    if (!/^\/gift\/[a-z0-9-]+$/i.test(data.returnPath)) throw new Error("Invalid return page.");
    cleanText(data.purchaserName, 120, true);
    cleanEmail(data.purchaserEmail, true);
    cleanText(data.recipientName, 120, true);
    cleanEmail(data.recipientEmail);
    cleanText(data.message, 300);
    return data;
  })
  .handler(async ({ data }): Promise<{ checkoutUrl: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business, error } = await supabaseAdmin
      .from("businesses")
      .select("id, name, currency, stripe_account_id, stripe_charges_enabled")
      .eq("id", data.businessId)
      .maybeSingle();
    if (error) throw error;
    if (!business?.stripe_account_id || !business.stripe_charges_enabled) {
      throw new Error("This business is not accepting gift card payments yet.");
    }

    const orderId = crypto.randomUUID();
    const claimToken = randomToken();
    const code = await codeForCard(orderId, business.id);
    const currency = business.currency.toLowerCase();
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const requestHeaders = getRequestHeaders();
    // Cloudflare overwrites cf-connecting-ip, so callers cannot rotate it.
    // Forwarded headers are accepted only in local/preview environments.
    const connection = requestHeaders.get("cf-connecting-ip") ||
      (process.env.APP_ENV !== "production"
        ? requestHeaders.get("x-real-ip") || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
        : undefined) ||
      "unknown";
    const order = {
      id: orderId,
      business_id: business.id,
      amount_cents: data.amountCents,
      currency,
      purchaser_name: cleanText(data.purchaserName, 120, true),
      purchaser_email: cleanEmail(data.purchaserEmail, true),
      recipient_name: cleanText(data.recipientName, 120, true),
      recipient_email: cleanEmail(data.recipientEmail) || null,
      message: cleanText(data.message, 300) || null,
      code_hash: await sha256(code),
      code_hint: code.slice(-4),
      display_token_hash: await sha256(claimToken),
      request_key: await sha256(`${business.id}:${connection}`),
    };
    const { error: insertError } = await (supabaseAdmin as any).rpc("create_gift_card_order", {
      p_order_id: order.id,
      p_business_id: order.business_id,
      p_amount_cents: order.amount_cents,
      p_currency: order.currency,
      p_purchaser_name: order.purchaser_name,
      p_purchaser_email: order.purchaser_email,
      p_recipient_name: order.recipient_name,
      p_recipient_email: order.recipient_email ?? "",
      p_message: order.message ?? "",
      p_code_hash: order.code_hash,
      p_code_hint: order.code_hint,
      p_display_token_hash: order.display_token_hash,
      p_request_key: order.request_key,
    });
    if (insertError) throw insertError;

    const origin = trustedAppOrigin();
    const success = `${origin}${data.returnPath}?gift=success&order_id=${orderId}&claim=${claimToken}`;
    const session = await stripeRequest<{ id: string; url: string }>("/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Account": business.stripe_account_id,
          "Idempotency-Key": `bookzenvo-gift-card-${orderId}`,
        },
        body: formBody({
          mode: "payment",
          customer_email: order.purchaser_email,
          success_url: success,
          cancel_url: `${origin}${data.returnPath}?gift=cancelled`,
          "line_items[0][price_data][currency]": currency,
          "line_items[0][price_data][product_data][name]": `${business.name} gift card`,
          "line_items[0][price_data][unit_amount]": String(data.amountCents),
          "line_items[0][quantity]": "1",
          "metadata[checkout_flow]": "gift_card",
          "metadata[business_id]": business.id,
          "metadata[gift_card_order_id]": orderId,
          "payment_intent_data[metadata][checkout_flow]": "gift_card",
          "payment_intent_data[metadata][business_id]": business.id,
          "payment_intent_data[metadata][gift_card_order_id]": orderId,
        }),
    });
    const { error: updateError } = await (supabaseAdmin as any)
      .from("gift_card_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", orderId)
      .eq("status", "pending");
    if (updateError) throw updateError;
    return { checkoutUrl: session.url };
  });

export const getGiftCardPurchaseResult = createServerFn({ method: "POST" })
  .validator((data: PurchaseResultInput) => {
    if (!UUID_RE.test(data.orderId) || !/^[0-9a-f]{64}$/i.test(data.claimToken)) throw new Error("Invalid gift card receipt.");
    return data;
  })
  .handler(async ({ data }): Promise<{ status: string; code?: string; recipientName?: string; amountCents?: number; currency?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256(data.claimToken);
    const { data: order, error } = await (supabaseAdmin as any)
      .from("gift_card_orders")
      .select("id, business_id, status, recipient_name, amount_cents, currency")
      .eq("id", data.orderId)
      .eq("display_token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new Error("Gift card receipt not found.");
    if (order.status !== "paid") return { status: order.status };
    return {
      status: "paid",
      code: await codeForCard(order.id, order.business_id),
      recipientName: order.recipient_name,
      amountCents: order.amount_cents,
      currency: order.currency,
    };
  });

export const issueGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: IssueInput) => {
    if (!Number.isInteger(data.amountCents) || data.amountCents < 100 || data.amountCents > 50000) {
      throw new Error("Choose an amount between £1 and £500.");
    }
    cleanText(data.recipientName, 120, true);
    cleanEmail(data.recipientEmail);
    cleanText(data.message, 300);
    return data;
  })
  .handler(async ({ data, context }): Promise<{ code: string }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, currency")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Only the business owner can issue gift cards.");

    const seed = crypto.randomUUID();
    const code = await codeForCard(seed, business.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: issueError } = await (supabaseAdmin as any).rpc("issue_gift_card", {
      p_business_id: business.id,
      p_amount_cents: data.amountCents,
      p_currency: business.currency,
      p_code_hash: await sha256(code),
      p_code_hint: code.slice(-4),
      p_recipient_name: cleanText(data.recipientName, 120, true),
      p_recipient_email: cleanEmail(data.recipientEmail),
      p_message: cleanText(data.message, 300),
      p_initiated_by_user_id: context.userId,
      p_idempotency_key: `issue:${seed}`,
    });
    if (issueError) throw issueError;
    return { code };
  });

export const redeemGiftCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: RedeemInput) => {
    const code = data.code.trim().toUpperCase();
    if (!UUID_RE.test(data.bookingId) || !UUID_RE.test(data.requestId) || !GIFT_CODE_RE.test(code)) {
      throw new Error("Check the gift card code and booking.");
    }
    return { ...data, code };
  })
  .handler(async ({ data, context }): Promise<{ amountCents: number; balanceCents: number }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Only the business owner can redeem gift cards.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: redeemError } = await (supabaseAdmin as any).rpc("redeem_gift_card", {
      p_business_id: business.id,
      p_booking_id: data.bookingId,
      p_code_hash: await sha256(data.code),
      p_initiated_by_user_id: context.userId,
      p_idempotency_key: `redeem:${data.requestId}`,
    });
    if (redeemError) throw new Error(redeemError.message || "Gift card could not be redeemed.");
    const result = rows?.[0];
    if (!result) throw new Error("Gift card could not be redeemed.");
    return { amountCents: result.amount_cents, balanceCents: result.balance_cents };
  });
