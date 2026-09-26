import type { Theme } from "@/lib/theme";
import { buildIcsCalendar, icsBase64, icsFilename } from "@/lib/ics";
import { emailShell, escapeHtml, fmtDateInTz, fmtTimeInTz } from "./shared.server";

export function buildBookingChangeEmail({
  changeType,
  theme,
  businessName,
  serviceName,
  staffName,
  bookingId,
  oldStartsAtIso,
  startsAtIso,
  endsAtIso,
  timezone,
  location,
}: {
  changeType: "rescheduled" | "cancelled";
  theme: Theme;
  businessName: string;
  serviceName: string;
  staffName: string;
  bookingId: string;
  oldStartsAtIso: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
  location: string | null;
}): { subject: string; html: string; attachments?: { filename: string; content: string }[] } {
  const oldWhen = `${fmtDateInTz(oldStartsAtIso, timezone)} at ${fmtTimeInTz(oldStartsAtIso, timezone)}`;
  const newWhen = `${fmtDateInTz(startsAtIso, timezone)} at ${fmtTimeInTz(startsAtIso, timezone)}`;
  const isRescheduled = changeType === "rescheduled";
  const heading = isRescheduled ? "Your appointment has moved" : "Your appointment was cancelled";
  const details = isRescheduled
    ? `<p style="margin:0 0 12px 0;">Previous time: ${escapeHtml(oldWhen)}</p>
       <p style="margin:0 0 20px 0;"><strong>New time: ${escapeHtml(newWhen)}</strong></p>
       <p style="margin:0 0 20px 0;color:#57575e;">An updated calendar file is attached. If your calendar still shows the old time, update or remove that event.</p>`
    : `<p style="margin:0 0 20px 0;">The appointment on ${escapeHtml(oldWhen)} is no longer booked. If you saved it to your calendar, please remove it.</p>
       <p style="margin:0 0 20px 0;color:#57575e;">Any payment or refund is handled separately under ${escapeHtml(businessName)}'s policy.</p>`;
  const bodyHtml = `
<h1 style="margin:0 0 12px 0;font-size:20px;font-weight:700;">${heading}</h1>
<p style="margin:0 0 16px 0;color:#57575e;">${escapeHtml(serviceName)} with ${escapeHtml(staffName)} at ${escapeHtml(businessName)}</p>
${details}
${location ? `<p style="margin:0;color:#57575e;">Location: ${escapeHtml(location)}</p>` : ""}`;

  const attachments = isRescheduled
    ? [{
        filename: icsFilename(`${serviceName} with ${staffName}`),
        content: icsBase64(buildIcsCalendar({
          uid: `booking-${bookingId}@bookzenvo.com`,
          title: `${serviceName} with ${staffName}`,
          description: `${serviceName} at ${businessName}, with ${staffName}. Booked via Bookzenvo.`,
          location: location ?? undefined,
          startsAtIso,
          endsAtIso,
        })),
      }]
    : undefined;

  return {
    subject: `${isRescheduled ? "Booking moved" : "Booking cancelled"} — ${businessName}`,
    html: emailShell({
      theme,
      businessName,
      previewText: isRescheduled ? `New time: ${newWhen}` : `Cancelled: ${oldWhen}`,
      bodyHtml,
    }),
    attachments,
  };
}
