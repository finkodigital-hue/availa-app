export function buildReminderSms(input: {
  businessName: string;
  serviceName: string;
  startsAtIso: string;
  timezone: string;
}) {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input.startsAtIso));
  return `Reminder from ${input.businessName}: your ${input.serviceName} appointment is ${when}. Contact the salon if you need to make a change.`;
}
