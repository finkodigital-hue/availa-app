/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only delivery tables are absent from browser-generated types. */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function validTwilioSignature(
  url: string,
  form: URLSearchParams,
  supplied: string,
  token: string,
) {
  const payload =
    url +
    [...form.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${value}`)
      .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return constantTimeEqual(btoa(binary), supplied);
}

export const Route = createFileRoute("/api/twilio-sms-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TWILIO_AUTH_TOKEN;
        const signature = request.headers.get("x-twilio-signature") ?? "";
        if (!token || !signature)
          return new Response("Unauthorized", { status: 401 });
        const raw = await request.text();
        if (raw.length > 32_768)
          return new Response("Too large", { status: 413 });
        const form = new URLSearchParams(raw);
        const publicUrl = `${process.env.APP_URL?.replace(/\/$/, "") ?? ""}/api/twilio-sms-webhook`;
        if (!(await validTwilioSignature(publicUrl, form, signature, token)))
          return new Response("Unauthorized", { status: 401 });
        const messageId = form.get("MessageSid");
        const providerStatus = form.get("MessageStatus") ?? "";
        if (!messageId) return new Response("Bad request", { status: 400 });
        const delivered = providerStatus === "delivered";
        const failed = ["failed", "undelivered"].includes(providerStatus);
        if (delivered || failed) {
          await (supabaseAdmin as any)
            .from("notification_deliveries")
            .update({
              status: delivered ? "delivered" : "failed",
              delivered_at: delivered ? new Date().toISOString() : null,
              failed_at: failed ? new Date().toISOString() : null,
              last_error: failed
                ? `Twilio delivery status: ${providerStatus}${form.get("ErrorCode") ? ` (${form.get("ErrorCode")})` : ""}`
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq("provider", "twilio")
            .eq("provider_message_id", messageId);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
