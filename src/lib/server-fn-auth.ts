import { supabase } from "@/integrations/supabase/client";

/**
 * Server functions run in a separate request from the browser session. Supply
 * the current Supabase token explicitly for actions that change payment data.
 */
export async function getServerFnAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (!data.session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return { Authorization: `Bearer ${data.session.access_token}` };
}
