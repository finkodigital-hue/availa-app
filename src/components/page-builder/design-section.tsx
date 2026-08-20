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
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
