type TokenPair = { access_token: string; refresh_token: string };
type AuthClient = {
  getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  setSession(tokens: TokenPair): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
  signOut(): Promise<unknown>;
};

/** The WebView may refresh or complete MFA before the native client does.
 * Validate that token with Auth before persisting it, and serialize writes so
 * a late verification cannot undo an explicit sign-out. No JWT claim is trusted
 * as identity, and adoption never manufactures a new authentication timestamp.
 */
export function createNativeSessionBridge(client: AuthClient, userId: string, currentAccessToken: () => string | undefined = () => undefined) {
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;
  let revision = 0;
  let adoptedAccessToken = '';
  const enqueue = <T>(action: () => Promise<T>) => {
    const result = queue.catch(() => undefined).then(action);
    queue = result;
    return result;
  };
  return {
    adopt(accessToken: unknown, refreshToken: unknown) {
      if (closed || typeof accessToken !== 'string' || typeof refreshToken !== 'string' ||
          !accessToken || !refreshToken || accessToken.length > 200_000 || refreshToken.length > 8192) {
        return Promise.resolve(false);
      }
      const current = ++revision;
      return enqueue(async () => {
        if (closed || current !== revision || adoptedAccessToken === accessToken) return false;
        const verified = await client.getUser(accessToken);
        if (closed || current !== revision || verified.error || verified.data.user?.id !== userId) return false;
        // This comparison only prevents replacing an existing SDK session with
        // an older/lower-assurance copy. Identity was verified above.
        const claims = (token: string | undefined) => {
          try { return JSON.parse(atob((token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
          catch { return {}; }
        };
        const existing = claims(currentAccessToken());
        const incoming = claims(accessToken);
        if (existing.exp > Date.now() / 1000 &&
            (existing.iat > incoming.iat || (existing.aal === 'aal2' && incoming.aal !== 'aal2'))) return false;
        const result = await client.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (result.error || !result.data.session) return false;
        if (result.data.session.user.id !== userId) {
          closed = true;
          await client.signOut();
          return false;
        }
        if (closed) return false; // An already queued signOut is the final write.
        adoptedAccessToken = accessToken;
        return true;
      });
    },
    signOut() {
      closed = true;
      revision++;
      return enqueue(() => client.signOut());
    },
    isClosed: () => closed,
  };
}
