import type { SupabaseClient } from "@supabase/supabase-js";

/** Validate both the signed session and the current account/factor state. */
export async function requireVerifiedIdentity(
  client: Pick<SupabaseClient, "auth">,
  token: string,
) {
  const [{ data: identity, error: userError }, { data, error: claimsError }] =
    await Promise.all([
      client.auth.getUser(token),
      client.auth.getClaims(token),
    ]);
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

/** Require a fresh, phishing-resistant step-up for destructive or sensitive work. */
export function requireRecentSensitiveSession(
  claims: Record<string, unknown>,
  maxAgeSeconds = 10 * 60,
) {
  const now = Math.floor(Date.now() / 1000);
  const authenticationTimes: number[] = [];
  const authTime = Number(claims.auth_time);
  if (Number.isFinite(authTime) && authTime > 0)
    authenticationTimes.push(authTime);

  // Supabase access tokens do not normally include the OpenID `auth_time`
  // claim. Their signed `amr` entries carry the actual authentication-method
  // timestamps instead. Ignore token refreshes: renewing an access token must
  // not make an old sign-in count as a fresh sensitive-action verification.
  if (Array.isArray(claims.amr)) {
    for (const entry of claims.amr) {
      if (!entry || typeof entry !== "object") continue;
      const method = String((entry as Record<string, unknown>).method ?? "");
      const timestamp = Number((entry as Record<string, unknown>).timestamp);
      if (
        method &&
        method !== "token_refresh" &&
        method !== "anonymous" &&
        Number.isFinite(timestamp) &&
        timestamp > 0
      ) {
        authenticationTimes.push(timestamp);
      }
    }
  }

  const mostRecentAuthentication = Math.max(...authenticationTimes, 0);
  if (
    mostRecentAuthentication <= 0 ||
    mostRecentAuthentication > now + 60 ||
    now - mostRecentAuthentication > maxAgeSeconds
  ) {
    throw new Error(
      "Recent sign-in required. Sign out and sign in again before continuing.",
    );
  }
  if (claims.aal !== "aal2") {
    throw new Error(
      "Two-factor verification is required for this sensitive action.",
    );
  }
}
