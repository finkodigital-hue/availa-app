import { Quote } from "lucide-react";
import type { TestimonialConfig } from "./types";

export function Testimonial({ config }: { config: TestimonialConfig }) {
  return (
    <section className="rounded-2xl border bg-card p-8 sm:p-10 text-center max-w-xl mx-auto">
      <Quote className="h-6 w-6 mx-auto text-muted-foreground/50" />
      <p className="font-display text-xl mt-4 text-balance">&ldquo;{config.quote}&rdquo;</p>
      <div className="mt-4 text-sm">
        <span className="font-medium">{config.name}</span>
        {config.role && <span className="text-muted-foreground"> · {config.role}</span>}
      </div>
    </section>
  );
}
