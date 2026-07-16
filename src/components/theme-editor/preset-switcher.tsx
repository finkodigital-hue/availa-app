import { ConfirmDialog } from "@/components/confirm-dialog";
import { THEME_PRESETS, PRESET_LABELS, themeFromPreset } from "@/lib/theme-presets";
import type { PresetId, Theme } from "@/lib/theme";

// "Change vibe" — used in the Design panel. Switching presets overwrites the
// business's custom colors/fonts/button style, so it's gated by a confirm
// dialog (per spec); logoUrl is preserved across the switch.
export function PresetSwitcher({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const presetIds = Object.keys(THEME_PRESETS) as PresetId[];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {presetIds.map((id) => {
        const preset = THEME_PRESETS[id];
        const isActive = theme.preset === id;
        return (
          <ConfirmDialog
            key={id}
            trigger={
              <button
                type="button"
                disabled={isActive}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  isActive ? "border-primary ring-1 ring-primary" : "hover:bg-secondary/50"
                }`}
              >
                <div className="flex gap-1 mb-2">
                  <span className="h-4 w-4 rounded-full border" style={{ background: preset.colors.primary }} />
                  <span className="h-4 w-4 rounded-full border" style={{ background: preset.colors.accent }} />
                </div>
                <div className="text-xs font-medium">{PRESET_LABELS[id]}</div>
              </button>
            }
            title={`Switch to "${PRESET_LABELS[id]}"?`}
            description="This replaces your current colors, fonts, and button style with this preset's defaults. Your logo stays as-is."
            confirmLabel="Switch"
            destructive={false}
            onConfirm={() => onChange(themeFromPreset(id, theme))}
          />
        );
      })}
    </div>
  );
}
