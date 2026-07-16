import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ThemeControls, ThemePreview, PresetSwitcher, HEX_RE } from "@/components/theme-editor";
import { parseTheme, type Theme } from "@/lib/theme";
import { toast } from "sonner";

// The persistent post-wizard home for everything that used to live in
// Settings > Branding — the same controls as the wizard's "Make it yours"
// step, plus a preset switcher and a way back into the wizard.
export function DesignPanel({ business }: { business: { id: string; name: string; page_theme: unknown } }) {
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Theme>(() => parseTheme(business.page_theme));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTheme(parseTheme(business.page_theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  const save = async () => {
    if (!HEX_RE.test(theme.colors.primary) || !HEX_RE.test(theme.colors.accent)) {
      return toast.error("Colors must be a valid hex code, e.g. #8E2A38");
    }
    setSaving(true);
    const nextTheme: Theme = { ...theme, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from("businesses")
      .update({ page_theme: nextTheme as any })
      .eq("id", business.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setTheme(nextTheme);
    toast.success("Design saved");
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  const rerunWizard = async () => {
    const { error } = await supabase
      .from("businesses")
      .update({ wizard_completed: false })
      .eq("id", business.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Change vibe</div>
          <PresetSwitcher theme={theme} onChange={setTheme} />
        </div>

        <ThemeControls theme={theme} onChange={setTheme} />

        <div className="flex items-center justify-between pt-2">
          <ConfirmDialog
            trigger={
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Re-run setup wizard
              </button>
            }
            title="Start the setup wizard over?"
            description="This will start over. Your current page won't be deleted until you generate a new one."
            confirmLabel="Start over"
            destructive={false}
            onConfirm={rerunWizard}
          />
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save design
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 h-fit">
        <ThemePreview theme={theme} name={business.name} />
      </div>
    </div>
  );
}
