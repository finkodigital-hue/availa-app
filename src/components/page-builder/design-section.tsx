import { Palette, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ThemeControls, PresetSwitcher } from "@/components/theme-editor";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Design controls, relocated from the old separate "Design" tab into a
// collapsible section of the left panel — same ThemeControls/PresetSwitcher
// components as before, now driving the shared blocks+theme state directly
// (applies to the canvas instantly, same as a block edit) instead of local
// state with its own dedicated save button. Open state is controlled by the
// parent so this and AskClaudeSection can behave as a one-open accordion.
export function DesignSection({
  theme,
  onChange,
  open,
  onOpenChange,
  studio = false,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studio?: boolean;
}) {
  if (studio) return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold">Choose your starting look</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Try one instantly. Your words and photos stay yours.</p>
        <PresetSwitcher theme={theme} onChange={onChange} instant />
        <p className="mt-3 text-xs text-muted-foreground">Looks replace colours, fonts and button styling. Undo brings your previous design back.</p>
      </section>
      <section className="builder-fine-tune">
        <h2 className="mb-4 text-base font-semibold">Add your signature</h2>
        <ThemeControls theme={theme} onChange={onChange} />
      </section>
    </div>
  );
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-xl border bg-card">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          <Palette className="h-4 w-4" /> Design
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-5">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Change vibe
          </div>
          <PresetSwitcher theme={theme} onChange={onChange} />
        </div>
        <ThemeControls theme={theme} onChange={onChange} />
      </CollapsibleContent>
    </Collapsible>
  );
}
