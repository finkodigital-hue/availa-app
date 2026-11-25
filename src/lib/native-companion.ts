type NativeWindow = Window & {
  __bookzenvoNativeBridge?: boolean;
  ReactNativeWebView?: { postMessage?: unknown };
};

/** Presentation hint only. Server permissions and plan entitlements are unchanged.
 * ReactNativeWebView is installed before page scripts; it also covers the small
 * interval before the app's own before-content bridge sets its marker.
 */
export function isNativeCompanion(): boolean {
  if (typeof window === "undefined") return false;
  const nativeWindow = window as NativeWindow;
  return (
    nativeWindow.__bookzenvoNativeBridge === true ||
    typeof nativeWindow.ReactNativeWebView?.postMessage === "function"
  );
}
