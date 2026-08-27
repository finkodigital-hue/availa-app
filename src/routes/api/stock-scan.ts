import { createFileRoute } from "@tanstack/react-router";
import { analyzeStockPhoto, StockScanError, StockScanPlanError } from "@/lib/stock-ai.server";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const Route = createFileRoute("/api/stock-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
          if (!token) return new Response("Unauthorized", { status: 401 });

          const form = await request.formData();
          const businessId = form.get("businessId");
          const image = form.get("image");
          const categoriesValue = form.get("categories");
          if (typeof businessId !== "string" || !(image instanceof File)) {
            return new Response("A business and stock photo are required", { status: 400 });
          }
          if (!ALLOWED_TYPES.has(image.type)) {
            return new Response("Use a JPG, PNG, WebP, or GIF image", { status: 415 });
          }
          if (image.size > MAX_IMAGE_BYTES) {
            return new Response("The photo is too large. Use an image under 5 MB", { status: 413 });
          }

          let categories: string[] = [];
          if (typeof categoriesValue === "string") {
            try {
              const parsed = JSON.parse(categoriesValue);
              if (Array.isArray(parsed)) {
                categories = parsed
                  .filter((value): value is string => typeof value === "string")
                  .map((value) => value.trim().slice(0, 60))
                  .filter(Boolean)
                  .slice(0, 50);
              }
            } catch {
              categories = [];
            }
          }

          const result = await analyzeStockPhoto({
            accessToken: token,
            businessId,
            image: new Uint8Array(await image.arrayBuffer()),
            mediaType: image.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            categories,
          });
          return Response.json(result);
        } catch (error) {
          if (error instanceof StockScanPlanError) {
            return new Response(error.message, { status: 402 });
          }
          if (error instanceof StockScanError) {
            return new Response(error.message, { status: 422 });
          }
          const message = error instanceof Error ? error.message : "Server error";
          const status = message === "Unauthorized" ? 401 : message === "Not found" ? 404 : 500;
          return new Response(message, { status });
        }
      },
    },
  },
});
