import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createAiProvider } from "@/lib/ai-provider.server";
import { buildAssistantContext } from "@/lib/assistant-context.server";
import { readJsonWithLimit } from "@/lib/request-limits";

const MAX_CHAT_BODY_BYTES = 120 * 1024;
const MAX_CHAT_MESSAGES = 40;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
          if (!token) return new Response("Unauthorized", { status: 401 });

          const parsed = await readJsonWithLimit<{ messages?: unknown }>(
            request,
            MAX_CHAT_BODY_BYTES,
          );
          if ("error" in parsed) return parsed.error;
          const body = parsed.value;
          if (!Array.isArray(body.messages))
            return new Response("messages required", { status: 400 });
          if (
            body.messages.length === 0 ||
            body.messages.length > MAX_CHAT_MESSAGES ||
            body.messages.some(
              (message) => !message || typeof message !== "object" || Array.isArray(message),
            )
          ) {
            return new Response("messages must contain between 1 and 40 items", { status: 400 });
          }

          const key = process.env.ANTHROPIC_API_KEY;
          if (!key) {
            console.error("ANTHROPIC_API_KEY is not configured");
            return new Response("The assistant isn't configured yet. Please contact support.", {
              status: 500,
            });
          }

          const { business, summary } = await buildAssistantContext(token);
          if (!business) return new Response("No workspace", { status: 400 });
          if (((business as { plan?: string }).plan ?? "free") === "free") {
            return new Response(
              "The AI assistant is a Studio feature. Upgrade to Studio to use it.",
              { status: 402 },
            );
          }

          const provider = createAiProvider(key);
          const system = `You are the in-app AI business assistant for "${business.name}", a service booking business using this platform.
Be concise, warm, and actionable. Use markdown (short headings, bullets, bold). Always ground answers in the LIVE DATA below — do not invent bookings, customers, or numbers. When asked to draft an email, return a complete email with a subject line and body that the owner can copy.

LIVE DATA SNAPSHOT (refreshed each message):
${summary}`;

          const result = streamText({
            // Haiku, not Sonnet/Opus — this is a high-frequency, low-complexity
            // chat workload (plain-text answers over live business data, no
            // image input, no strict output schema), so the cheapest current
            // Claude model is the right cost/latency tradeoff here.
            model: provider("claude-haiku-4-5-20251001"),
            system,
            messages: await convertToModelMessages(body.messages as UIMessage[]),
          });

          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Server error";
          console.error("[api/chat] request failed", err);
          const status = msg === "Unauthorized" ? 401 : 500;
          return new Response(
            status === 401 ? "Unauthorized" : "The assistant could not complete that request.",
            { status },
          );
        }
      },
    },
  },
});
