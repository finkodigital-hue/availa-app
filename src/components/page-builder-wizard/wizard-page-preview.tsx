import { useId } from "react";
import { PublicBookingPage, type PublicBookingBusiness } from "@/components/public-booking-page";
import type { PageBlock } from "@/components/page-blocks";
import type { Theme } from "@/lib/theme";

// Embeds the real public booking page — scaled down and non-interactive —
// as a live preview inside the wizard/Design panel. `theme` and `pageBlocks`
// are passed in explicitly so callers can feed unsaved draft state.
export function WizardPagePreview({
  business,
  theme,
  pageBlocks,
  height = 480,
  scale = 0.5,
}: {
  business: PublicBookingBusiness;
  theme: Theme;
  pageBlocks: PageBlock[];
  height?: number;
  scale?: number;
}) {
  // Each mounted instance needs a distinct DOM id — the page's font-override
  // <style> block is scoped by id selector, and two instances sharing the
  // default id would each apply to both (see PublicBookingPage's domId prop).
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");

  return (
    <div className="rounded-xl border overflow-hidden bg-background" style={{ height }}>
      <div
        className="pointer-events-none origin-top-left"
        style={{ width: `${100 / scale}%`, transform: `scale(${scale})` }}
      >
        <PublicBookingPage
          business={business}
          theme={theme}
          pageBlocks={pageBlocks}
          domId={`wizard-preview-${reactId}`}
        />
      </div>
    </div>
  );
}
