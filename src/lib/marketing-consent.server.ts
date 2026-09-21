/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only consent table is introduced by a pending migration. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const EMAIL_MARKETING_CONSENT_VERSION = "salon-email-marketing-v1";

export async function recordBookingEmailMarketingConsent({
  bookingId,
  businessId,
}: {
  bookingId: string;
  businessId: string;
}) {
  const { data: booking, error } = await (supabaseAdmin as any)
    .from("bookings")
    .select("customer_id, customer_email")
    .eq("id", bookingId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error || !booking?.customer_id) {
    throw error ?? new Error("The booking customer could not be identified.");
  }
  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers").select("email").eq("id", booking.customer_id)
    .eq("business_id", businessId).maybeSingle();
  if (customerError) throw customerError;
  // Phone matching is not proof that the booking owns an existing email.
  if (!customer?.email || !booking.customer_email ||
    customer.email.trim().toLowerCase() !== booking.customer_email.trim().toLowerCase()) return;

  const now = new Date().toISOString();
  const { error: consentError } = await (supabaseAdmin as any)
    .from("customer_marketing_preferences")
    .upsert(
      {
        business_id: businessId,
        customer_id: booking.customer_id,
        channel: "email",
        status: "subscribed",
        consent_version: EMAIL_MARKETING_CONSENT_VERSION,
        source: "booking",
        granted_at: now,
        revoked_at: null,
        updated_at: now,
      },
      // An anonymous booking must never overwrite a previous withdrawal.
      { onConflict: "business_id,customer_id,channel", ignoreDuplicates: true },
    );
  if (consentError) throw consentError;
}

export async function unsubscribeMarketingEmail(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const now = new Date().toISOString();
  const { data, error } = await (supabaseAdmin as any)
    .from("customer_marketing_preferences")
    .update({
      status: "unsubscribed",
      source: "unsubscribe",
      revoked_at: now,
      updated_at: now,
    })
    .eq("unsubscribe_token", token)
    .eq("channel", "email")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
