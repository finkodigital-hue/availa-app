export type HeroVariant = "text-only" | "text-photo" | "split-screen";

export interface HeroConfig {
  variant: HeroVariant;
  eyebrow?: string;
  heading: string;
  subheading?: string;
  ctaLabel?: string;
  ctaHref?: string;
  photoUrl?: string | null;
}

export interface AboutConfig {
  heading?: string;
  bio: string;
  photoUrl?: string | null;
}

export interface GalleryConfig {
  layout: 3 | 6 | 9;
  photos: { url: string; alt?: string }[];
}

// Renders real staff for `businessId`. `staffIds` narrows/orders which staff
// show; omitted means every bookable staff member.
export interface StaffSpotlightConfig {
  businessId: string;
  heading?: string;
  staffIds?: string[];
}

// Renders real active services for `businessId` — never invent a service.
export interface ServicesListConfig {
  businessId: string;
  heading?: string;
}

// Owner-entered only — never invent a quote, name, or role.
export interface TestimonialConfig {
  quote: string;
  name: string;
  role?: string;
}

// Renders real business_hours + address/phone for `businessId`.
export interface HoursLocationConfig {
  businessId: string;
  heading?: string;
}

export type BlockType =
  "hero" | "about" | "gallery" | "services-list" | "staff-spotlight" | "testimonial" | "hours-location";

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero",
  about: "About",
  gallery: "Gallery",
  "services-list": "Services",
  "staff-spotlight": "Staff spotlight",
  testimonial: "Testimonial",
  "hours-location": "Hours & location",
};

export const BLOCK_TYPES = Object.keys(BLOCK_LABELS) as BlockType[];

// The shape persisted in page_layouts.blocks. `id` is a client-generated key
// for list rendering/reordering, independent of any database id.
export type PageBlock =
  | { id: string; type: "hero"; config: HeroConfig }
  | { id: string; type: "about"; config: AboutConfig }
  | { id: string; type: "gallery"; config: GalleryConfig }
  | { id: string; type: "services-list"; config: ServicesListConfig }
  | { id: string; type: "staff-spotlight"; config: StaffSpotlightConfig }
  | { id: string; type: "testimonial"; config: TestimonialConfig }
  | { id: string; type: "hours-location"; config: HoursLocationConfig };

export function defaultConfigForType(type: BlockType, businessId: string): PageBlock["config"] {
  switch (type) {
    case "hero":
      return { variant: "text-only", heading: "Your heading here" };
    case "about":
      return { bio: "" };
    case "gallery":
      return { layout: 6, photos: [] };
    case "services-list":
      return { businessId };
    case "staff-spotlight":
      return { businessId };
    case "testimonial":
      return { quote: "", name: "" };
    case "hours-location":
      return { businessId };
  }
}
