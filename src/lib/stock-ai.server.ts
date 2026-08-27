import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export class StockScanError extends Error {}
export class StockScanPlanError extends Error {}

export type DetectedStockItem = {
  name: string;
  brand: string;
  category: string;
  unit: string;
  quantity: number;
  confidence: number;
  note: string;
};

const SYSTEM_PROMPT = `You inspect a photograph of a salon's stock shelf and prepare a cautious, editable inventory draft.

Return ONLY valid JSON in this exact shape, with no markdown or commentary:
{"items":[{"name":"string","brand":"string","category":"string","unit":"string","quantity":0,"confidence":0.0,"note":"string"}]}

Rules:
- Include only physical stock products or consumable supplies that are visibly identifiable.
- Group clearly identical products into one row and count the visible packages.
- quantity must be a non-negative whole number representing visible packages, not liquid remaining inside a container.
- Use a short useful product name. Include shade/size in the name when it distinguishes the product.
- Use an empty string when a brand cannot be read.
- Prefer one of the supplied business categories when it fits; otherwise use a concise new category.
- unit must be singular and describe one counted package, for example bottle, tube, box, jar, roll, pack, or unit.
- confidence is between 0 and 1.
- note should briefly flag uncertainty, obscured labels, possible duplicates, or a count the owner should check. Use an empty string when no warning is needed.
- Never invent products hidden from view. If nothing can be identified, return {"items":[]}.
- Return no more than 40 rows.`;

export async function analyzeStockPhoto({
  accessToken,
  businessId,
  image,
  mediaType,
  categories,
}: {
  accessToken: string;
  businessId: string;
  image: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  categories: string[];
}): Promise<{ items: DetectedStockItem[] }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase is not configured");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Unauthorized");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, plan")
    .eq("id", businessId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!business) throw new Error("Not found");
  if ((business.plan ?? "free") === "free") {
    throw new StockScanPlanError("AI stock scanning is a Studio feature.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not configured");
    throw new Error("AI stock scanning isn't configured yet. Please contact support.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: bytesToBase64(image),
            },
          },
          {
            type: "text",
            text: `Existing category names: ${categories.length ? categories.join(", ") : "none yet"}. Analyze this stock photo and return the editable draft.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new StockScanError("The photo couldn't be analysed. Try a clearer shelf photo.");
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new StockScanError("The scan returned an invalid result. Please try the photo again.");
  }

  const rawItems =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { items?: unknown }).items
      : null;
  if (!Array.isArray(rawItems)) throw new StockScanError("The scan result was incomplete.");

  const items = rawItems
    .slice(0, 40)
    .map(sanitizeItem)
    .filter((item): item is DetectedStockItem => item !== null);
  return { items };
}

function sanitizeItem(value: unknown): DetectedStockItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const name = cleanText(item.name, 100);
  if (!name) return null;
  return {
    name,
    brand: cleanText(item.brand, 80),
    category: cleanText(item.category, 60) || "Other",
    unit: cleanText(item.unit, 30) || "unit",
    quantity: Math.max(0, Math.round(toNumber(item.quantity))),
    confidence: Math.min(1, Math.max(0, toNumber(item.confidence))),
    note: cleanText(item.note, 180),
  };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function toNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stripCodeFence(text: string) {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? match[1] : text;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
