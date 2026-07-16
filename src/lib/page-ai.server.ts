import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { BLOCK_TYPES, type BlockType, type PageBlock } from "@/components/page-blocks";
import { captureScreenshot } from "./screenshot.server";

// Thrown for anything wrong with Claude's response itself (bad JSON, wrong
// shape, unknown block type) — the route maps this to a 422 so the client
// can show it as a validation error rather than a generic server failure.
export class PageAiError extends Error {}

const SYSTEM_PROMPT = `You are editing the block-based layout of a small service business's public booking page.

You will be given a screenshot of how the page currently renders (if available), the page's CURRENT blocks as a JSON array, and an instruction from the business owner describing what they want changed. Use the screenshot only to understand the current visual design — you cannot add arbitrary CSS or free-form visual elements outside the fixed block library below.

Return ONLY a JSON array of blocks representing the FULL new page layout (the complete list, not just the changed ones) — no prose, no markdown code fences, no explanation before or after. The entire response body must be valid JSON and nothing else.

Each block has this shape:
  { "id": string, "type": <one of the fixed types below>, "config": <object matching that type> }

Fixed block types — never invent any other type:

- "hero": { "variant": "text-only" | "text-photo" | "split-screen", "heading": string (required), "eyebrow"?: string, "subheading"?: string, "ctaLabel"?: string, "ctaHref"?: string, "photoUrl"?: string }
- "about": { "bio": string (required), "heading"?: string, "photoUrl"?: string }
- "gallery": { "layout": 3 | 6 | 9, "photos": { "url": string, "alt"?: string }[] }
- "services-list": { "heading"?: string } — this block always pulls the business's real active services automatically; never invent services or prices.
- "staff-spotlight": { "heading"?: string, "staffIds"?: string[] } — never invent staff ids; only reuse ids already present in the current blocks, or omit staffIds to show every bookable staff member.
- "testimonial": { "quote": string (required), "name": string (required), "role"?: string } — never invent a quote, name, or role that isn't already present in the current blocks or explicitly given in the owner's instruction.
- "hours-location": { "heading"?: string } — this block always pulls the business's real hours and address automatically; never add address or phone fields.

Styling (colors, fonts, button shape) is controlled globally by the business's Design panel, not per block — never add or invent per-block color/font fields.

Rules:
- Keep the "id" of any block you are not meaningfully changing exactly as given.
- For a new block you are adding, use a short placeholder id like "new-1", "new-2".
- Never output a block type other than the seven listed above.
- Never fabricate customer testimonials, staff members, services, or factual claims about the business.
- Output nothing but the JSON array — no leading or trailing text, no code fences.`;

export async function suggestPageBlocks({
  accessToken,
  businessId,
  siteOrigin,
  blocks,
  prompt,
}: {
  accessToken: string;
  businessId: string;
  siteOrigin: string;
  blocks: unknown[];
  prompt: string;
}): Promise<{ blocks: PageBlock[]; beforeImage: string | null; afterImage: string | null }> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Unauthorized");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!business) throw new Error("Not found");

  const currentBlocks = blocks as PageBlock[];
  const beforeUrl = buildPreviewUrl(siteOrigin, business.slug, currentBlocks);
  const beforeShot = await captureScreenshot(beforeUrl);

  const client = new Anthropic();
  const originalIds = new Set(
    blocks
      .map((b) => (b && typeof b === "object" && "id" in b ? (b as { id: unknown }).id : null))
      .filter((id): id is string => typeof id === "string"),
  );

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
          ...(beforeShot
            ? [
                {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: beforeShot.base64,
                  },
                },
              ]
            : []),
          {
            type: "text" as const,
            text: `CURRENT BLOCKS:\n${JSON.stringify(blocks, null, 2)}\n\nOWNER'S REQUEST:\n${prompt}`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new PageAiError("Claude declined this request. Try rephrasing it.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new PageAiError("Claude didn't return valid JSON. Try rephrasing your request.");
  }

  if (!Array.isArray(parsed)) {
    throw new PageAiError("Claude's response wasn't a list of blocks.");
  }

  const sanitized = parsed.map((item): PageBlock => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new PageAiError("Claude's response included a block that wasn't an object.");
    }
    const type = (item as { type?: unknown }).type;
    if (typeof type !== "string" || !BLOCK_TYPES.includes(type as BlockType)) {
      throw new PageAiError(`Claude included an unrecognized block type: "${String(type)}".`);
    }
    const config = (item as { config?: unknown }).config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new PageAiError(`The "${type}" block Claude returned is missing a valid config.`);
    }
    const id = (item as { id?: unknown }).id;
    const finalId = typeof id === "string" && originalIds.has(id) ? id : crypto.randomUUID();
    return { id: finalId, type, config } as PageBlock;
  });

  const afterUrl = buildPreviewUrl(siteOrigin, business.slug, sanitized);
  const afterShot = await captureScreenshot(afterUrl);

  return {
    blocks: sanitized,
    beforeImage: beforeShot ? `data:image/png;base64,${beforeShot.base64}` : null,
    afterImage: afterShot ? `data:image/png;base64,${afterShot.base64}` : null,
  };
}

// Renders arbitrary (possibly unsaved) blocks on the real public page via the
// preview-mode query params book.$slug.tsx already understands, so the
// screenshot — and Claude's visual context — reflect the actual page
// components/branding rather than a synthetic approximation.
function buildPreviewUrl(siteOrigin: string, slug: string, blocks: PageBlock[]): string {
  const url = new URL(`/book/${slug}`, siteOrigin);
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewBlocks", JSON.stringify(blocks));
  return url.toString();
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : text;
}
