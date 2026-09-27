import { normalizeBookingSource } from "@/lib/booking-attribution";

/** Called only after booking creation succeeds, never on a link click/checkout start. */
export async function recordBookingSource(
  bookingId: string,
  businessId: string,
  source: unknown,
) {
  const normalized = normalizeBookingSource(source);
  if (!normalized) return;
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc: (
      name: string,
      args: { p_booking_id: string; p_business_id: string; p_source: string },
    ) => Promise<{ error: Error | null }>;
  };
  const { error } = await db.rpc("record_booking_source", {
    p_booking_id: bookingId,
    p_business_id: businessId,
    p_source: normalized,
  });
  if (error) throw error;
}
