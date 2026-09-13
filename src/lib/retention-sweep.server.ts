/* eslint-disable @typescript-eslint/no-explicit-any -- New retention fields are server-only until the migration is deployed. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseTheme } from "@/lib/theme";
import { sendEmail } from "@/lib/resend.server";
import { buildAftercareEmail } from "@/lib/emails/aftercare-email.server";
import { buildRebookingEmail } from "@/lib/emails/rebooking-email.server";

type RetentionStats = {
  aftercareSent: number;
  aftercareFailed: number;
  rebookingSent: number;
  rebookingFailed: number;
};

const origin = () =>
  (process.env.APP_URL || "https://bookzenvo.com").replace(/\/$/, "");

export async function runRetentionSweep(): Promise<RetentionStats> {
  const stats: RetentionStats = {
    aftercareSent: 0,
    aftercareFailed: 0,
    rebookingSent: 0,
    rebookingFailed: 0,
  };
  const { data: businesses, error } = await (supabaseAdmin as any)
    .from("businesses")
    .select("id,name,slug,page_theme")
    .eq("plan", "studio")
    .is("deletion_requested_at", null);
  if (error) throw error;

  for (const business of businesses ?? []) {
    const { data: preferences } = await (supabaseAdmin as any)
      .from("notification_preferences")
      .select("customer_aftercare_email,customer_rebooking_email")
      .eq("business_id", business.id)
      .maybeSingle();

    if (preferences?.customer_aftercare_email !== false) {
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: completed } = await (supabaseAdmin as any)
        .from("bookings")
        .select(
          "id,customer_name,customer_email,customers(email),services!inner(name,aftercare_message)",
        )
        .eq("business_id", business.id)
        .eq("status", "completed")
        .is("aftercare_sent_at", null)
        .not("services.aftercare_message", "is", null)
        .gte("ends_at", sevenDaysAgo)
        .lte("ends_at", new Date().toISOString())
        .limit(50);

      for (const booking of completed ?? []) {
        const email = booking.customer_email || booking.customers?.email;
        const message = booking.services?.aftercare_message?.trim();
        if (!email || !message) continue;
        const claimedAt = new Date().toISOString();
        const { data: claim } = await (supabaseAdmin as any)
          .from("bookings")
          .update({ aftercare_sent_at: claimedAt })
          .eq("id", booking.id)
          .is("aftercare_sent_at", null)
          .select("id")
          .maybeSingle();
        if (!claim) continue;
        try {
          const { subject, html } = buildAftercareEmail({
            theme: parseTheme(business.page_theme),
            businessName: business.name,
            customerName: booking.customer_name,
            serviceName: booking.services.name,
            aftercareMessage: message,
          });
          await sendEmail({
            businessId: business.id,
            to: email,
            subject,
            html,
            messageType: "aftercare",
            idempotencyKey: `booking:${booking.id}:aftercare:v1`,
          });
          stats.aftercareSent++;
        } catch (sendError) {
          stats.aftercareFailed++;
          console.error("[retention] aftercare failed", booking.id, sendError);
          await (supabaseAdmin as any)
            .from("bookings")
            .update({ aftercare_sent_at: null })
            .eq("id", booking.id)
            .eq("aftercare_sent_at", claimedAt);
        }
      }
    }

    if (preferences?.customer_rebooking_email === true) {
      const { data: consentRows } = await (supabaseAdmin as any)
        .from("customer_marketing_preferences")
        .select("customer_id,unsubscribe_token")
        .eq("business_id", business.id)
        .eq("channel", "email")
        .eq("status", "subscribed")
        .limit(1000);
      const consentByCustomer = new Map(
        (consentRows ?? []).map((row: any) => [
          row.customer_id,
          row.unsubscribe_token,
        ]),
      );
      const customerIds = [...consentByCustomer.keys()];
      if (!customerIds.length) continue;

      const [{ data: visits }, { data: future }] = await Promise.all([
        (supabaseAdmin as any)
          .from("bookings")
          .select(
            "id,customer_id,customer_name,customer_email,ends_at,rebooking_reminder_sent_at,customers(name,email),services!inner(id,name,rebooking_interval_days)",
          )
          .eq("business_id", business.id)
          .eq("status", "completed")
          .in("customer_id", customerIds)
          .not("services.rebooking_interval_days", "is", null)
          .order("ends_at", { ascending: false })
          .limit(500),
        (supabaseAdmin as any)
          .from("bookings")
          .select("customer_id")
          .eq("business_id", business.id)
          .in("customer_id", customerIds)
          .gt("starts_at", new Date().toISOString())
          .not("status", "in", "(cancelled,no_show)"),
      ]);
      const futureCustomers = new Set(
        (future ?? []).map((row: any) => row.customer_id),
      );
      const seen = new Set<string>();
      let processed = 0;

      for (const booking of visits ?? []) {
        if (processed >= 50) break;
        const key = `${booking.customer_id}:${booking.services?.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Only the customer's latest completed visit for this service can
        // ever trigger a reminder. Once it has, older visits cannot surface
        // on the next cron run and create a duplicate message.
        if (booking.rebooking_reminder_sent_at) continue;
        if (futureCustomers.has(booking.customer_id)) continue;
        const days = Number(booking.services?.rebooking_interval_days);
        const dueAt = Date.parse(booking.ends_at) + days * 86_400_000;
        if (!Number.isFinite(dueAt) || dueAt > Date.now()) continue;
        const email = booking.customer_email || booking.customers?.email;
        const token = consentByCustomer.get(booking.customer_id);
        if (!email || !token) continue;

        const claimedAt = new Date().toISOString();
        const { data: claim } = await (supabaseAdmin as any)
          .from("bookings")
          .update({ rebooking_reminder_sent_at: claimedAt })
          .eq("id", booking.id)
          .is("rebooking_reminder_sent_at", null)
          .select("id")
          .maybeSingle();
        if (!claim) continue;
        processed++;
        try {
          const { subject, html } = buildRebookingEmail({
            theme: parseTheme(business.page_theme),
            businessName: business.name,
            customerName:
              booking.customer_name || booking.customers?.name || "there",
            serviceName: booking.services.name,
            bookingUrl: `${origin()}/book/${encodeURIComponent(business.slug)}`,
            unsubscribeUrl: `${origin()}/api/marketing-unsubscribe/${token}`,
          });
          await sendEmail({
            businessId: business.id,
            to: email,
            subject,
            html,
            messageType: "rebooking_reminder",
            idempotencyKey: `booking:${booking.id}:rebooking:v1`,
          });
          stats.rebookingSent++;
        } catch (sendError) {
          stats.rebookingFailed++;
          console.error("[retention] rebooking failed", booking.id, sendError);
          await (supabaseAdmin as any)
            .from("bookings")
            .update({ rebooking_reminder_sent_at: null })
            .eq("id", booking.id)
            .eq("rebooking_reminder_sent_at", claimedAt);
        }
      }
    }
  }
  return stats;
}
