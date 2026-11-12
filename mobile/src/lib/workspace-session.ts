// Must match the same-origin website client's stable auth storage key.
export const WORKSPACE_AUTH_STORAGE_KEY = "bookzenvo-auth";

type WorkspaceSession = { access_token: string; refresh_token?: string; user?: { id: string } };

export function recoverySessionFromDeepLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "bookzenvo:" || url.hostname !== "auth" || url.pathname !== "/reset" || url.username || url.password || url.port) return null;
    const params = new URLSearchParams(url.hash.slice(1));
    if (params.get("type") !== "recovery") return null;
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token || params.getAll("access_token").length !== 1 || params.getAll("refresh_token").length !== 1) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
}

export function workspaceSessionScript(session: WorkspaceSession, appUrl: string) {
  const origin = new URL(appUrl).origin;
  return `
    (function () {
      if (window.location.origin !== ${JSON.stringify(origin)} || window.__bookzenvoNativeSignedOut) return;
      try {
        var key = ${JSON.stringify(WORKSPACE_AUTH_STORAGE_KEY)};
        var session = ${JSON.stringify(session)};
        var nextValue = JSON.stringify(session);
        var previousValue = localStorage.getItem(key);
        var previous = null;
        try { previous = JSON.parse(previousValue); } catch (_) {}
        var sameUser = previous && previous.user && session.user && previous.user.id === session.user.id;
        var claims = function (token) {
          try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
          catch (_) { return {}; }
        };
        var previousClaims = claims(previous && previous.access_token || '');
        var nextClaims = claims(session.access_token);
        // Claims here decide which local copy to preserve, never authorisation.
        // Native verifies the preserved token with Supabase before adopting it.
        var pendingWebUpdate = sameUser && window.__bookzenvoPendingWebAccessToken &&
          window.__bookzenvoPendingWebAccessToken !== session.access_token;
        var fresherWebSession = sameUser && previous.access_token !== session.access_token &&
          previousClaims.exp > Date.now() / 1000 &&
          (previousClaims.iat > nextClaims.iat || (previousClaims.aal === 'aal2' && nextClaims.aal !== 'aal2'));
        if ((pendingWebUpdate || fresherWebSession) && previous.refresh_token) {
          window.__bookzenvoNativeAccessToken = previous.access_token;
          window.__bookzenvoPendingWebAccessToken = previous.access_token;
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'workspace-session-updated', accessToken: previous.access_token, refreshToken: previous.refresh_token
          }));
          return;
        }
        delete window.__bookzenvoPendingWebAccessToken;
        window.__bookzenvoNativeAccessToken = session.access_token;
        window.__bookzenvoApplyingNativeSession = true;
        try { localStorage.setItem(key, nextValue); }
        finally { window.__bookzenvoApplyingNativeSession = false; }
        if (previousValue !== nextValue) {
          // Supabase listens on BroadcastChannel, not StorageEvent. Notify a
          // client that has already initialised as well as seeding first load.
          if (typeof BroadcastChannel !== "undefined") {
            var channel = new BroadcastChannel(key);
            channel.postMessage({ event: previousValue && sameUser ? "TOKEN_REFRESHED" : "SIGNED_IN", session: session });
            channel.close();
          } else if (previousValue === null) {
            // Older WebViews can initialise before onLoadEnd seeds storage.
            // One reload lets the website read the newly saved session.
            window.location.reload();
          }
        }
      } catch (error) {
        // Normal web sign-in remains available when storage is unavailable.
      }
    })();
    true;
  `;
}

export function workspaceSignOutScript() {
  return `
    var authStorageKey = ${JSON.stringify(WORKSPACE_AUTH_STORAGE_KEY)};
    if (typeof Storage !== "undefined") {
      var notifyNativeSignOut = function () {
        window.__bookzenvoNativeSignedOut = true;
        delete window.__bookzenvoNativeAccessToken;
        delete window.__bookzenvoPendingWebAccessToken;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "workspace-signed-out" }));
        }
      };
      var originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        // A late browser refresh must not recreate auth after explicit sign-out.
        if (this === localStorage && key === authStorageKey && window.__bookzenvoNativeSignedOut) return;
        var result = originalSetItem.apply(this, arguments);
        if (this === localStorage && key === authStorageKey && !window.__bookzenvoApplyingNativeSession) {
          try {
            var session = JSON.parse(value);
            if (session && typeof session.access_token === 'string' && typeof session.refresh_token === 'string') {
              window.__bookzenvoNativeAccessToken = session.access_token;
              window.__bookzenvoPendingWebAccessToken = session.access_token;
              if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'workspace-session-updated', accessToken: session.access_token, refreshToken: session.refresh_token
              }));
            }
          } catch (_) {}
        }
        return result;
      };
      var originalRemoveItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) {
        var result = originalRemoveItem.apply(this, arguments);
        if (this === localStorage && key === authStorageKey) notifyNativeSignOut();
        return result;
      };
      var originalClear = Storage.prototype.clear;
      Storage.prototype.clear = function () {
        var hadWorkspaceSession = this === localStorage && Boolean(this.getItem(authStorageKey));
        var result = originalClear.apply(this, arguments);
        if (hadWorkspaceSession) notifyNativeSignOut();
        return result;
      };
    }
  `;
}
