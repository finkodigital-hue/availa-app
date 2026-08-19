// "Add to calendar" for the CLIENT at booking time — a standard .ics file
// plus a Google Calendar quick-add link. Deliberately isomorphic (no Node
// APIs, no secrets): the public booking page builds and downloads the .ics
// entirely client-side with no server round trip, and the confirmation email
// sender (a server route) builds the identical string to attach. Both call
// the same buildIcsCalendar() so the file a client downloads and the one
// emailed to them can never drift apart.
//
// This is unrelated to and does not require the Google Calendar OAuth
// integration (business → shared calendar sync) — no API key, no auth, no
// network call. Every major calendar app (Google, Apple, Outlook) opens a
// .ics file directly.

export type CalendarEventInput = {
  /** Stable, globally-unique identifier — reusing the booking id keeps
   *  re-downloads/re-sends idempotent (importing the same .ics twice updates
   *  the same event in the client's calendar instead of duplicating it). */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** ISO 8601 instant (timestamptz from Postgres, e.g. "2026-08-12T09:00:00+00:00"). */
  startsAtIso: string;
  /** ISO 8601 instant. For a gap booking this is the TRUE end of the whole
   *  appointment (starts_at + duration + gap + active_after) — callers must
   *  pass the full span, never just the first segment. */
  endsAtIso: string;
};

// RFC 5545 §3.3.11: escape backslash, semicolon, comma, and newlines.
// Order matters — backslash must be escaped first or the following
// substitutions would double-escape.
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 §3.1: lines must be folded at 75 octets, continuation lines start
// with a single space. Not just cosmetic — some calendar parsers reject or
// silently truncate unfolded long lines (long DESCRIPTION values in
// particular).
function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  let result = "";
  let chunkStart = 0;
  let limit = 75;
  while (chunkStart < line.length) {
    let end = Math.min(chunkStart + limit, line.length);
    // Don't split a multi-byte UTF-8 character across a fold boundary.
    while (end > chunkStart && new TextEncoder().encode(line.slice(chunkStart, end)).length > limit) {
      end--;
    }
    result += (chunkStart === 0 ? "" : "\r\n ") + line.slice(chunkStart, end);
    chunkStart = end;
    limit = 74; // continuation lines lose one octet to the leading space
  }
  return result;
}

// UTC basic format required for a portable, timezone-proof instant:
// YYYYMMDDTHHMMSSZ. starts_at/ends_at are already absolute instants
// (timestamptz), so encoding them as UTC — rather than a floating local
// time — is what makes the event land at the correct moment regardless of
// which timezone the recipient's device or calendar app is set to. This is
// standard, correct behavior for a fixed-location physical appointment (the
// same way a flight's departure time is portable across timezones).
function formatIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcsCalendar(event: CalendarEventInput): string {
  const now = formatIcsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookzenvo//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsUtc(event.startsAtIso)}`,
    `DTEND:${formatIcsUtc(event.endsAtIso)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545 §3.1 mandates CRLF line endings, not bare \n.
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function buildGoogleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatIcsUtc(event.startsAtIso)}/${formatIcsUtc(event.endsAtIso)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Filesystem-safe filename for the browser download / email attachment —
// strips characters that are unsafe on Windows/macOS/most mail clients.
export function icsFilename(title: string): string {
  const slug = title.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "appointment";
  return `${slug}.ics`;
}

// UTF-8-safe base64 encoding for the confirmation email's .ics attachment
// (Resend's API takes attachment content as a base64 string). Deliberately
// avoids Buffer — this project's other base64 use (screenshot.server.ts)
// uses the same TextEncoder + btoa approach so it works identically in both
// local Node dev and the deployed Cloudflare Workers runtime, rather than
// relying on Workers' partial/opt-in Buffer polyfill.
export function icsBase64(ics: string): string {
  const bytes = new TextEncoder().encode(ics);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
