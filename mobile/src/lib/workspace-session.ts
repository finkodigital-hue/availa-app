// Must match the same-origin website client's stable auth storage key.
export const WORKSPACE_AUTH_STORAGE_KEY = "bookzenvo-auth";

type WorkspaceSession = { access_token: string };

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
        window.__bookzenvoNativeAccessToken = session.access_token;
        localStorage.setItem(key, nextValue);
        if (previousValue !== nextValue) {
          // Supabase listens on BroadcastChannel, not StorageEvent. Notify a
          // client that has already initialised as well as seeding first load.
          if (typeof BroadcastChannel !== "undefined") {
            var channel = new BroadcastChannel(key);
            channel.postMessage({ event: previousValue ? "TOKEN_REFRESHED" : "SIGNED_IN", session: session });
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
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "workspace-signed-out" }));
        }
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
