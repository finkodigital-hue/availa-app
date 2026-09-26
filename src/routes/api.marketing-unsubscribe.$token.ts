import { createFileRoute } from "@tanstack/react-router";
import { unsubscribeMarketingEmail } from "@/lib/marketing-consent.server";
import { consumePublicRequest, PublicRequestLimitError } from "@/lib/public-request-limit.server";
import { trustedAppOrigin } from "@/lib/app-origin.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const page = (content: string, token?: string) => {
  const form = token ? `<form method="post" action="/api/marketing-unsubscribe/${token}" style="margin-top:24px"><button type="submit" style="border:0;border-radius:10px;background:#171717;color:white;font:inherit;font-weight:600;padding:12px 18px;cursor:pointer">Confirm unsubscribe</button></form>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Email preferences · Bookzenvo</title></head><body style="margin:0;background:#f5f5f3;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:520px;margin:12vh auto;padding:24px"><div style="background:white;border:1px solid #e7e5e4;border-radius:20px;padding:32px;box-shadow:0 16px 40px rgba(0,0,0,.06)"><p style="font-size:13px;color:#78716c;margin:0 0 8px">BOOKZENVO</p>${content}${form}</div></main></body></html>`;
};
function html(content: string, status: number, token?: string, retryAfter?: number) {
  return new Response(page(content, token), { status, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    ...(retryAfter ? { "retry-after": String(retryAfter) } : {}),
  }});
}

export const Route = createFileRoute("/api/marketing-unsubscribe/$token")({
  server: { handlers: {
    GET: async ({ params }) => UUID_PATTERN.test(params.token)
      ? html('<h1 style="font-size:28px;margin:0 0 12px">Stop marketing emails?</h1><p style="line-height:1.6;color:#57534e;margin:0">You will stop promotional and rebooking emails from this salon. Appointment confirmations and essential service messages are unaffected.</p>', 200, params.token)
      : html('<h1 style="font-size:28px;margin:0 0 12px">Link unavailable</h1><p style="line-height:1.6;color:#57534e;margin:0">This unsubscribe link is invalid or no longer available.</p>', 404),
    POST: async ({ request, params }) => {
      if (!UUID_PATTERN.test(params.token) || request.headers.get("origin") !== trustedAppOrigin())
        return html('<h1 style="font-size:28px;margin:0 0 12px">Request unavailable</h1><p style="line-height:1.6;color:#57534e;margin:0">Open the unsubscribe link from the email and try again.</p>', 403);
      try {
        await consumePublicRequest("token", { headers: request.headers });
        const changed = await unsubscribeMarketingEmail(params.token);
        return html(changed
          ? '<h1 style="font-size:28px;margin:0 0 12px">Email preferences updated</h1><p style="line-height:1.6;color:#57534e;margin:0">You will no longer receive promotional or rebooking emails from this salon. Appointment confirmations and essential service messages are unaffected.</p>'
          : '<h1 style="font-size:28px;margin:0 0 12px">Link unavailable</h1><p style="line-height:1.6;color:#57534e;margin:0">This unsubscribe link is invalid or no longer available.</p>', changed ? 200 : 404);
      } catch (error) {
        const limited = error instanceof PublicRequestLimitError ? error : null;
        return html('<h1 style="font-size:28px;margin:0 0 12px">Please try again</h1><p style="line-height:1.6;color:#57534e;margin:0">We could not update your preference just now. Please try again shortly.</p>', limited?.status ?? 500, undefined, limited?.retryAfter);
      }
    },
  }},
});
