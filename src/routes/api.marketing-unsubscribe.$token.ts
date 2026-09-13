import { createFileRoute } from "@tanstack/react-router";
import { unsubscribeMarketingEmail } from "@/lib/marketing-consent.server";

const page = (message: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences · Bookzenvo</title></head><body style="margin:0;background:#f5f5f3;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:520px;margin:12vh auto;padding:24px"><div style="background:white;border:1px solid #e7e5e4;border-radius:20px;padding:32px;box-shadow:0 16px 40px rgba(0,0,0,.06)"><p style="font-size:13px;color:#78716c;margin:0 0 8px">BOOKZENVO</p><h1 style="font-size:28px;margin:0 0 12px">Email preferences updated</h1><p style="line-height:1.6;color:#57534e;margin:0">${message}</p></div></main></body></html>`;

export const Route = createFileRoute("/api/marketing-unsubscribe/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const changed = await unsubscribeMarketingEmail(params.token);
          return new Response(
            page(
              changed
                ? "You will no longer receive promotional or rebooking emails from this salon. Appointment confirmations and essential service messages are unaffected."
                : "This unsubscribe link is invalid or no longer available.",
            ),
            {
              status: changed ? 200 : 404,
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        } catch {
          return new Response(
            page(
              "We could not update your preference just now. Please try again shortly.",
            ),
            {
              status: 500,
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        }
      },
    },
  },
});
