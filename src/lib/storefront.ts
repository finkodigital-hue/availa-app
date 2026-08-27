export type StorefrontSectionId = "gallery" | "booking" | "location";

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
  { id: "booking", visible: true, heading: "What would you like to book?", itemLimit: 6 },
  { id: "location", visible: true, heading: "Find us", itemLimit: 7 },
];

export function defaultStorefrontSettings(): StorefrontSettings {
  return {
    sections: DEFAULT_SECTIONS.map((section) => ({ ...section })),
  };
}

export function parseStorefrontSettings(raw: unknown): StorefrontSettings {
  const fallback = defaultStorefrontSettings();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<StorefrontSettings>;
  const incoming = Array.isArray(value.sections) ? value.sections : [];
  const sections = DEFAULT_SECTIONS.map((base) => {
    const match = incoming.find((section) => section?.id === base.id);
    return match ? { ...base, ...match, id: base.id } : { ...base };
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

export const STOREFRONT_SECTION_LABELS: Record<StorefrontSectionId, string> = {
  gallery: "Photo gallery",
  booking: "Booking services",
  location: "Location & hours",
};
