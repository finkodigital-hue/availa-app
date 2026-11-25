import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  AuthSessionChangedError,
  type AuthSessionStorage,
} from "./auth-session-storage";

type Auth = SupabaseClient["auth"];
export type MfaVerification = {
  factorId: string;
  code: string;
  signal?: AbortSignal;
};

/** Provider verification is isolated: its SDK can never persist or broadcast a
 * late session. Only the final shared SDK write may commit, under a fresh guard.
 */
export async function verifyMfaSession(
  input: MfaVerification,
  shared: Auth,
  isolated: Auth,
  storage: AuthSessionStorage,
): Promise<void> {
  let release: (() => void) | undefined;
  try {
    // Resolve shared initialization before preparing the candidate so its
    // setSession cannot wait on an unrelated startup network request.
    await shared.initialize();
    const snapshot = await storage.capture();
    if (input.signal?.aborted) throw new AuthSessionChangedError();
    const seeded = await isolated.setSession(snapshot.session);
    if (seeded.error || seeded.data.user?.id !== snapshot.session.user.id)
      throw new AuthSessionChangedError();
    const challenge = await isolated.mfa.challenge({
      factorId: input.factorId,
    });
    if (challenge.error || !challenge.data?.id)
      throw new Error("Provider verification failed");
    if (input.signal?.aborted) throw new AuthSessionChangedError();
    const verified = await isolated.mfa.verify({
      factorId: input.factorId,
      challengeId: challenge.data.id,
      code: input.code.trim(),
    });
    if (verified.error || !verified.data)
      throw new Error("Provider verification failed");
    const candidate = verified.data as Session;
    let expiresAt = 0;
    let subject: unknown;
    let assurance: unknown;
    try {
      const claims = JSON.parse(
        atob(
          candidate.access_token
            .split(".")[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ),
      );
      expiresAt = claims.exp;
      subject = claims.sub;
      assurance = claims.aal;
    } catch {
      /* Malformed provider responses fail closed below. */
    }
    // setSession must take its access-token validation path, not refresh an
    // expired candidate into an unregistered token. MFA responses are fresh.
    if (
      !candidate.access_token ||
      !candidate.refresh_token ||
      !candidate.user ||
      assurance !== "aal2" ||
      subject !== snapshot.session.user.id ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() / 1000 + 60
    )
      throw new Error("Provider verification failed");
    release = storage.guard(candidate, snapshot, input.signal);
    const committed = await shared.setSession(candidate);
    if (committed.error) throw new Error("Provider verification failed");
    if (input.signal?.aborted || !storage.isCurrent(committed.data.session))
      throw new AuthSessionChangedError();
  } catch (error) {
    // Never expose provider bodies, storage details, or token-bearing errors.
    if (error instanceof AuthSessionChangedError) throw error;
    if (
      error instanceof Error &&
      error.message ===
        "This browser cannot safely complete this security check. Please use an up-to-date browser and try again."
    )
      throw error;
    throw new Error(
      "We couldn't verify that code. Check your connection and authenticator, then try again.",
    );
  } finally {
    release?.();
    // No signOut cleanup: that could remove a newer person's shared session.
    await isolated.stopAutoRefresh().catch(() => {});
  }
}
