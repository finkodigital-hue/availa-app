import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only shortlist. No messages are sent, and consent never reaches the client. */
export const getRebookingOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id,name,plan")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business || business.plan !== "studio")
      return { opportunities: [], available: false, partial: false };
    const { loadRebookingOpportunities } =
      await import("@/lib/rebooking-opportunities.server");
    return loadRebookingOpportunities({
      businessId: business.id,
      businessName: business.name,
    });
  });
