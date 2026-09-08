import type { Theme } from "@/lib/theme";
import {
  emailButton,
  emailShell,
  escapeHtml,
  fmtDateInTz,
} from "./shared.server";

export function buildReviewRequestEmail({
  theme,
  businessName,
  serviceName,
  startsAtIso,
  timezone,
  reviewToken,
}: {
  theme: Theme;
  businessName: string;
  serviceName: string;
  startsAtIso: string;
  timezone: string;
  reviewToken: string;
}) {
  const origin = process.env.APP_URL || "https://bookzenvo.com";
  const url = `${origin}/review/${encodeURIComponent(reviewToken)}`;
  const safeBusiness = escapeHtml(businessName);
  const safeService = escapeHtml(serviceName);
  const date = escapeHtml(fmtDateInTz(startsAtIso, timezone));
  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#111111;">How was your visit?</h1>
    <p style="margin:0 0 18px;color:#4b4b50;">You recently booked <strong>${safeService}</strong> with ${safeBusiness} on ${date}. Your honest feedback helps future customers know what to expect.</p>
    ${emailButton("Leave a review", url, theme.colors.primary || "#111111")}
    <p style="margin:16px 0 0;color:#8a8a8f;font-size:12px;">This private link works once and expires after 90 days.</p>`;
  return {
    subject: `How was your visit to ${businessName}?`,
    html: emailShell({
      theme,
      businessName,
      previewText: `Share your experience with ${businessName}`,
      bodyHtml,
    }),
  };
}
