import { Button } from "@/components/ui/button";
import { ThemeControls } from "@/components/theme-editor";
import { WizardPagePreview } from "./wizard-page-preview";
import type { PublicBookingBusiness } from "@/components/public-booking-page";
import type { PageBlock } from "@/components/page-blocks";
import type { Theme } from "@/lib/theme";

export function Step3MakeItYours({
  theme,
  business,
  previewBlocks,
  onChange,
  onContinue,
}: {
  theme: Theme;
  business: PublicBookingBusiness;
  previewBlocks: PageBlock[];
  onChange: (t: Theme) => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl text-balance">
        Make it <span className="italic text-primary">yours</span>.
      </h1>
      <p className="text-sm text-muted-foreground mt-3">
        Fine-tune colors, fonts, and buttons. Your preview updates instantly.
      </p>

      <div className="mt-6">
        <WizardPagePreview business={business} theme={theme} pageBlocks={previewBlocks} height={520} scale={0.55} />
      </div>

      <div className="mt-6">
        <ThemeControls theme={theme} onChange={onChange} />
      </div>

      <div className="flex flex-col gap-2 mt-8">
        <Button className="w-full h-11 shadow-glow" onClick={onContinue}>
          Continue
        </Button>
        <Button variant="ghost" className="w-full h-10 text-muted-foreground" onClick={onContinue}>
          Looks good as is
        </Button>
      </div>
    </div>
  );
}
