const DEFAULT_APP_ORIGIN = "https://bookzenvo.com";

/**
 * Return an origin that is safe to place in Stripe redirect URLs.
 *
 * Never derive this from the incoming Host header: a forged Host would turn a
 * legitimate checkout/onboarding response into an open redirect. Local HTTP
 * is allowed only for the explicit development loopback origins.
 */
export function trustedAppOrigin(): string {
  const configured = process.env.APP_URL || process.env.PUBLIC_SITE_URL;
  if (!configured) return DEFAULT_APP_ORIGIN;

  try {
    const url = new URL(configured);
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && localHost)) {
      return url.origin;
    }
  } catch {
    // Fall through to the fixed production origin below.
  }
  return DEFAULT_APP_ORIGIN;
}
