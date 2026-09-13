import type { Theme } from "@/lib/theme";
import { emailShell, escapeHtml } from "@/lib/emails/shared.server";

export function buildAftercareEmail({
  theme,
  businessName,
  customerName,
  serviceName,
  aftercareMessage,
}: {
  theme: Theme;
  businessName: string;
  customerName: string;
  serviceName: string;
  aftercareMessage: string;
}) {
  const subject = `Your ${serviceName} aftercare`;
  const paragraphs = aftercareMessage
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
  return {
    subject,
    html: emailShell({
      theme,
      businessName,
      previewText: `Care advice after your ${serviceName}`,
      bodyHtml: `<p style="margin:0 0 14px;">Hi ${escapeHtml(customerName)},</p>
<h1 style="font-size:22px;line-height:1.25;margin:0 0 12px;">Looking after your ${escapeHtml(serviceName)}</h1>
${paragraphs}
<p style="margin:18px 0 0;color:#666;">If anything feels unusual or you have a question, please contact ${escapeHtml(businessName)} directly.</p>`,
    }),
  };
}
