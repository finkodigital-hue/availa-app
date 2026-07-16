import { Palette, Type, Square } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FONT_CHOICES, BUTTON_RADIUS_MIN, BUTTON_RADIUS_MAX, type Theme, type ButtonStyle } from "@/lib/theme";
import { ColorField } from "./color-field";

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const BUTTON_STYLE_OPTIONS: { id: ButtonStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "outline", label: "Outline" },
  { id: "soft", label: "Soft" },
];

// The shared set of controls used both in the wizard's "Make it yours" step
// and the Design panel — every change is applied optimistically to `theme`
// via `onChange`; persistence is the caller's responsibility.
export function ThemeControls({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <ColorField
          icon={Palette}
          label="Primary"
          value={theme.colors.primary}
          onChange={(v) => onChange({ ...theme, colors: { ...theme.colors, primary: v } })}
        />
        <ColorField
          icon={Palette}
          label="Accent"
          value={theme.colors.accent}
          onChange={(v) => onChange({ ...theme, colors: { ...theme.colors, accent: v } })}
        />
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Type className="h-3 w-3" /> Display font
        </Label>
        <Select
          value={theme.typography.displayFont}
          onValueChange={(v) => onChange({ ...theme, typography: { ...theme.typography, displayFont: v } })}
        >
          <SelectTrigger className="mt-1.5 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_CHOICES.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Square className="h-3 w-3" /> Button style
        </Label>
        <ToggleGroup
          type="single"
          value={theme.buttons.style}
          onValueChange={(v) => v && onChange({ ...theme, buttons: { ...theme.buttons, style: v as ButtonStyle } })}
          className="mt-1.5 justify-start"
        >
          {BUTTON_STYLE_OPTIONS.map((b) => (
            <ToggleGroupItem key={b.id} value={b.id} className="h-10 px-4 text-xs">{b.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Corner radius · <span className="tabular-nums">{theme.buttons.cornerRadius}px</span>
        </Label>
        <Slider
          min={BUTTON_RADIUS_MIN}
          max={BUTTON_RADIUS_MAX}
          step={2}
          value={[theme.buttons.cornerRadius]}
          onValueChange={([v]) => onChange({ ...theme, buttons: { ...theme.buttons, cornerRadius: v } })}
          className="mt-3"
        />
      </div>
    </div>
  );
}
