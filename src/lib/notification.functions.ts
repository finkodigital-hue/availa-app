/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only migration tables are absent from generated browser types. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PREFERENCE_KEYS = [
  "owner_booking_created",
  "owner_booking_cancelled",
  "owner_consultation_signed",
  "owner_low_stock",
  "owner_payment_failed",
  "customer_booking_confirmation",
  "customer_booking_reminder",
] as const;
type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

async function ownerBusinessId(context: any) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error("Only the business owner can manage notifications.");
  return data.id as string;
}

export const getNotificationCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const businessId = await ownerBusinessId(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const [
      { data: notifications, error: notificationError },
      { data: deliveries, error: deliveryError },
      { data: saved, error: preferenceError },
    ] = await Promise.all([
      supabaseAdmin
        .from("notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(30),
      (supabaseAdmin as any)
        .from("notification_deliveries")
        .select(
          "id,message_type,recipient_masked,subject,status,attempt_count,last_error,created_at,sent_at,delivered_at",
        )
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(30),
      (supabaseAdmin as any)
        .from("notification_preferences")
        .select(PREFERENCE_KEYS.join(","))
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);
    if (notificationError) throw notificationError;
    if (deliveryError) throw deliveryError;
    if (preferenceError) throw preferenceError;
    const defaults = Object.fromEntries(
      PREFERENCE_KEYS.map((key) => [key, true]),
    );
    return {
      notifications: notifications ?? [],
      deliveries: deliveries ?? [],
      preferences: { ...defaults, ...(saved ?? {}) },
    };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { ids: string[] }) => ({
    ids: data.ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    const businessId = await ownerBusinessId(context);
    if (!data.ids.length) return { updated: 0 };
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .in("id", data.ids)
      .select("id");
    if (error) throw error;
    return { updated: rows?.length ?? 0 };
  });

export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: Record<string, unknown>) =>
      Object.fromEntries(
        PREFERENCE_KEYS.map((key) => [key, data[key] !== false]),
      ) as Record<PreferenceKey, boolean>,
  )
  .handler(async ({ data, context }) => {
    const businessId = await ownerBusinessId(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("notification_preferences")
      .upsert(
        {
          business_id: businessId,
          ...data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );
    if (error) throw error;
    return { saved: true };
  });
