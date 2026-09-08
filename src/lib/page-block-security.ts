import {
  BLOCK_TYPES,
  type BlockType,
  type PageBlock,
} from "@/components/page-blocks/types";
import { safeImageSrc, safePublicHref } from "@/lib/safe-url";

const MAX_BLOCKS = 40;
const MAX_TEXT_LENGTH = 5_000;
const MAX_HEADING_LENGTH = 240;
const MAX_ALT_LENGTH = 240;
const MAX_PHOTOS = 9;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_HERO_VARIANTS = ["text-only", "text-photo", "split-screen"] as const;
const VALID_GALLERY_LAYOUTS = [3, 6, 9] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Keep persisted/preview page blocks within the fixed component contract.
 * Page layouts are public content and can be written by an old client or a
 * direct database edit, so a type assertion alone is not a security boundary.
 */
export function sanitizePageBlocks(raw: unknown, businessId?: string): PageBlock[] {
  if (!Array.isArray(raw)) return [];

  const result: PageBlock[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < Math.min(raw.length, MAX_BLOCKS); index++) {
    const value = raw[index];
    if (!isRecord(value) || typeof value.type !== "string") continue;
    const type = value.type as BlockType;
    if (!BLOCK_TYPES.includes(type) && type !== "testimonial") continue;
    if (!isRecord(value.config)) continue;

    const id = safeBlockId(value.id, index, ids);
    const config = value.config;
    const block = sanitizeBlock(type, config, businessId, id);
    if (block) result.push(block);
  }
  return result;
}

function sanitizeBlock(
  type: BlockType,
  config: RecordValue,
  businessId: string | undefined,
  id: string,
): PageBlock | null {
  switch (type) {
    case "hero": {
      const heading = text(config.heading, MAX_HEADING_LENGTH);
      if (!heading) return null;
      const variant = VALID_HERO_VARIANTS.includes(
        config.variant as (typeof VALID_HERO_VARIANTS)[number],
      )
        ? (config.variant as (typeof VALID_HERO_VARIANTS)[number])
        : "text-only";
      return {
        id,
        type,
        config: {
          variant,
          heading,
          eyebrow: optionalText(config.eyebrow, MAX_HEADING_LENGTH),
          subheading: optionalText(config.subheading, MAX_TEXT_LENGTH),
          ctaLabel: optionalText(config.ctaLabel, 160),
          ctaHref: safePublicHref(config.ctaHref) ?? undefined,
          photoUrl: safeImageSrc(config.photoUrl),
        },
      };
    }
    case "about": {
      const bio = text(config.bio, MAX_TEXT_LENGTH);
      if (!bio) return null;
      return {
        id,
        type,
        config: {
          bio,
          heading: optionalText(config.heading, MAX_HEADING_LENGTH),
          photoUrl: safeImageSrc(config.photoUrl),
        },
      };
    }
    case "gallery": {
      const layout = VALID_GALLERY_LAYOUTS.includes(
        config.layout as (typeof VALID_GALLERY_LAYOUTS)[number],
      )
        ? (config.layout as (typeof VALID_GALLERY_LAYOUTS)[number])
        : 6;
      const photos = Array.isArray(config.photos)
        ? config.photos
            .slice(0, Math.min(layout, MAX_PHOTOS))
            .flatMap((photo) => {
              if (!isRecord(photo)) return [];
              const url = safeImageSrc(photo.url);
              return url
                ? [{ url, alt: optionalText(photo.alt, MAX_ALT_LENGTH) }]
                : [];
            })
        : [];
      return { id, type, config: { layout, photos } };
    }
    case "services-list":
      return {
        id,
        type,
        config: {
          businessId: businessId ?? safeUuid(config.businessId) ?? "",
          heading: optionalText(config.heading, MAX_HEADING_LENGTH),
        },
      };
    case "staff-spotlight": {
      const staffIds = Array.isArray(config.staffIds)
        ? config.staffIds.filter((value): value is string => !!safeUuid(value)).slice(0, 50)
        : undefined;
      return {
        id,
        type,
        config: {
          businessId: businessId ?? safeUuid(config.businessId) ?? "",
          heading: optionalText(config.heading, MAX_HEADING_LENGTH),
          staffIds: staffIds?.length ? staffIds : undefined,
        },
      };
    }
    case "hours-location":
      return {
        id,
        type,
        config: {
          businessId: businessId ?? safeUuid(config.businessId) ?? "",
          heading: optionalText(config.heading, MAX_HEADING_LENGTH),
        },
      };
    case "testimonial": {
      const quote = text(config.quote, MAX_TEXT_LENGTH);
      const name = text(config.name, 160);
      if (!quote || !name) return null;
      return {
        id,
        type,
        config: {
          quote,
          name,
          role: optionalText(config.role, 160),
        },
      };
    }
    default:
      return null;
  }
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : result ? result.slice(0, maxLength) : null;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  return text(value, maxLength) ?? undefined;
}

function safeUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function safeBlockId(value: unknown, index: number, ids: Set<string>): string {
  const candidate =
    typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value)
      ? value
      : `block-${index + 1}`;
  let id = candidate;
  let suffix = 2;
  while (ids.has(id)) id = `${candidate}-${suffix++}`;
  ids.add(id);
  return id;
}
