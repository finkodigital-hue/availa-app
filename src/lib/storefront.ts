export type StorefrontSectionId =
  | "gallery"
  | "booking"
  | "reviews"
  | "location";

export type StorefrontSection = {
  id: StorefrontSectionId;
  visible: boolean;
  heading: string;
  itemLimit: number;
};

export type StorefrontSettings = {
  sections: StorefrontSection[];
};

const DEFAULT_SECTIONS: StorefrontSection[] = [
  { id: "gallery", visible: true, heading: "Our salon", itemLimit: 3 },
  {
    id: "booking",
    visible: true,
    heading: "What would you like to book?",
    itemLimit: 6,
  },
  {
    id: "reviews",
    visible: true,
    heading: "Loved by our clients",
    itemLimit: 6,
  },
  { id: "location", visible: true, heading: "Find us", itemLimit: 7 },
];

export function defaultStorefrontSettings(): StorefrontSettings {
  return {
    sections: DEFAULT_SECTIONS.map((section) => ({ ...section })),
  };
}

export function parseStorefrontSettings(raw: unknown): StorefrontSettings {
  const fallback = defaultStorefrontSettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const value = raw as { sections?: unknown };
  const incoming = Array.isArray(value.sections) ? value.sections.slice(0, 20) : [];
  const sections = DEFAULT_SECTIONS.map((base) => {
    const match = incoming.find(
      (section): section is Record<string, unknown> =>
        isRecord(section) && section.id === base.id,
    );
    if (!match) return { ...base };

    const heading =
      typeof match.heading === "string" ? match.heading.trim().slice(0, 240) : base.heading;
    const requestedLimit = Number(match.itemLimit);
    const maxLimit = base.id === "location" ? 7 : 12;
    const itemLimit = Number.isFinite(requestedLimit)
      ? Math.min(maxLimit, Math.max(1, Math.round(requestedLimit)))
      : base.itemLimit;

    return {
      ...base,
      id: base.id,
      // Booking is the only required section; never let malformed persisted
      // data hide the page's primary conversion path.
      visible:
        base.id === "booking"
          ? true
          : typeof match.visible === "boolean"
            ? match.visible
            : base.visible,
      heading,
      itemLimit,
    };
  });
  sections.sort((a, b) => {
    const ai = incoming.findIndex((section) => section?.id === a.id);
    const bi = incoming.findIndex((section) => section?.id === b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return {
    sections,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export const STOREFRONT_SECTION_LABELS: Record<StorefrontSectionId, string> = {
  gallery: "Photo gallery",
  booking: "Booking services",
  reviews: "Customer reviews",
  location: "Location & hours",
};
