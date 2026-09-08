import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const STUDIO_FEATURE_ERROR = "This feature is on the Studio plan.";

export async function assertStudio(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("plan")
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Business not found.");
  if ((data.plan ?? "free") !== "studio") throw new Error(STUDIO_FEATURE_ERROR);
}
