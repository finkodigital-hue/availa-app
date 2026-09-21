/** UTC boundaries for a calendar day in the business's IANA time zone. */
export function businessDayRange(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const localParts = (date: Date) => Object.fromEntries(
    formatter.formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]),
  );
  const day = localParts(now);
  const midnight = (target: number) => {
    let instant = target;
    for (let n=0;n<4;n++) {
      const p = localParts(new Date(instant));
      const rendered = Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
      const adjustment = target-rendered;
      instant += adjustment;
      if (adjustment === 0) return new Date(instant);
    }
    throw new Error("Could not resolve the business's calendar day");
  };
  return {
    start: midnight(Date.UTC(day.year,day.month-1,day.day)),
    end: midnight(Date.UTC(day.year,day.month-1,day.day+1)),
  };
}
