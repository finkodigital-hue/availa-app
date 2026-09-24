import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Star } from "lucide-react";

/** Existing review and Google setup, surfaced where owners plan growth. */
export function AssistantGrowthGuide() {
  return (
    <section
      className="rounded-2xl border bg-card p-5"
      aria-labelledby="assistant-growth-guide-heading"
    >
      <div className="flex items-center gap-2">
        <Star
          className="h-4 w-4 text-[color:var(--gold-deep)]"
          aria-hidden="true"
        />
        <h2
          id="assistant-growth-guide-heading"
          className="text-base font-semibold"
        >
          Turn visits into trust
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Bookzenvo can request genuine reviews after completed visits. Check the
        setting and share your Google booking link from Page Builder.
      </p>
      <Link
        to="/page-builder"
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--gold-deep)] hover:underline"
      >
        Reviews and booking links <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
      <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Ask for honest feedback from real customers. Never offer a reward in
        exchange for a Google review.
      </p>
    </section>
  );
}
