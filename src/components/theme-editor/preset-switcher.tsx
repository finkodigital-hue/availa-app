import { ConfirmDialog } from "@/components/confirm-dialog";
import { THEME_PRESETS, PRESET_LABELS, themeFromPreset } from "@/lib/theme-presets";
import type { PresetId, Theme } from "@/lib/theme";

// "Change vibe" — used in the Design panel. Switching presets overwrites the
// business's custom colors/fonts/button style, so it's gated by a confirm
// dialog (per spec); logoUrl is preserved across the switch.
export function PresetSwitcher({ theme, onChange, instant = false }: { theme: Theme; onChange: (t: Theme) => void; instant?: boolean }) {
  const presetIds = Object.keys(THEME_PRESETS) as PresetId[];
  return (
    <div data-theme-presets className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {presetIds.map((id) => {
        const preset = THEME_PRESETS[id];
        const isActive = theme.preset === id;
        if (instant) return (
          <button key={id} type="button" aria-pressed={isActive} className="builder-look" onClick={() => onChange(themeFromPreset(id, theme))}>
            <span className="builder-look-scene" style={{ background: preset.colors.background, color: preset.colors.text }} aria-hidden="true">
              <span className="builder-look-wordmark">YOUR SALON <span style={{ background: preset.colors.primary }} /></span>
              <span className="builder-look-heading" style={{ fontFamily: `${preset.typography.displayFont}, ${id === "soft_elegant" ? "Georgia, serif" : "sans-serif"}` }}>A little<br />time for you.</span>
              <span className="builder-look-detail" style={{ background: preset.colors.surface }}><span style={{ background: preset.colors.accent }} /><span style={{ background: preset.colors.primary }} /></span>
              <span className="builder-look-cta" style={{ background: preset.colors.primary, borderRadius: preset.buttons.cornerRadius }} />
            </span>
            <span className="builder-look-caption">{PRESET_LABELS[id]}<span className="builder-look-selected" aria-hidden="true">{isActive ? "✓" : "+"}</span></span>
          </button>
        );
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
