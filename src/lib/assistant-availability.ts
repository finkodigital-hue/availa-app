import {
  expandBookingSegments,
  expandCandidateSegments,
  segmentsOverlap,
  type SlotService,
} from "./booking-segments.ts";
import {
  resolveDayPeriods,
  type DayPeriod,
  type WeekdayOverride,
} from "./staff-hours.ts";

export type AvailabilityStaff = { id: string; name: string };
export type AvailabilityService = SlotService & { id: string; name: string };
export type AvailabilityBooking = Parameters<
  typeof expandBookingSegments
>[0] & {
  staff_id: string | null;
  status: string;
};
export type AvailabilityBlock = {
  staff_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};
export type AvailabilityStaffHours = WeekdayOverride & {
  staff_id: string;
  weekday: number;
};
export type AvailabilityBusinessHours = WeekdayOverride & { weekday: number };
export type VerifiedSlot = {
  startsAt: string;
  staff: string;
  service: string;
};

const DAY_MS = 86_400_000;
const SLOT_MS = 15 * 60_000;

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** Convert a salon-local wall-clock time into a UTC instant. */
function atLocalTime(
  day: Date,
  hours: number,
  minutes: number,
  timeZone: string,
) {
  const target = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hours,
    minutes,
  );
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const rendered = localParts(new Date(instant), timeZone);
    const wall = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    const adjustment = target - wall;
    instant += adjustment;
    if (adjustment === 0) return instant;
  }
  throw new Error("Could not resolve salon-local appointment time");
}

/** The same 15-minute candidate/segment rules used by the public booking picker. */
export function verifiedAssistantSlots(input: {
  now: Date;
  timeZone: string;
  staff: AvailabilityStaff[];
  services: AvailabilityService[];
  serviceStaff: { service_id: string; staff_id: string }[];
  staffHours: AvailabilityStaffHours[];
  businessHours: AvailabilityBusinessHours[];
  businessPeriods: (DayPeriod & { weekday: number })[];
  bookings: AvailabilityBooking[];
  blocks: AvailabilityBlock[];
  holidayClosures: { starts_on: string; ends_on: string }[];
  maxResults?: number;
}): VerifiedSlot[] {
  const maxResults = Math.max(0, Math.min(input.maxResults ?? 8, 12));
  if (!maxResults) return [];
  const today = localParts(input.now, input.timeZone);
  const todayDate = Date.UTC(today.year, today.month - 1, today.day);
  const output: VerifiedSlot[] = [];
  const linksByService = new Map<string, Set<string>>();
  for (const link of input.serviceStaff) {
    const links = linksByService.get(link.service_id) ?? new Set<string>();
    links.add(link.staff_id);
    linksByService.set(link.service_id, links);
  }
  for (
    let dayIndex = 0;
    dayIndex < 7 && output.length < maxResults;
    dayIndex++
  ) {
    const day = new Date(todayDate + dayIndex * DAY_MS);
    const dayKey = day.toISOString().slice(0, 10);
    if (
      input.holidayClosures.some(
        (closure) => closure.starts_on <= dayKey && dayKey <= closure.ends_on,
      )
    )
      continue;
    const weekday = day.getUTCDay();
    // resolveDayPeriods reads local date fields to resolve repeating staff rotas.
    const rotaDate = new Date(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
    );
    for (const person of input.staff) {
      const periods = resolveDayPeriods({
        weekday,
        staffHours: input.staffHours.find(
          (row) => row.staff_id === person.id && row.weekday === weekday,
        ),
        bizPeriods: input.businessPeriods.filter(
          (row) => row.weekday === weekday,
        ),
        bizHours: input.businessHours.find((row) => row.weekday === weekday),
        date: rotaDate,
      });
      const existing = input.bookings
        .filter(
          (booking) =>
            booking.staff_id === person.id && booking.status !== "cancelled",
        )
        .map(expandBookingSegments);
      for (const service of input.services) {
        const allowed = linksByService.get(service.id);
        if (allowed?.size && !allowed.has(person.id)) continue;
        const totalMinutes =
          service.duration_minutes +
          (service.buffer_before_min ?? 0) +
          (service.buffer_after_min ?? 0) +
          (service.gap_min ?? 0) +
          (service.active_after_min ?? 0);
        if (totalMinutes <= 0 || totalMinutes > 24 * 60) continue;
        for (const period of periods) {
          const [openHour, openMinute] = period.open_time
            .split(":")
            .map(Number);
          const [closeHour, closeMinute] = period.close_time
            .split(":")
            .map(Number);
          const open = atLocalTime(day, openHour, openMinute, input.timeZone);
          const close = atLocalTime(
            day,
            closeHour,
            closeMinute,
            input.timeZone,
          );
          for (
            let start = open;
            start + totalMinutes * 60_000 <= close;
            start += SLOT_MS
          ) {
            if (start < input.now.getTime()) continue;
            const candidate = expandCandidateSegments(start, service);
            if (
              existing.some((segments) => segmentsOverlap(candidate, segments))
            )
              continue;
            if (
              input.blocks.some((block) => {
                if (block.staff_id && block.staff_id !== person.id)
                  return false;
                if (!block.starts_at || !block.ends_at) return true;
                return segmentsOverlap(candidate, [
                  {
                    start: Date.parse(block.starts_at),
                    end: Date.parse(block.ends_at),
                  },
                ]);
              })
            )
              continue;
            output.push({
              startsAt: new Date(
                start + (service.buffer_before_min ?? 0) * 60_000,
              ).toISOString(),
              staff: person.name,
              service: service.name,
            });
            break; // One representative slot per staff/service/day; never a fabricated full list.
          }
          if (output.length >= maxResults) break;
        }
        if (output.length >= maxResults) break;
      }
      if (output.length >= maxResults) break;
    }
  }
  return output;
}
