import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Hero,
  About,
  Gallery,
  StaffSpotlight,
  Testimonial,
  HoursLocation,
  BLOCK_TYPES,
  BLOCK_LABELS,
  type HeroVariant,
  type HeroConfig,
  type AboutConfig,
  type GalleryConfig,
  type TestimonialConfig,
  type BlockType,
} from "@/components/page-blocks";

export const Route = createFileRoute("/_authenticated/block-preview")({
  component: BlockPreviewPage,
});

// Dev-only sample content — not shown to real customers. StaffSpotlight and
// HoursLocation skip this and pull the signed-in owner's real business data,
// per the "no invented content" rule for anything customer-facing.
const HERO_SAMPLES: Record<HeroVariant, HeroConfig> = {
  "text-only": {
    variant: "text-only",
    eyebrow: "Book online",
    heading: "Look good. Feel great.",
    subheading: "Modern cuts, colour, and care — book your next appointment in under a minute.",
    ctaLabel: "Book now",
    brandColor: "#8E2A38",
  },
  "text-photo": {
    variant: "text-photo",
    eyebrow: "Book online",
    heading: "Look good. Feel great.",
    subheading: "Modern cuts, colour, and care — book your next appointment in under a minute.",
    ctaLabel: "Book now",
    photoUrl: "https://picsum.photos/seed/hero-text-photo/1200/600",
    brandColor: "#8E2A38",
  },
  "split-screen": {
    variant: "split-screen",
    eyebrow: "Book online",
    heading: "Look good. Feel great.",
    subheading: "Modern cuts, colour, and care — book your next appointment in under a minute.",
    ctaLabel: "Book now",
    photoUrl: "https://picsum.photos/seed/hero-split/900/1200",
    brandColor: "#8E2A38",
  },
};

const ABOUT_SAMPLE: AboutConfig = {
  heading: "Our story",
  bio: "Founded in 2015, we've been serving the neighbourhood with a focus on craft, care, and community. Every member of our team is trained to listen first and cut second.",
  photoUrl: "https://picsum.photos/seed/about-sample/400/400",
};

function gallerySample(layout: 3 | 6 | 9): GalleryConfig {
  return {
    layout,
    photos: Array.from({ length: layout }).map((_, i) => ({
      url: `https://picsum.photos/seed/gallery-${i}/600/600`,
      alt: `Sample photo ${i + 1}`,
    })),
  };
}

const TESTIMONIAL_SAMPLE: TestimonialConfig = {
  quote: "Best haircut I've had in years — the whole experience felt effortless.",
  name: "Jordan P.",
  role: "Regular customer",
};

function BlockPreviewPage() {
  const { data: biz, isLoading: bizLoading } = useMyBusiness();
  const [block, setBlock] = useState<BlockType>("hero");
  const [heroVariant, setHeroVariant] = useState<HeroVariant>("text-only");
  const [galleryLayout, setGalleryLayout] = useState<3 | 6 | 9>(6);

  return (
    <div className="p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="Internal"
        title="Block preview"
        subtitle="Renders one public-page block at a time with sample data, so we can check each in isolation before wiring up a real editor."
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {BLOCK_TYPES.map((b) => (
          <button
            key={b}
            onClick={() => setBlock(b)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              block === b
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {BLOCK_LABELS[b]}
          </button>
        ))}
      </div>

      {block === "hero" && (
        <div className="flex gap-2 mb-6">
          {(Object.keys(HERO_SAMPLES) as HeroVariant[]).map((v) => (
            <button
              key={v}
              onClick={() => setHeroVariant(v)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                heroVariant === v
                  ? "bg-secondary text-foreground border-border"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {block === "gallery" && (
        <div className="flex gap-2 mb-6">
          {([3, 6, 9] as const).map((n) => (
            <button
              key={n}
              onClick={() => setGalleryLayout(n)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                galleryLayout === n
                  ? "bg-secondary text-foreground border-border"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {n} photos
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-dashed bg-secondary/20 p-4 sm:p-8">
        {block === "hero" && <Hero config={HERO_SAMPLES[heroVariant]} />}
        {block === "about" && <About config={ABOUT_SAMPLE} />}
        {block === "gallery" && <Gallery config={gallerySample(galleryLayout)} />}
        {block === "testimonial" && <Testimonial config={TESTIMONIAL_SAMPLE} />}

        {(block === "staff-spotlight" || block === "hours-location") && (
          <>
            {bizLoading && <Skeleton className="h-40 rounded-2xl" />}
            {!bizLoading && !biz && (
              <div className="text-center text-sm text-muted-foreground py-10">
                Finish onboarding to preview this block with real business data.
              </div>
            )}
            {!bizLoading && biz && block === "staff-spotlight" && (
              <StaffSpotlight config={{ businessId: biz.id, heading: "Meet the team" }} />
            )}
            {!bizLoading && biz && block === "hours-location" && (
              <HoursLocation config={{ businessId: biz.id, heading: "Visit us" }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
