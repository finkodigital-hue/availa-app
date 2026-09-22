/* eslint-disable @typescript-eslint/no-explicit-any -- Server-only delivery tables are absent from browser-generated types. */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { trustedAppOrigin } from "@/lib/app-origin.server";
import { readBodyWithLimit } from "@/lib/request-limits";

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
        const bytes = await readBodyWithLimit(request, 32_768);
        if (!bytes) return new Response("Too large", { status: 413 });
        const raw = new TextDecoder().decode(bytes);
        const form = new URLSearchParams(raw);
        const requestUrl = new URL(request.url);
        const publicUrl = `${trustedAppOrigin()}/api/twilio-sms-webhook${requestUrl.search}`;
        if (!(await validTwilioSignature(publicUrl, form, signature, token)))
          return new Response("Unauthorized", { status: 401 });
        const messageId = form.get("MessageSid");
        if (form.get("AccountSid") !== process.env.TWILIO_ACCOUNT_SID) return new Response("Unauthorized", { status: 401 });
        const providerStatus = form.get("MessageStatus") ?? "";
        if (!messageId) return new Response("Bad request", { status: 400 });
        const delivered = providerStatus === "delivered";
        const failed = ["failed", "undelivered"].includes(providerStatus);
        if (delivered || failed || ["queued", "sending", "sent", "accepted"].includes(providerStatus)) {
          const deliveryId = requestUrl.searchParams.get("delivery_id");
          if (deliveryId && !/^[0-9a-f-]{36}$/i.test(deliveryId)) return new Response("Bad request", { status: 400 });
          const { error } = await (supabaseAdmin as any).rpc("record_notification_provider_status", {
            p_provider: "twilio", p_provider_id: messageId,
            p_status: delivered ? "delivered" : failed ? "failed" : "sent",
            p_delivery_id: deliveryId,
          });
          if (error) return new Response("Could not record delivery", { status: 500 });
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
