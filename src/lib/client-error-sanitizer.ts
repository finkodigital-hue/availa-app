const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const LABELED_SECRET_PATTERN =
  /\b(token|authorization|password|secret|api[_-]?key)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s)\]}>"']+/gi;

export function sanitizeReportedUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const parsed = new URL(raw, "https://bookzenvo.invalid");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const clean = redactSensitivePath(parsed.pathname || "/").slice(0, 500);
    return absolute ? `${parsed.origin}${clean}`.slice(0, 500) : clean;
  } catch {
    return null;
  }
}

function redactSensitivePath(pathname: string) {
  return pathname
    .replace(
      /^(\/booking-action\/)[^/]+\/[^/]+/i,
      "$1[action]/[token removed]",
    )
    .replace(
      /^(\/(?:invite|staff-invite|review|api\/marketing-unsubscribe)\/)[^/]+/i,
      "$1[token removed]",
    );
}

export function sanitizeClientErrorText(
  value: unknown,
  maxLength: number,
): string | null {
  const raw = typeof value === "string" ? value : String(value ?? "");
  if (!raw.trim()) return null;
  const cleaned = raw
    .replace(ABSOLUTE_URL_PATTERN, (url) => sanitizeReportedUrl(url) ?? "[url removed]")
    .replace(EMAIL_PATTERN, "[email removed]")
    .replace(JWT_PATTERN, "[token removed]")
    .replace(LABELED_SECRET_PATTERN, "$1=[secret removed]")
    .slice(0, maxLength)
    .trim();
  return cleaned || null;
}
