import type { Theme } from "@/lib/theme";
import { fmtMoney } from "@/lib/format";
import { emailShell, emailButton, emailButtonOutline, fmtDateInTz, fmtTimeInTz, escapeHtml } from "./shared.server";

// Same override pattern as stripe-connect.functions.ts's APP_URL usage —
// without this, dev/preview action links would point at the real production
// domain instead of the environment that's actually sending them.
function appOrigin(): string {
  return process.env.APP_URL || "https://bookzenvo.com";
}

export function reminderActionUrl(action: "confirm" | "cancel" | "reschedule", token: string): string {
  return `${appOrigin()}/booking-action/${action}/${token}`;
}

export function buildReminderEmail({
  theme,
  businessName,
  serviceName,
  staffName,
  startsAtIso,
  timezone,
  priceCents,
  currency,
  location,
  confirmToken,
  cancelToken,
  rescheduleToken,
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
  confirmToken: string;
  cancelToken: string;
  rescheduleToken: string;
}): { subject: string; html: string } {
  const date = fmtDateInTz(startsAtIso, timezone);
  const time = fmtTimeInTz(startsAtIso, timezone);
  const brand = theme.colors.primary || "#111111";

  const bodyHtml = `
<h1 style="margin:0 0 8px 0;font-size:25px;line-height:1.2;letter-spacing:-0.6px;font-weight:700;color:#191919;">Upcoming appointment</h1>
<p style="margin:0 0 24px 0;color:#555550;">A reminder about your appointment with ${escapeHtml(businessName)}.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;border:1px solid #ebe8e2;border-radius:14px;margin-bottom:22px;">
<tr><td style="padding:19px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:20px;">
<tr><td style="padding:5px 10px 5px 0;color:#62615e;width:88px;vertical-align:top;">Service</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(serviceName)}</td></tr>
<tr><td style="padding:5px 10px 5px 0;color:#62615e;vertical-align:top;">With</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(staffName)}</td></tr>
<tr><td style="padding:5px 10px 5px 0;color:#62615e;vertical-align:top;">Date</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(date)}</td></tr>
<tr><td style="padding:5px 10px 5px 0;color:#62615e;vertical-align:top;">Time</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(time)}</td></tr>
<tr><td style="padding:5px 10px 5px 0;color:#62615e;vertical-align:top;">Price</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(fmtMoney(priceCents, currency))}</td></tr>
${location ? `<tr><td style="padding:5px 10px 5px 0;color:#62615e;vertical-align:top;">Location</td><td style="padding:5px 0;font-weight:600;color:#222222;">${escapeHtml(location)}</td></tr>` : ""}
</table>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:10px;">${emailButton("Confirm I'm coming", reminderActionUrl("confirm", confirmToken), brand)}</td></tr>
<tr><td style="padding-bottom:10px;">${emailButtonOutline("Reschedule", reminderActionUrl("reschedule", rescheduleToken), brand)}</td></tr>
<tr><td>${emailButtonOutline("Cancel", reminderActionUrl("cancel", cancelToken), "#8a2b2b")}</td></tr>
</table>
`;

  return {
    subject: `Reminder: your appointment with ${businessName} on ${date}`,
    html: emailShell({
      theme,
      businessName,
      previewText: `${serviceName} with ${staffName} — ${date} at ${time}`,
      bodyHtml,
    }),
  };
}
