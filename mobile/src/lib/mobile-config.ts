/** Native auth and the WebView must always use the same website origin. */
export function resolveMobileConfiguration(value: string | undefined, development = false) {
  try {
    const url = new URL(value || "https://bookzenvo.com");
    const localDevelopment = development && url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localDevelopment) ||
        url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    // A preview build must not reuse production credentials after its URL changes.
    const authStorageKey = `bookzenvo-native-auth.${Array.from(url.origin, character => character.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
    return { appUrl: url.origin, supabaseUrl: `${url.origin}/api/supabase`, authStorageKey };
  } catch {
    return null;
  }
}
