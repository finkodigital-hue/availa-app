import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStudio } from "@/lib/plan.server";

export type StockItemInput = {
  id?: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit: string | null;
  current_stock: number;
  low_stock_threshold: number | null;
  cost_cents: number | null;
};

async function ownedStudioBusiness(context: any) {
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

function cleanItem(input: StockItemInput) {
  const name = input.name?.trim().slice(0, 150);
  if (!name) throw new Error("Add an item name.");
  return {
    name,
    brand: input.brand?.trim().slice(0, 100) || null,
    category: input.category?.trim().slice(0, 80) || "Other",
    unit: input.unit?.trim().slice(0, 40) || "unit",
    current_stock: Math.max(0, Number(input.current_stock) || 0),
    low_stock_threshold: input.low_stock_threshold == null ? null : Math.max(0, Number(input.low_stock_threshold) || 0),
    cost_cents: input.cost_cents == null ? null : Math.max(0, Math.round(Number(input.cost_cents) || 0)),
  };
}

export const getStockItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const businessId = await ownedStudioBusiness(context);
    const { data, error } = await context.supabase
      .from("inventory_items")
      .select("*")
      .eq("business_id", businessId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const saveStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: StockItemInput) => ({ ...cleanItem(data), id: data.id }))
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioBusiness(context);
    const { id, ...values } = data;
    const query = id
      ? context.supabase.from("inventory_items").update(values).eq("id", id).eq("business_id", businessId)
      : context.supabase.from("inventory_items").insert({ ...values, business_id: businessId });
    const { error } = await query;
    if (error) throw error;
    return { ok: true };
  });

export const setStockQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; quantity: number }) => ({ id: data.id, quantity: Math.max(0, Number(data.quantity) || 0) }))
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioBusiness(context);
    const { error } = await context.supabase
      .from("inventory_items")
      .update({ current_stock: data.quantity })
      .eq("id", data.id)
      .eq("business_id", businessId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioBusiness(context);
    const { error } = await context.supabase.from("inventory_items").delete().eq("id", data.id).eq("business_id", businessId);
    if (error) throw error;
    return { ok: true };
  });

export const applyStockScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { items: StockItemInput[] }) => ({ items: data.items.slice(0, 40).map((item) => ({ ...cleanItem(item), id: item.id })) }))
  .handler(async ({ data, context }) => {
    const businessId = await ownedStudioBusiness(context);
    const rows = data.items.map(({ id, ...item }) => ({ ...item, id, business_id: businessId }));
    if (rows.length) {
      const { error } = await context.supabase.from("inventory_items").upsert(rows, { onConflict: "id" });
      if (error) throw error;
    }
    return { ok: true };
  });
