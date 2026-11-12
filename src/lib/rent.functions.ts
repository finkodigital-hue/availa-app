import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStudio } from "@/lib/plan.server";
import { rentId, validateRentPayment } from "@/lib/rent";
import { collectRequestPages } from "@/lib/appointment-waitlist";

async function ownedStudioSalon(context: any) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Business not found.");
  await assertStudio(data.id);
  return data.id as string;
}

async function ownedLink(context: any, businessId: string, linkId: string) {
  const { data, error } = await context.supabase
    .from("salon_professionals")
    .select("id")
    .eq("id", linkId)
    .eq("salon_business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Professional link not found.");
}

export const getRentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const businessId = await ownedStudioSalon(context);
    const links = await collectRequestPages<{ id: string }>((from, to) =>
      context.supabase
        .from("salon_professionals")
        .select("id")
        .eq("salon_business_id", businessId)
        .order("id")
        .range(from, to),
    );
    const linkIds = (links ?? []).map((link: { id: string }) => link.id);
    if (!linkIds.length) return [];
    const data = await collectRequestPages((from, to) =>
      context.supabase
        .from("rent_payments")
        .select("*")
        .in("salon_professional_id", linkIds)
        .order("period_start", { ascending: false })
        .order("id")
        .range(from, to),
    );
    return data ?? [];
  });

export const setRentPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (data: {
      id: string;
      linkId: string;
      status: "paid" | "waived" | "due";
    }) => {
      if (!["paid", "waived", "due"].includes(data?.status))
        throw new Error("Choose a valid rent status.");
      return {
        id: rentId(data.id),
        linkId: rentId(data.linkId),
        status: data.status,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    const { data: row, error } = await context.supabase
      .from("rent_payments")
      .update({
        status: data.status,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .eq("salon_professional_id", data.linkId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Rent payment not found. Refresh the ledger.");
    return { ok: true };
  });

export const generateNextRentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { linkId: string; requestId: string }) => ({
    linkId: rentId(data?.linkId),
    requestId: rentId(data?.requestId),
  }))
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    const { error } = await context.supabase.rpc(
      "generate_rent_payment" as any,
      { _link_id: data.linkId, _request_id: data.requestId },
    );
    if (error) throw error;
    return { ok: true };
  });

export const addRentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateRentPayment)
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    const record = {
      id: data.requestId,
      salon_professional_id: data.linkId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      due_date: data.dueDate,
      amount_cents: data.amountCents,
      status: data.alreadyPaid ? "paid" : "due",
      paid_at: data.alreadyPaid ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase
      .from("rent_payments")
      .insert(record);
    if (error?.code === "23505") {
      const { data: existing, error: lookupError } = await context.supabase
        .from("rent_payments")
        .select(
          "id,salon_professional_id,period_start,period_end,due_date,amount_cents",
        )
        .eq("id", data.requestId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (
        !existing ||
        [
          "salon_professional_id",
          "period_start",
          "period_end",
          "due_date",
          "amount_cents",
        ].some((key) => (existing as any)[key] !== (record as any)[key])
      )
        throw new Error(
          "This request was already used for different rent details. Refresh the ledger.",
        );
    } else if (error) throw error;
    return { ok: true };
  });
