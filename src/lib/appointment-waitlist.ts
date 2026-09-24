export type AppointmentWaitlistRequest = {
  id: string;
  service_id: string;
  preferred_staff_id: string | null;
  preferred_after: string;
  preferred_before: string;
  preferred_time: "any" | "morning" | "afternoon" | "evening";
  status: "active" | "closed";
};

export type CancelledSlot = {
  id: string;
  service_id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
};

/** The stored end is exclusive. Show the last requested salon day, not the next midnight. */
export function formatRequestedSalonDates(
  after: string,
  before: string,
  timeZone: string,
  locale = "en-GB",
): string {
  const start = Date.parse(after);
  const end = Date.parse(before);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "Date unavailable";
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const first = formatter.format(start);
  const last = formatter.format(end - 1);
  return first === last ? first : `${first} – ${last}`;
}

/** Turn inclusive salon calendar dates into a UTC half-open window, including DST. */
export function salonDateWindow(
  from: string,
  through: string,
  timeZone: string,
) {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(from) || !pattern.test(through))
    throw new Error("Choose valid dates.");
  const fromDay = Date.parse(`${from}T00:00:00Z`);
  const throughDay = Date.parse(`${through}T00:00:00Z`);
  if (
    !Number.isFinite(fromDay) ||
    !Number.isFinite(throughDay) ||
    new Date(fromDay).toISOString().slice(0, 10) !== from ||
    new Date(throughDay).toISOString().slice(0, 10) !== through ||
    throughDay < fromDay ||
    throughDay - fromDay > 60 * 86_400_000
  )
    throw new Error("Choose a date range of up to 61 days.");
  function midnight(day: number) {
    let instant = day;
    for (let i = 0; i < 5; i++) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date(instant))
          .map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
      const rendered = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
      );
      const adjustment = day - rendered;
      instant += adjustment;
      if (!adjustment) return new Date(instant).toISOString();
    }
    throw new Error("Could not resolve salon dates.");
  }
  return {
    after: midnight(fromDay),
    before: midnight(throughDay + 86_400_000),
  };
}

/** A shortlist, not availability confirmation: the slot may have since been rebooked. */
export function requestMatchesCancelledSlot(
  request: AppointmentWaitlistRequest,
  slot: CancelledSlot,
  timeZone: string,
  now = new Date(),
): boolean {
  const start = Date.parse(slot.starts_at);
  const end = Date.parse(slot.ends_at);
  if (
    request.status !== "active" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  )
    return false;
  if (start <= now.getTime() || end <= start) return false;
  if (request.service_id !== slot.service_id) return false;
  if (
    request.preferred_staff_id &&
    request.preferred_staff_id !== slot.staff_id
  )
    return false;
  if (
    start < Date.parse(request.preferred_after) ||
    end > Date.parse(request.preferred_before)
  )
    return false;
  if (request.preferred_time === "any") return true;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(start)),
  );
  if (request.preferred_time === "morning") return hour < 12;
  if (request.preferred_time === "afternoon") return hour >= 12 && hour < 17;
  return hour >= 17;
}
