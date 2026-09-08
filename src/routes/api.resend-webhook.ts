/* eslint-disable @typescript-eslint/no-explicit-any -- Provider webhook payloads are untrusted and validated field-by-field. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/resend-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RESEND_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const body = await request.text();
        if (!(await validStandardWebhook(body, request.headers, secret)))
          return new Response("Invalid signature", { status: 400 });
        let event: any;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const providerId = event.data?.email_id;
        if (!providerId || typeof providerId !== "string")
          return Response.json({ received: true });
        const state =
          event.type === "email.delivered"
            ? "delivered"
            : event.type === "email.failed" || event.type === "email.bounced"
              ? "failed"
              : null;
        if (!state) return Response.json({ received: true });
        const { supabaseAdmin } =
          await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const values =
          state === "delivered"
            ? {
                status: state,
                delivered_at: now,
                updated_at: now,
                last_error: null,
              }
            : {
                status: state,
                failed_at: now,
                updated_at: now,
                last_error: String(event.data?.reason ?? event.type).slice(
                  0,
                  1000,
                ),
              };
        const { error } = await (supabaseAdmin as any)
          .from("notification_deliveries")
          .update(values)
          .eq("provider", "resend")
          .eq("provider_message_id", providerId);
        if (error)
          return new Response("Could not update delivery", { status: 500 });
        return Response.json({ received: true });
      },
    },
  },
});

async function validStandardWebhook(
  body: string,
  headers: Headers,
  configuredSecret: string,
) {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp =
    headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signatures =
    headers.get("svix-signature") ?? headers.get("webhook-signature") ?? "";
  if (
    !id ||
    !timestamp ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    const rawSecret = configuredSecret.startsWith("whsec_")
      ? configuredSecret.slice(6)
      : configuredSecret;
    const secretBytes = Uint8Array.from(atob(rawSecret), (char) =>
      char.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${id}.${timestamp}.${body}`),
      ),
    );
    const expected = btoa(String.fromCharCode(...digest));
    return signatures
      .split(" ")
      .some((part) => constantTimeEqual(part.replace(/^v1,/, ""), expected));
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++)
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}
