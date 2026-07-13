// Generic, source-agnostic parsing helpers for CSV import. Kept free of any
// Fresha-specific column knowledge — see fresha.ts for that.

export function cleanText(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return s || null;
}

export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Fresha's exports sometimes carry a literal backslash before a leading "+"
// (e.g. `\+447827443224`) — an escaping artifact from whatever produced the
// CSV, not a real character in the phone number.
export function cleanPhoneDisplay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\\/g, "").replace(/\s+/g, " ").trim();
  return s || null;
}

// Digits-only form used for duplicate detection — mirrors the DB's
// `phone_normalized` generated column (`regexp_replace(phone, '\D', '', 'g')`)
// exactly, so in-memory pre-checks agree with what the unique index will do.
export function phoneDigits(raw: string | null | undefined): string | null {
  const cleaned = cleanPhoneDisplay(raw);
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, "");
  return digits || null;
}

const DURATION_RE = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?\s*$/;

// Returns `ok: false` when it had to fall back to a default so callers can
// surface "N rows had an unreadable duration" in a preview instead of
// silently guessing.
export function parseDuration(raw: string | null | undefined): { minutes: number; ok: boolean } {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return { minutes: 60, ok: false };
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return { minutes: parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10), ok: true };
  if (/^\d+$/.test(s)) return { minutes: parseInt(s, 10), ok: true };
  const hm = s.match(DURATION_RE);
  if (hm && (hm[1] || hm[2])) {
    const h = hm[1] ? parseInt(hm[1], 10) : 0;
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    if (h > 0 || m > 0) return { minutes: h * 60 + m, ok: true };
  }
  const numMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const n = parseFloat(numMatch[1]);
    if (!isNaN(n)) return { minutes: Math.round(n), ok: true };
  }
  return { minutes: 60, ok: false };
}

export function parsePrice(raw: string | null | undefined): { cents: number; ok: boolean } {
  let s = (raw ?? "").trim();
  if (!s) return { cents: 0, ok: true };
  s = s.replace(/[£$€\s]/g, "");
  if (!s.includes(".") && /,\d{1,2}$/.test(s)) {
    s = s.replace(/,(\d{1,2})$/, ".$1");
  }
  s = s.replace(/,/g, "");
  const n = parseFloat(s);
  if (isNaN(n)) return { cents: 0, ok: false };
  return { cents: Math.round(n * 100), ok: true };
}

export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// Parses Fresha's "17 Dec 2026, 11:30am" style timestamps.
export function parseFreshaDateTime(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\s+(\w{3})\w*\s+(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10) % 12;
  const minute = parseInt(m[5], 10);
  if (m[6].toLowerCase() === "pm") hour += 12;
  const d = new Date(year, month, day, hour, minute, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

// Parses Fresha's "11:30:00-12:20:00" appointment-slot column (24h, exact).
export function parseSlotTimes(
  raw: string | null | undefined,
): { start: [number, number]; end: [number, number] } | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2}):\d{2}\s*-\s*(\d{1,2}):(\d{2}):\d{2}$/);
  if (!m) return null;
  return {
    start: [parseInt(m[1], 10), parseInt(m[2], 10)],
    end: [parseInt(m[3], 10), parseInt(m[4], 10)],
  };
}

function atTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Combines a date-bearing timestamp with an exact 24h slot range (preferred,
// unambiguous) or falls back to the timestamp's own time + a duration.
export function resolveApptTimes(
  scheduled: Date | null,
  slot: { start: [number, number]; end: [number, number] } | null,
  durationMinutes: number,
): { startsAt: Date; endsAt: Date } | null {
  if (!scheduled) return null;
  if (slot) {
    return {
      startsAt: atTime(scheduled, slot.start[0], slot.start[1]),
      endsAt: atTime(scheduled, slot.end[0], slot.end[1]),
    };
  }
  const startsAt = scheduled;
  const endsAt = new Date(scheduled.getTime() + durationMinutes * 60000);
  return { startsAt, endsAt };
}
