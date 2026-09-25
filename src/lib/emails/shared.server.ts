import type { Theme } from "@/lib/theme";

// Email clients (Gmail/Outlook mobile apps especially) strip custom
// `@font-face`/Google Fonts imports unpredictably, so unlike the themed
// booking page we don't try to load the business's chosen font here — only
// their brand color and logo carry through. A system font stack renders
// consistently everywhere these are actually opened (phones, per the brief).
const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function fmtDateInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(iso));
}

export function fmtTimeInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailButton(label: string, href: string, color: string): string {
  return `<a href="${escapeHtml(href)}" style="display:block;width:100%;box-sizing:border-box;background:${escapeHtml(color)};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;line-height:22px;padding:15px 20px;border-radius:12px;text-align:center;font-family:${SYSTEM_FONT_STACK};">${escapeHtml(label)}</a>`;
}

export function emailButtonOutline(label: string, href: string, color: string): string {
  const safeColor = escapeHtml(color);
  return `<a href="${escapeHtml(href)}" style="display:block;width:100%;box-sizing:border-box;background:#ffffff;color:${safeColor};text-decoration:none;font-weight:700;font-size:15px;line-height:22px;padding:14px 20px;border-radius:12px;text-align:center;border:1px solid ${safeColor};font-family:${SYSTEM_FONT_STACK};">${escapeHtml(label)}</a>`;
}

// Single-column, table-based, inline-styled shell — the layout that survives
// Gmail/Outlook's HTML sanitizing intact. `bodyHtml` is trusted content
// assembled by the calling template (all interpolated business/customer
// values must already be escaped by the caller).
export function emailShell({
  theme,
  businessName,
  previewText,
  bodyHtml,
}: {
  theme: Theme;
  businessName: string;
  previewText: string;
  bodyHtml: string;
}): string {
  const brand = escapeHtml(theme.colors.primary || "#111111");
  const logo = theme.logoUrl
    ? `<img src="${escapeHtml(theme.logoUrl)}" alt="${escapeHtml(businessName)}" height="40" style="height:40px;max-width:220px;object-fit:contain;vertical-align:middle;" />`
    : `<span style="font-size:21px;line-height:28px;letter-spacing:-0.4px;font-weight:700;color:#191919;font-family:${SYSTEM_FONT_STACK};">${escapeHtml(businessName)}</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:${SYSTEM_FONT_STACK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:#ffffff;border:1px solid #e8e6e1;border-radius:18px;overflow:hidden;">
<tr><td style="padding:28px 28px 23px 28px;border-top:4px solid ${brand};border-bottom:1px solid #eeece7;">
${logo}
</td></tr>
<tr><td style="padding:28px 28px 32px 28px;color:#242424;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;">
<tr><td style="padding:18px 24px 8px;text-align:center;color:#6e6d69;font-size:12px;line-height:18px;font-family:${SYSTEM_FONT_STACK};">
Sent by ${escapeHtml(businessName)} via
</td></tr>
<tr><td style="padding:0 24px 20px;text-align:center;font-family:${SYSTEM_FONT_STACK};">
<span style="color:#26231e;font-size:16px;font-weight:700;letter-spacing:-0.065em;line-height:20px;">Bookzenvo<span style="color:#b6924e;">.</span></span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export { escapeHtml };
