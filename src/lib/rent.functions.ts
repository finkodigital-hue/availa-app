import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStudio } from "@/lib/plan.server";

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
    const { data: links, error: linksError } = await context.supabase
      .from("salon_professionals")
      .select("id")
      .eq("salon_business_id", businessId);
    if (linksError) throw linksError;
    const linkIds = (links ?? []).map((link: { id: string }) => link.id);
    if (!linkIds.length) return [];
    const { data, error } = await context.supabase
      .from("rent_payments")
      .select("*")
      .in("salon_professional_id", linkIds)
      .order("period_start", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const setRentPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; linkId: string; status: "paid" | "waived" | "due" }) => data)
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    const { error } = await context.supabase
      .from("rent_payments")
      .update({ status: data.status, paid_at: data.status === "paid" ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("salon_professional_id", data.linkId);
    if (error) throw error;
    return { ok: true };
  });

export const generateNextRentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { linkId: string }) => data)
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    const { error } = await context.supabase.rpc("generate_rent_payment" as any, { _link_id: data.linkId });
    if (error) throw error;
    return { ok: true };
  });

export const addRentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: {
    linkId: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    amountCents: number;
    alreadyPaid: boolean;
  }) => ({ ...data, amountCents: Math.max(0, Math.round(Number(data.amountCents) || 0)) }))
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioSalon(context);
    await ownedLink(context, businessId, data.linkId);
    if (data.amountCents <= 0) throw new Error("Enter an amount greater than 0.");
    const { error } = await context.supabase.from("rent_payments").insert({
      salon_professional_id: data.linkId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      due_date: data.dueDate,
      amount_cents: data.amountCents,
      status: data.alreadyPaid ? "paid" : "due",
      paid_at: data.alreadyPaid ? new Date().toISOString() : null,
    });
    if (error) throw error;
    return { ok: true };
  });
