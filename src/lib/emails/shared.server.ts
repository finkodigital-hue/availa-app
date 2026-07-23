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
  return `<a href="${href}" style="display:block;width:100%;box-sizing:border-box;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 20px;border-radius:10px;text-align:center;font-family:${SYSTEM_FONT_STACK};">${escapeHtml(label)}</a>`;
}

export function emailButtonOutline(label: string, href: string, color: string): string {
  return `<a href="${href}" style="display:block;width:100%;box-sizing:border-box;background:#ffffff;color:${color};text-decoration:none;font-weight:600;font-size:16px;padding:13px 20px;border-radius:10px;text-align:center;border:1.5px solid ${color};font-family:${SYSTEM_FONT_STACK};">${escapeHtml(label)}</a>`;
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
  const brand = theme.colors.primary || "#111111";
  const logo = theme.logoUrl
    ? `<img src="${theme.logoUrl}" alt="${escapeHtml(businessName)}" height="36" style="height:36px;max-width:220px;object-fit:contain;" />`
    : `<span style="font-size:20px;font-weight:700;color:#111111;font-family:${SYSTEM_FONT_STACK};">${escapeHtml(businessName)}</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(businessName)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f4;font-family:${SYSTEM_FONT_STACK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:24px 24px 0 24px;border-top:4px solid ${brand};">
${logo}
</td></tr>
<tr><td style="padding:20px 24px 28px 24px;color:#111111;font-size:15px;line-height:1.5;">
${bodyHtml}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:16px 24px;text-align:center;color:#8a8a8f;font-size:12px;font-family:${SYSTEM_FONT_STACK};">
Sent by ${escapeHtml(businessName)} via Bookzenvo
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export { escapeHtml };
