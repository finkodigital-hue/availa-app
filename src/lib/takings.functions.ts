import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DailyTakings, UnpaidBooking } from "./takings";

const method = z.enum(["cash", "card", "bank_transfer", "other"]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid date.");

export const getDailyTakings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { day: string }) => z.object({ day }).parse(data))
  .handler(async ({ data, context }): Promise<DailyTakings> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .single();
    if (error || !business) throw new Error("Business not found.");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    // New RPCs are deployed with the daily-takings migration.
    const { data: result, error: queryError } = await supabaseAdmin.rpc(
      "get_daily_takings" as never,
      { p_business_id: business.id, p_day: data.day } as never,
    );
    if (queryError)
      throw new Error("Daily takings could not be loaded. Please try again.");
    return result as unknown as DailyTakings;
  });

export const getUnpaidBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { search: string }) =>
    z.object({ search: z.string().trim().max(100) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<UnpaidBooking[]> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .single();
    if (error || !business) throw new Error("Business not found.");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: result, error: queryError } = await supabaseAdmin.rpc(
      "takings_unpaid_bookings" as never,
      { p_business_id: business.id, p_search: data.search } as never,
    );
    if (queryError)
      throw new Error("Could not load bookings. Please try again.");
    return result as unknown as UnpaidBooking[];
  });

export const recordManualReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      bookingId: string;
      amountCents: number;
      method: string;
      key: string;
      currency: string;
    }) =>
      z
        .object({
          bookingId: z.uuid(),
          amountCents: z.number().int().positive().max(2147483647),
          method,
          key: z.uuid(),
          currency: z.string().regex(/^[a-zA-Z]{3}$/),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .single();
    if (error || !business) throw new Error("Business not found.");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { error: writeError } = await supabaseAdmin.rpc(
      "record_manual_receipt" as never,
      {
        p_business_id: business.id,
        p_booking_id: data.bookingId,
        p_amount_cents: data.amountCents,
        p_method: data.method,
        p_key: data.key,
        p_actor: context.userId,
        p_currency: data.currency,
      } as never,
    );
    if (writeError) throw new Error(writeError.message);
    return { ok: true };
  });

export const classifyReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; method: string }) =>
    z.object({ id: z.uuid(), method }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .single();
    if (error || !business) throw new Error("Business not found.");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: receipt, error: writeError } = await supabaseAdmin
      .from("payments")
      .update({ payment_method: data.method } as never)
      .eq("id", data.id)
      .eq("business_id", business.id)
      .filter("payment_method", "eq", "unknown")
      .is("stripe_payment_intent_id", null)
      .eq("type", "charge")
      .eq("status", "succeeded")
      .select("id")
      .maybeSingle();
    if (writeError || !receipt)
      throw new Error(
        "Could not classify this payment. Refresh and try again.",
      );
    return { ok: true };
  });
