import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { BLOCK_TYPES, type BlockType, type PageBlock } from "@/components/page-blocks";
import {
  FONT_CHOICES,
  BUTTON_RADIUS_MIN,
  BUTTON_RADIUS_MAX,
  type Theme,
  type ButtonStyle,
  type DesignSuggestion,
} from "@/lib/theme";
import { captureScreenshot } from "./screenshot.server";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BUTTON_STYLES: ButtonStyle[] = ["solid", "outline", "soft"];

// Thrown for anything wrong with Claude's response itself (bad JSON, wrong
// shape, unknown block type) — the route maps this to a 422 so the client
// can show it as a validation error rather than a generic server failure.
export class PageAiError extends Error {}

// Thrown when a free-plan business calls this endpoint — the route maps
// this to a 402 so the client can show an upgrade prompt distinct from a
// validation or server error.
export class PlanRequiredError extends Error {}

const FONT_LIST = FONT_CHOICES.map((f) => `"${f.id}"`).join(", ");

const SYSTEM_PROMPT = `You are editing the block-based layout and, when relevant, the visual design of a small service business's public booking page.

You will be given a screenshot of how the page currently renders (if available), the page's CURRENT blocks as a JSON array, the CURRENT design settings, and an instruction from the business owner describing what they want changed. Use the screenshot only to understand the current visual design — you cannot add arbitrary CSS or free-form visual elements outside the fixed block library below.

Return ONLY a single JSON object of this shape — no prose, no markdown code fences, no explanation before or after. The entire response body must be valid JSON and nothing else:

{
  "blocks": [ <the FULL new list of blocks, complete list not just changed ones> ],
  "design": <a design-change object, see below> | null
}

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

Per-block color/font fields do not exist — never add or invent any. Visual styling is controlled by the separate top-level "design" object:

"design" fields (all optional — include only the ones you are actually changing, omit the rest):
  { "primaryColor"?: "#RRGGBB", "accentColor"?: "#RRGGBB", "displayFont"?: <one of ${FONT_LIST}>, "buttonStyle"?: "solid" | "outline" | "soft", "cornerRadius"?: <number 0-24> }

Only include "design" (non-null) when the owner's request actually implies a visual/mood change — e.g. "make it feel more luxurious", "brighter", "bolder", "softer", explicit color/font requests. For requests that are purely about content/copy/layout (e.g. "fix a typo", "add a gallery", "reorder sections"), set "design" to null — do not change colors or fonts just because you can. primaryColor and accentColor should normally be changed together as a coordinated pair, along with a matching displayFont, so the result reads as one deliberate look rather than a single color tweak.

Rules:
- Keep the "id" of any block you are not meaningfully changing exactly as given.
- For a new block you are adding, use a short placeholder id like "new-1", "new-2".
- Never output a block type other than the seven listed above.
- Never fabricate customer testimonials, staff members, services, or factual claims about the business.
- Output nothing but the JSON object — no leading or trailing text, no code fences.`;

export async function suggestPageBlocks({
  accessToken,
  businessId,
  siteOrigin,
  blocks,
  theme,
  prompt,
}: {
  accessToken: string;
  businessId: string;
  siteOrigin: string;
  blocks: unknown[];
  theme: Theme;
  prompt: string;
}): Promise<{ blocks: PageBlock[]; design: DesignSuggestion | null }> {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Unauthorized");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, plan")
    .eq("id", businessId)
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!business) throw new Error("Not found");
  if ((business.plan ?? "free") === "free") {
    throw new PlanRequiredError("The AI page editor is a Studio feature. Upgrade to Studio to use it.");
  }

  const currentBlocks = blocks as PageBlock[];
  const beforeUrl = buildPreviewUrl(siteOrigin, business.slug, currentBlocks);
  const beforeShot = await captureScreenshot(beforeUrl);

  const client = new Anthropic();
  const originalIds = new Set(
    blocks
      .map((b) => (b && typeof b === "object" && "id" in b ? (b as { id: unknown }).id : null))
      .filter((id): id is string => typeof id === "string"),
  );

  const currentDesign: DesignSuggestion = {
    primaryColor: theme.colors.primary,
    accentColor: theme.colors.accent,
    displayFont: theme.typography.displayFont,
    buttonStyle: theme.buttons.style,
    cornerRadius: theme.buttons.cornerRadius,
  };

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
            text: `CURRENT BLOCKS:\n${JSON.stringify(blocks, null, 2)}\n\nCURRENT DESIGN:\n${JSON.stringify(currentDesign, null, 2)}\n\nOWNER'S REQUEST:\n${prompt}`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new PageAiError("The AI declined this request. Try rephrasing it.");
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
    throw new PageAiError("The AI didn't return valid JSON. Try rephrasing your request.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PageAiError("The AI's response wasn't in the expected shape.");
  }

  const rawBlocks = (parsed as { blocks?: unknown }).blocks;
  if (!Array.isArray(rawBlocks)) {
    throw new PageAiError("The AI's response wasn't a list of blocks.");
  }

  const sanitized = rawBlocks.map((item): PageBlock => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new PageAiError("The AI's response included a block that wasn't an object.");
    }
    const type = (item as { type?: unknown }).type;
    if (typeof type !== "string" || !BLOCK_TYPES.includes(type as BlockType)) {
      throw new PageAiError(`The AI included an unrecognized block type: "${String(type)}".`);
    }
    const config = (item as { config?: unknown }).config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new PageAiError(`The "${type}" block the AI returned is missing a valid config.`);
    }
    const id = (item as { id?: unknown }).id;
    const finalId = typeof id === "string" && originalIds.has(id) ? id : crypto.randomUUID();
    return { id: finalId, type, config } as PageBlock;
  });

  const design = sanitizeDesign((parsed as { design?: unknown }).design);

  return { blocks: sanitized, design };
}

// Design is secondary/optional, so a malformed field is dropped rather than
// failing the whole suggestion — a bad font name shouldn't block an
// otherwise-good copy edit. Returns null if there's nothing valid to apply.
function sanitizeDesign(raw: unknown): DesignSuggestion | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: DesignSuggestion = {};

  if (typeof r.primaryColor === "string" && HEX_RE.test(r.primaryColor)) {
    out.primaryColor = r.primaryColor;
  }
  if (typeof r.accentColor === "string" && HEX_RE.test(r.accentColor)) {
    out.accentColor = r.accentColor;
  }
  if (typeof r.displayFont === "string" && FONT_CHOICES.some((f) => f.id === r.displayFont)) {
    out.displayFont = r.displayFont;
  }
  if (typeof r.buttonStyle === "string" && BUTTON_STYLES.includes(r.buttonStyle as ButtonStyle)) {
    out.buttonStyle = r.buttonStyle as ButtonStyle;
  }
  if (typeof r.cornerRadius === "number" && Number.isFinite(r.cornerRadius)) {
    out.cornerRadius = Math.min(BUTTON_RADIUS_MAX, Math.max(BUTTON_RADIUS_MIN, r.cornerRadius));
  }

  return Object.keys(out).length > 0 ? out : null;
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
