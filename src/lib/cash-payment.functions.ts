import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordCashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        businessId: z.uuid(),
        bookingId: z.uuid(),
        requestId: z.uuid(),
        amountCents: z.number().int().positive().max(2147483647),
        currency: z.string().regex(/^[a-zA-Z]{3}$/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("id", data.businessId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business)
      throw new Error("Only the business owner can record cash payments.");
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data: booking, error: paymentError } = await supabaseAdmin.rpc(
      "record_cash_payment",
      {
        p_business_id: business.id,
        p_booking_id: data.bookingId,
        p_amount_cents: data.amountCents,
        p_currency: data.currency,
        p_request_id: data.requestId,
        p_user_id: context.userId,
      },
    );
    if (paymentError) throw new Error(paymentError.message);
    return z
      .object({
        id: z.string(),
        payment_status: z.string(),
        status: z.string(),
        amount_paid_cents: z.number(),
        amount_due_cents: z.number(),
        price_cents: z.number(),
      })
      .parse(booking);
  });
