import type { Theme } from "@/lib/theme";
import {
  emailButton,
  emailShell,
  escapeHtml,
} from "@/lib/emails/shared.server";

export function buildRebookingEmail({
  theme,
  businessName,
  customerName,
  serviceName,
  bookingUrl,
  unsubscribeUrl,
}: {
  theme: Theme;
  businessName: string;
  customerName: string;
  serviceName: string;
  bookingUrl: string;
  unsubscribeUrl: string;
}) {
  const subject = `Ready for your next ${serviceName}?`;
  return {
    subject,
    html: emailShell({
      theme,
      businessName,
      previewText: `It may be time to book your next ${serviceName}`,
      bodyHtml: `<p style="margin:0 0 14px;">Hi ${escapeHtml(customerName)},</p>
<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;">It may be time for your next visit</h1>
<p style="margin:0 0 18px;">Based on your last ${escapeHtml(serviceName)}, this is around the time clients often choose to rebook. If the timing feels right, you can find a suitable appointment below.</p>
${emailButton("Book another appointment", bookingUrl, theme.colors.primary || "#111111")}
<p style="margin:18px 0 0;text-align:center;font-size:12px;color:#777;">You chose to receive email updates from ${escapeHtml(businessName)}. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#555;">Unsubscribe</a></p>`,
    }),
  };
}
