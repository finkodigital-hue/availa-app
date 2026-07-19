import { createFileRoute } from "@tanstack/react-router";
import { suggestPageBlocks, PageAiError, PlanRequiredError } from "@/lib/page-ai.server";

export const Route = createFileRoute("/api/page-ai-suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
          if (!token) return new Response("Unauthorized", { status: 401 });

          const body = (await request.json()) as {
            businessId?: string;
            blocks?: unknown;
            prompt?: string;
          };
          if (!body.businessId || typeof body.prompt !== "string" || !body.prompt.trim()) {
            return new Response("businessId and prompt are required", { status: 400 });
          }
          if (!Array.isArray(body.blocks)) {
            return new Response("blocks must be an array", { status: 400 });
          }

          if (!process.env.ANTHROPIC_API_KEY) {
            console.error("ANTHROPIC_API_KEY is not configured");
            return new Response(
              "The AI page editor isn't configured yet. Please contact support.",
              { status: 500 },
            );
          }

          const result = await suggestPageBlocks({
            accessToken: token,
            businessId: body.businessId,
            siteOrigin: new URL(request.url).origin,
            blocks: body.blocks,
            prompt: body.prompt,
          });

          return Response.json(result);
        } catch (err) {
          if (err instanceof PlanRequiredError) {
            return new Response(err.message, { status: 402 });
          }
          if (err instanceof PageAiError) {
            return new Response(err.message, { status: 422 });
          }
          const msg = err instanceof Error ? err.message : "Server error";
          const status = msg === "Unauthorized" ? 401 : msg === "Not found" ? 404 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});
