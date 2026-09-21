import type { SupabaseClient } from "@supabase/supabase-js";

/** Validate both the signed session and the current account/factor state. */
export async function requireVerifiedIdentity(
  client: Pick<SupabaseClient, "auth">,
  token: string,
) {
  const [{ data: identity, error: userError }, { data, error: claimsError }] =
    await Promise.all([client.auth.getUser(token), client.auth.getClaims(token)]);
  const user = identity.user;
  if (userError || claimsError || !user || data?.claims.sub !== user.id) {
    throw new Error("Unauthorized");
  }
  if (user.email && !user.email_confirmed_at) {
    throw new Error("Email verification required");
  }
  if (
    user.factors?.some((factor) => factor.status === "verified") &&
    data.claims.aal !== "aal2"
  ) {
    throw new Error("Two-factor verification required");
  }
  return { user, claims: data.claims };
}
