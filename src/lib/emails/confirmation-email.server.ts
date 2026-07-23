import type { Theme } from "@/lib/theme";
import { fmtMoney } from "@/lib/format";
import { emailShell, fmtDateInTz, fmtTimeInTz, escapeHtml } from "./shared.server";

// Booking confirmation email — sent at time of booking, every plan (not
// gated). Deliberately has no action buttons: it's a receipt, not a
// call-to-action. The Confirm/Cancel/Reschedule links only appear on the
// pre-appointment reminder (Studio-only).
export function buildConfirmationEmail({
  theme,
  businessName,
  serviceName,
  staffName,
  startsAtIso,
  timezone,
  priceCents,
  currency,
  location,
}: {
  theme: Theme;
  businessName: string;
  serviceName: string;
  staffName: string;
  startsAtIso: string;
  timezone: string;
  priceCents: number;
  currency: string;
  location: string | null;
}): { subject: string; html: string } {
  const date = fmtDateInTz(startsAtIso, timezone);
  const time = fmtTimeInTz(startsAtIso, timezone);

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
`;

  return {
    subject: `Booking confirmed — ${businessName} on ${date}`,
    html: emailShell({
      theme,
      businessName,
      previewText: `${serviceName} with ${staffName} — ${date} at ${time}`,
      bodyHtml,
    }),
  };
}
