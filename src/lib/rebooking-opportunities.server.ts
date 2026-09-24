/* eslint-disable @typescript-eslint/no-explicit-any -- Consent columns are not in generated Supabase types yet. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  selectRebookingOpportunities,
  type RebookingConsent,
  type RebookingVisit,
} from "@/lib/rebooking-opportunities";

/** Call only after verifying the signed-in owner owns businessId. This bypasses RLS for the server-only consent table. */
export async function loadRebookingOpportunities({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  // New consent columns are not yet in generated Supabase types.
  const db = supabaseAdmin as any;
  const { data: preferences, error: preferencesError } = await db
    .from("notification_preferences")
    .select("customer_rebooking_email")
    .eq("business_id", businessId)
    .maybeSingle();
  if (preferencesError) throw preferencesError;
  if (preferences?.customer_rebooking_email !== true) {
    return { opportunities: [], available: false, partial: false };
  }

  const now = new Date();
  const oldestVisit = new Date(now.getTime() - 366 * 86_400_000).toISOString();
  const {
    data: consent,
    error: consentError,
    count: consentCount,
  } = await db
    .from("customer_marketing_preferences")
    .select("customer_id,status,channel,source,granted_at", { count: "exact" })
    .eq("business_id", businessId)
    .eq("channel", "email")
    .eq("status", "subscribed")
    .eq("source", "booking")
    .limit(1000);
  if (consentError) throw consentError;
  const customerIds = (consent ?? []).map(
    (row: RebookingConsent) => row.customer_id,
  );
  if (!customerIds.length)
    return { opportunities: [], available: true, partial: false };

  const [visitsResult, futureResult] = await Promise.all([
    db
      .from("bookings")
      .select(
        "id,customer_id,customer_name,ends_at,rebooking_reminder_sent_at,services(id,name,rebooking_interval_days)",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .eq("status", "completed")
      .in("customer_id", customerIds)
      .gte("ends_at", oldestVisit)
      .lte("ends_at", now.toISOString())
      .order("ends_at", { ascending: false })
      .limit(500),
    db
      .from("bookings")
      .select("customer_id", { count: "exact" })
      .eq("business_id", businessId)
      .in("customer_id", customerIds)
      .gt("starts_at", now.toISOString())
      .not("status", "in", "(cancelled,no_show)")
      .limit(1000),
  ]);
  if (visitsResult.error) throw visitsResult.error;
  if (futureResult.error) throw futureResult.error;
  // Truncated future bookings would risk contacting someone who is booked already.
  if ((futureResult.count ?? 0) > (futureResult.data?.length ?? 0)) {
    return { opportunities: [], available: false, partial: true };
  }

  const visits: RebookingVisit[] = (visitsResult.data ?? []).map(
    (row: any) => ({
      ...row,
      services: Array.isArray(row.services)
        ? (row.services[0] ?? null)
        : row.services,
    }),
  );
  return {
    opportunities: selectRebookingOpportunities({
      now,
      businessName,
      consent: (consent ?? []) as RebookingConsent[],
      visits,
      futureCustomerIds: (futureResult.data ?? []).map(
        (row: { customer_id: string }) => row.customer_id,
      ),
    }),
    available: true,
    partial:
      (consentCount ?? 0) > customerIds.length ||
      (visitsResult.count ?? 0) > visits.length,
  };
}
