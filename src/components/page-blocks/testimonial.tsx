import { Quote } from "lucide-react";
import type { TestimonialConfig } from "./types";

export function Testimonial({ config }: { config: TestimonialConfig }) {
  return (
    <section
      style={{ borderRadius: "var(--brand-radius)" }}
      className="border bg-card p-8 sm:p-10 text-center max-w-xl mx-auto"
    >
      <Quote className="h-6 w-6 mx-auto" style={{ color: "var(--brand-accent)", opacity: 0.6 }} />
      <p className="font-display text-xl mt-4 text-balance">&ldquo;{config.quote}&rdquo;</p>
      <div className="mt-4 text-sm">
        <span className="font-medium">{config.name}</span>
        {config.role && <span className="text-muted-foreground"> · {config.role}</span>}
      </div>
    </section>
  );
}
