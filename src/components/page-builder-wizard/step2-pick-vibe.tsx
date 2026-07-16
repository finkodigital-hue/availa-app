import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WizardPagePreview } from "./wizard-page-preview";
import { THEME_PRESETS, PRESET_LABELS, themeFromPreset } from "@/lib/theme-presets";
import type { PresetId, Theme } from "@/lib/theme";
import type { PublicBookingBusiness } from "@/components/public-booking-page";
import type { PageBlock } from "@/components/page-blocks";

export function Step2PickVibe({
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
  const presetIds = Object.keys(THEME_PRESETS) as PresetId[];

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl text-balance">
        Pick your <span className="italic text-primary">vibe</span>.
      </h1>
      <p className="text-sm text-muted-foreground mt-3">
        Choose a starting style — you'll be able to fine-tune every detail next.
      </p>

      <div className="grid grid-cols-2 gap-3 mt-8">
        {presetIds.map((id) => {
          const active = theme.preset === id;
          const cardTheme: Theme = { ...THEME_PRESETS[id], logoUrl: theme.logoUrl, updatedAt: theme.updatedAt };
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(themeFromPreset(id, theme))}
              className={cn(
                "rounded-2xl border p-1.5 text-left transition-colors",
                active ? "border-primary ring-1 ring-primary" : "hover:bg-secondary/30",
              )}
            >
              <WizardPagePreview business={business} theme={cardTheme} pageBlocks={previewBlocks} height={220} scale={0.26} />
              <div className="text-xs font-medium text-center py-2">{PRESET_LABELS[id]}</div>
            </button>
          );
        })}
      </div>

      <Button className="w-full h-11 mt-8 shadow-glow" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
