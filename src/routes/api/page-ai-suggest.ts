import { createFileRoute } from "@tanstack/react-router";
import { suggestPageBlocks, PageAiError, PlanRequiredError } from "@/lib/page-ai.server";
import { parseTheme } from "@/lib/theme";
import { readJsonWithLimit } from "@/lib/request-limits";
import { trustedAppOrigin } from "@/lib/app-origin.server";

const MAX_PAGE_AI_BODY_BYTES = 180 * 1024;
const MAX_PAGE_AI_PROMPT_LENGTH = 4_000;
const MAX_PAGE_AI_BLOCKS = 40;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/page-ai-suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
          if (!token) return new Response("Unauthorized", { status: 401 });

          const parsed = await readJsonWithLimit<{
            businessId?: string;
            blocks?: unknown;
            theme?: unknown;
            prompt?: string;
          }>(request, MAX_PAGE_AI_BODY_BYTES);
          if ("error" in parsed) return parsed.error;
          const body = parsed.value;
          if (
            !body.businessId ||
            !UUID_PATTERN.test(body.businessId) ||
            typeof body.prompt !== "string" ||
            !body.prompt.trim() ||
            body.prompt.length > MAX_PAGE_AI_PROMPT_LENGTH
          ) {
            return new Response("businessId and prompt are required", { status: 400 });
          }
          if (!Array.isArray(body.blocks) || body.blocks.length > MAX_PAGE_AI_BLOCKS) {
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
            // Never derive the screenshot target from the request Host header.
            // A forged Host could otherwise make ScreenshotOne fetch an
            // attacker-selected origin (SSRF and unexpected screenshot spend).
            siteOrigin: trustedAppOrigin(),
            blocks: body.blocks,
            theme: parseTheme(body.theme),
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
          console.error("[api/page-ai-suggest] request failed", err);
          const status = msg === "Unauthorized" ? 401 : msg === "Not found" ? 404 : 500;
          return new Response(
            status === 401
              ? "Unauthorized"
              : status === 404
                ? "Workspace not found"
                : "The AI page editor could not complete that request.",
            { status },
          );
        }
      },
    },
  },
});
