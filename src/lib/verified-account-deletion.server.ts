import type { SupabaseClient } from "@supabase/supabase-js";
import { requireVerifiedIdentity } from "@/lib/verified-identity.server";

/** Requests do not delete data. A fresh primary sign-in is required; existing
 * enrolled MFA is checked against the provider's current user by the shared
 * verifier. This deliberately does not change payment/erasure AAL2 rules.
 */
export async function requireAccountDeletionIdentity(
  client: Pick<SupabaseClient, "auth">,
  token: string,
  expectedUserId: string,
  recent: boolean,
) {
  if (!token || !expectedUserId)
    throw new Error("Please sign in to manage your account.");
  const { user, claims } = await requireVerifiedIdentity(client, token);
  const lifecycle = user as typeof user & {
    banned_until?: string;
    deleted_at?: string;
  };
  if (
    user.id !== expectedUserId ||
    !user.email ||
    !user.email_confirmed_at ||
    user.is_anonymous ||
    lifecycle.deleted_at ||
    (lifecycle.banned_until && Date.parse(lifecycle.banned_until) > Date.now())
  ) {
    throw new Error(
      "Your account could not be verified. Please sign in again.",
    );
  }
  if (recent) {
    const now = Math.floor(Date.now() / 1000);
    const times = Array.isArray(claims.amr)
      ? claims.amr.flatMap((entry: unknown) => {
          if (!entry || typeof entry !== "object") return [];
          const { method, timestamp } = entry as Record<string, unknown>;
          return (method === "password" || method === "oauth") &&
            typeof timestamp === "number" &&
            Number.isFinite(timestamp) &&
            timestamp > 0 &&
            timestamp <= now + 60
            ? [timestamp]
            : [];
        })
      : [];
    if (!times.length || now - Math.max(...times) > 600) {
      throw new Error(
        "Please sign out and sign in again, then return to Account & data within 10 minutes.",
      );
    }
  }
  return { userId: user.id, contactEmail: user.email };
}
