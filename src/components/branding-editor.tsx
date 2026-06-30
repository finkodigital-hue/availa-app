import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Palette, Type, Square, Moon, Sun, Contrast } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FONT_CHOICES, BUTTON_STYLES } from "@/lib/branding";
import { toast } from "sonner";

export function BrandingEditor({ business }: { business: any }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (business) setF(business); }, [business?.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("businesses").update({
      brand_color: f.brand_color,
      secondary_color: f.secondary_color,
      accent_color: f.accent_color,
      font: f.font,
      button_style: f.button_style,
      border_radius: f.border_radius,
      theme: f.theme,
    }).eq("id", business.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Branding saved");
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <ColorField icon={Palette} label="Primary" value={f.brand_color ?? "#C2410C"} onChange={(v) => setF({ ...f, brand_color: v })} />
        <ColorField icon={Palette} label="Secondary" value={f.secondary_color ?? "#1F2937"} onChange={(v) => setF({ ...f, secondary_color: v })} />
        <ColorField icon={Palette} label="Accent" value={f.accent_color ?? "#0EA5E9"} onChange={(v) => setF({ ...f, accent_color: v })} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Type className="h-3 w-3" /> Display font</Label>
          <Select value={f.font ?? "fraunces"} onValueChange={(v) => setF({ ...f, font: v })}>
            <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_CHOICES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Square className="h-3 w-3" /> Button style</Label>
          <ToggleGroup type="single" value={f.button_style ?? "rounded"} onValueChange={(v) => v && setF({ ...f, button_style: v })} className="mt-1.5 justify-start">
            {BUTTON_STYLES.map((b) => (
              <ToggleGroupItem key={b.id} value={b.id} className="h-10 px-4 text-xs">{b.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Corner radius · <span className="tabular-nums">{f.border_radius ?? 12}px</span></Label>
        <Slider min={0} max={28} step={2} value={[f.border_radius ?? 12]} onValueChange={([v]) => setF({ ...f, border_radius: v })} className="mt-3" />
      </div>

      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Theme</Label>
        <ToggleGroup type="single" value={f.theme ?? "light"} onValueChange={(v) => v && setF({ ...f, theme: v })} className="mt-1.5 justify-start">
          <ToggleGroupItem value="light" className="h-10 px-4 text-xs"><Sun className="h-3.5 w-3.5 mr-1" /> Light</ToggleGroupItem>
          <ToggleGroupItem value="dark" className="h-10 px-4 text-xs"><Moon className="h-3.5 w-3.5 mr-1" /> Dark</ToggleGroupItem>
          <ToggleGroupItem value="auto" className="h-10 px-4 text-xs"><Contrast className="h-3.5 w-3.5 mr-1" /> Auto</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Live preview */}
      <BrandPreview b={f} />

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save branding
        </Button>
      </div>
    </div>
  );
}

function ColorField({ icon: Icon, label, value, onChange }: { icon: any; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5 flex items-center gap-3 rounded-xl border bg-background h-10 px-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-7 rounded cursor-pointer bg-transparent border-0" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 border-0 px-0 shadow-none focus-visible:ring-0 tabular-nums text-xs" />
      </div>
    </div>
  );
}

function BrandPreview({ b }: { b: any }) {
  const radius = `${b.border_radius ?? 12}px`;
  const btnRadius = BUTTON_STYLES.find((s) => s.id === (b.button_style ?? "rounded"))?.radius ?? "0.75rem";
  const isDark = b.theme === "dark";
  return (
    <div
      className="rounded-xl border p-5 transition-colors"
      style={{
        background: isDark ? "#0B0B0C" : "#FAFAF7",
        color: isDark ? "#F5F5F1" : "#111",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-60 mb-2">Preview</div>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 grid place-items-center text-white font-semibold" style={{ background: b.brand_color ?? "#C2410C", borderRadius: radius }}>L</div>
        <div className="font-display text-xl" style={{ fontFamily: `var(--brand-font, inherit)` }}>Your booking page</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="px-3 py-2 text-xs text-white" style={{ background: b.brand_color ?? "#C2410C", borderRadius: btnRadius }}>Book now</button>
        <button className="px-3 py-2 text-xs border" style={{ borderColor: b.secondary_color ?? "#1F2937", color: b.secondary_color ?? "#1F2937", borderRadius: btnRadius }}>Secondary</button>
        <button className="px-3 py-2 text-xs text-white" style={{ background: b.accent_color ?? "#0EA5E9", borderRadius: btnRadius }}>Accent</button>
      </div>
    </div>
  );
}
