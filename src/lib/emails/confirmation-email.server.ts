import type { Theme } from "@/lib/theme";
import { fmtMoney } from "@/lib/format";
import { buildGoogleCalendarUrl, buildIcsCalendar, icsBase64, icsFilename } from "@/lib/ics";
import { emailShell, fmtDateInTz, fmtTimeInTz, escapeHtml, emailButtonOutline } from "./shared.server";

// Booking confirmation email — sent at time of booking, every plan (not
// gated). Deliberately has no CTA buttons beyond "Add to calendar": it's a
// receipt, not a marketing push. The Confirm/Cancel/Reschedule links only
// appear on the pre-appointment reminder (Studio-only).
//
// Always attaches an .ics (most mail clients — Gmail, Outlook, Apple Mail —
// recognize a calendar attachment and offer their own "add to calendar" UI
// natively) and additionally links to Google Calendar's web quick-add, for
// recipients whose client doesn't surface the attachment prominently. The
// UID is `booking-${bookingId}@bookzenvo.com` — identical to the one the
// public booking page's own client-side download uses for the same booking
// (see AddToCalendar in add-to-calendar.tsx) — so a recipient who adds it
// from both places ends up with one calendar event, not two.
export function buildConfirmationEmail({
  theme,
  businessName,
  serviceName,
  staffName,
  bookingId,
  startsAtIso,
  endsAtIso,
  timezone,
  priceCents,
  currency,
  location,
}: {
  theme: Theme;
  businessName: string;
  serviceName: string;
  staffName: string;
  bookingId: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
  priceCents: number;
  currency: string;
  location: string | null;
}): { subject: string; html: string; attachments: { filename: string; content: string }[] } {
  const date = fmtDateInTz(startsAtIso, timezone);
  const time = fmtTimeInTz(startsAtIso, timezone);

  const calendarEvent = {
    uid: `booking-${bookingId}@bookzenvo.com`,
    title: `${serviceName} with ${staffName}`,
    description: `${serviceName} at ${businessName}, with ${staffName}. Booked via Bookzenvo.`,
    location: location ?? undefined,
    startsAtIso,
    endsAtIso,
  };
  const googleCalendarUrl = buildGoogleCalendarUrl(calendarEvent);
  const brand = theme.colors.primary || "#111111";

  const bodyHtml = `
<h1 style="margin:0 0 4px 0;font-size:20px;font-weight:700;">Booking confirmed</h1>
<p style="margin:0 0 20px 0;color:#57575e;">Your appointment with ${escapeHtml(businessName)} is booked.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f9;border-radius:12px;">
<tr><td style="padding:16px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
<tr><td style="padding:4px 0;color:#8a8a8f;width:88px;">Service</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(serviceName)}</td></tr>
<tr><td style="padding:4px 0;color:#8a8a8f;">With</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(staffName)}</td></tr>
<tr><td style="padding:4px 0;color:#8a8a8f;">Date</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(date)}</td></tr>
<tr><td style="padding:4px 0;color:#8a8a8f;">Time</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(time)}</td></tr>
<tr><td style="padding:4px 0;color:#8a8a8f;">Price</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(fmtMoney(priceCents, currency))}</td></tr>
${location ? `<tr><td style="padding:4px 0;color:#8a8a8f;">Location</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(location)}</td></tr>` : ""}
</table>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
<tr><td>${emailButtonOutline("Add to Google Calendar", googleCalendarUrl, brand)}</td></tr>
</table>
<p style="margin:10px 0 0 0;color:#8a8a8f;font-size:12px;">Using Apple Mail or Outlook? Open the attached calendar file instead.</p>
`;

  const ics = buildIcsCalendar(calendarEvent);

  return {
    subject: `Booking confirmed — ${businessName} on ${date}`,
    html: emailShell({
      theme,
      businessName,
      previewText: `${serviceName} with ${staffName} — ${date} at ${time}`,
      bodyHtml,
    }),
    attachments: [{ filename: icsFilename(calendarEvent.title), content: icsBase64(ics) }],
  };
}
