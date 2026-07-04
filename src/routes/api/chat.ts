import { createServerFn as _forceStartAugmentation } from "@tanstack/react-start";
void _forceStartAugmentation;
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { buildAssistantContext } from "@/lib/assistant-context.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
          if (!token) return new Response("Unauthorized", { status: 401 });

          const body = (await request.json()) as { messages?: UIMessage[] };
          if (!Array.isArray(body.messages)) return new Response("messages required", { status: 400 });

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const { business, summary } = await buildAssistantContext(token);
          if (!business) return new Response("No workspace", { status: 400 });

          const gateway = createLovableAiGatewayProvider(key);
          const system = `You are the in-app AI business assistant for "${business.name}", a service booking business using this platform.
Be concise, warm, and actionable. Use markdown (short headings, bullets, bold). Always ground answers in the LIVE DATA below — do not invent bookings, customers, or numbers. When asked to draft an email, return a complete email with a subject line and body that the owner can copy.

LIVE DATA SNAPSHOT (refreshed each message):
${summary}`;

          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system,
            messages: await convertToModelMessages(body.messages),
          });

          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Server error";
          const status = msg === "Unauthorized" ? 401 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});
