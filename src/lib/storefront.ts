export type StorefrontSectionId = "gallery" | "booking" | "reviews" | "location";

export type StorefrontReview = {
  id: string;
  name: string;
  quote: string;
  rating: number;
};

export type StorefrontSection = {
  id: StorefrontSectionId;
  visible: boolean;
  heading: string;
  itemLimit: number;
};

export type StorefrontSettings = {
  sections: StorefrontSection[];
  reviewScore: number | null;
  reviewCount: number | null;
  reviews: StorefrontReview[];
};

const DEFAULT_SECTIONS: StorefrontSection[] = [
  { id: "gallery", visible: true, heading: "Our salon", itemLimit: 3 },
  { id: "booking", visible: true, heading: "What would you like to book?", itemLimit: 6 },
  { id: "reviews", visible: true, heading: "Loved by our clients", itemLimit: 2 },
  { id: "location", visible: true, heading: "Find us", itemLimit: 7 },
];

export function defaultStorefrontSettings(): StorefrontSettings {
  return {
    sections: DEFAULT_SECTIONS.map((section) => ({ ...section })),
    reviewScore: null,
    reviewCount: null,
    reviews: [],
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
    reviewScore: typeof value.reviewScore === "number" ? value.reviewScore : null,
    reviewCount: typeof value.reviewCount === "number" ? value.reviewCount : null,
    reviews: Array.isArray(value.reviews)
      ? value.reviews
          .filter(
            (review) =>
              review && typeof review.name === "string" && typeof review.quote === "string",
          )
          .map((review) => ({
            ...review,
            rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
          }))
      : [],
  };
}

export const STOREFRONT_SECTION_LABELS: Record<StorefrontSectionId, string> = {
  gallery: "Photo gallery",
  booking: "Booking services",
  reviews: "Reviews",
  location: "Location & hours",
};
