/**
 * Validate URLs that can be entered by a business owner or returned by the
 * page editor.  These values are rendered on public pages, so accepting a
 * `javascript:` (or another active) URL would turn a harmless content field
 * into stored XSS for every visitor.
 */
const MAX_URL_LENGTH = 2_048;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  if (
    !result ||
    result.length > MAX_URL_LENGTH ||
    hasControlCharacter(result) ||
    // Backslashes are not valid URL path separators, but browsers normalize
    // them for special URLs. Reject them so `/\\\\evil.example` cannot be
    // interpreted as a protocol-relative external URL.
    result.includes("\\")
  ) {
    return null;
  }
  return result;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isRootRelative(value: string): boolean {
  // Protocol-relative URLs (`//host/path`) are external URLs in disguise.
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

/** Links for public CTAs and contact actions. */
export function safePublicHref(value: unknown): string | null {
  const result = clean(value);
  if (!result) return null;
  if (result.startsWith("#")) {
    return /^#[A-Za-z0-9_.:-]+$/.test(result) ? result : null;
  }
  if (isRootRelative(result)) return result;

  try {
    const parsed = new URL(result);
    if (!["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol)) return null;
    return result;
  } catch {
    return null;
  }
}

/** Image URLs used in public page content. Data and blob URLs are excluded. */
export function safeImageSrc(value: unknown): string | null {
  const result = clean(value);
  if (!result) return null;
  if (isRootRelative(result)) return result;

  try {
    const parsed = new URL(result);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? result : null;
  } catch {
    return null;
  }
}

/** Relative private-storage paths must stay inside one business folder. */
export function isTenantAssetPath(value: unknown, businessId: string): value is string {
  if (typeof value !== "string" || !value.startsWith(`${businessId}/`)) return false;
  const segments = value.split("/");
  return (
    segments.length >= 2 &&
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..") &&
    !value.includes("\\") &&
    !hasControlCharacter(value)
  );
}
