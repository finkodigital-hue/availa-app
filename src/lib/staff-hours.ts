// Shared resolution logic for "what hours is this staff member working on a
// given weekday" — used by both the public booking slot picker
// (lib/slots.ts) and the admin calendar (staff availability shading on the
// Day view). Keeping this in one place means the two surfaces can never
// silently disagree about whether someone is bookable.

export type DayPeriod = { open_time: string; close_time: string };

export type WeekdayOverride = {
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
} | null | undefined;

// Sensible default hours for a brand-new business that hasn't configured
// anything yet — Monday to Saturday, 9 am to 6 pm; Sunday closed. In
// practice every real business gets business_hours/business_hour_periods
// rows seeded on creation (see ensure_business_hours), so this is mostly a
// safety net for data that predates that, or test businesses.
export function defaultPeriodsFor(weekday: number): DayPeriod[] {
  if (weekday === 0) return [];
  return [{ open_time: "09:00", close_time: "18:00" }];
}

// Resolution order: an explicit, non-closed staff_hours override wins
// (staff-specific hours for that weekday) → the business's configured
// multi-period hours → a single-row business_hours fallback → the
// hardcoded default (only when neither table has any row at all, i.e. an
// unconfigured business). Anything else (business explicitly closed that
// day, or a staff row explicitly marked closed with no override) resolves
// to no periods — the staff member isn't working.
export function resolveDayPeriods(opts: {
  weekday: number;
  staffHours?: WeekdayOverride;
  bizPeriods: DayPeriod[];
  bizHours?: WeekdayOverride;
}): DayPeriod[] {
  const { weekday, staffHours, bizPeriods, bizHours } = opts;
  if (staffHours && !staffHours.closed && staffHours.open_time && staffHours.close_time) {
    return [{ open_time: staffHours.open_time, close_time: staffHours.close_time }];
  }
  if (bizPeriods.length > 0) return bizPeriods;
  if (bizHours && !bizHours.closed && bizHours.open_time && bizHours.close_time) {
    return [{ open_time: bizHours.open_time, close_time: bizHours.close_time }];
  }
  if (!bizHours && !staffHours) return defaultPeriodsFor(weekday);
  return [];
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isMinuteWithinPeriods(periods: DayPeriod[], minutes: number): boolean {
  return periods.some((p) => minutes >= toMinutes(p.open_time) && minutes < toMinutes(p.close_time));
}

// The gaps (in minutes-from-midnight, clamped to [dayStartMin, dayEndMin])
// that fall outside every working period — i.e. the ranges the calendar
// should shade as "not working". Returns the whole window if there are no
// periods at all (day off).
export function unavailableRanges(
  periods: DayPeriod[],
  dayStartMin: number,
  dayEndMin: number,
): Array<[number, number]> {
  if (dayEndMin <= dayStartMin) return [];
  if (periods.length === 0) return [[dayStartMin, dayEndMin]];
  const sorted = periods
    .map((p) => [toMinutes(p.open_time), toMinutes(p.close_time)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cursor = dayStartMin;
  for (const [s, e] of sorted) {
    const start = Math.max(s, dayStartMin);
    const end = Math.min(e, dayEndMin);
    if (start > cursor) out.push([cursor, Math.min(start, dayEndMin)]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < dayEndMin) out.push([cursor, dayEndMin]);
  return out;
}
