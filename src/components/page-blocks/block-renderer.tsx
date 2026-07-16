import { Hero } from "./hero";
import { About } from "./about";
import { Gallery } from "./gallery";
import { ServicesList } from "./services-list";
import { StaffSpotlight } from "./staff-spotlight";
import { Testimonial } from "./testimonial";
import { HoursLocation } from "./hours-location";
import type { PageBlock } from "./types";

// Renders one owner-configured block. Silently skips anything that doesn't
// match a known type — e.g. stored data from a future block type — rather
// than breaking the whole page over it.
export function BlockRenderer({ block }: { block: PageBlock }) {
  switch (block.type) {
    case "hero":
      return <Hero config={block.config} />;
    case "about":
      return <About config={block.config} />;
    case "gallery":
      return <Gallery config={block.config} />;
    case "services-list":
      return <ServicesList config={block.config} />;
    case "staff-spotlight":
      return <StaffSpotlight config={block.config} />;
    case "testimonial":
      return <Testimonial config={block.config} />;
    case "hours-location":
      return <HoursLocation config={block.config} />;
    default:
      return null;
  }
}
