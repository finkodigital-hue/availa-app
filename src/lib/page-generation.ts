import type { PageBlock } from "@/components/page-blocks";

// Deterministic assembly of a starter page from real business data — no LLM
// call. Fast, free, and avoids the existing AI-suggest flow's assumption of
// an existing page to screenshot/diff against.
export function assembleInitialBlocks({
  businessId,
  businessName,
  hasStaff,
}: {
  businessId: string;
  businessName: string;
  hasStaff: boolean;
}): PageBlock[] {
  const blocks: PageBlock[] = [
    {
      id: crypto.randomUUID(),
      type: "hero",
      config: {
        variant: "text-only",
        eyebrow: "Book online",
        heading: businessName,
        subheading: "Book your next appointment online in under a minute.",
        ctaLabel: "Book now",
      },
    },
    {
      id: crypto.randomUUID(),
      type: "services-list",
      config: { businessId, heading: "Our services" },
    },
  ];

  if (hasStaff) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "staff-spotlight",
      config: { businessId, heading: "Meet the team" },
    });
  }

  blocks.push({
    id: crypto.randomUUID(),
    type: "hours-location",
    config: { businessId, heading: "Visit us" },
  });

  return blocks;
}
