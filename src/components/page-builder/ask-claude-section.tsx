import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Loader2, ChevronDown, Crown, Palette } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { WizardPagePreview } from "@/components/page-builder-wizard/wizard-page-preview";
import type { PublicBookingBusiness } from "@/components/public-booking-page";
import type { PageBlock } from "@/components/page-blocks";
import { applyDesignSuggestion, type DesignSuggestion, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// The AI suggest-changes flow, relocated from the primary/only editing
// mode into a secondary collapsible section below the block editor. The
// before/after review no longer waits on server-side ScreenshotOne
// screenshots — both panels are real live renders (WizardPagePreview, same
// in-process pattern as the main canvas), which is strictly faster and
// doesn't depend on an external screenshot service being configured.
export function AskClaudeSection({
  business,
  theme,
  blocks,
  plan,
  open,
  onOpenChange,
  onAccept,
}: {
  business: PublicBookingBusiness;
  theme: Theme;
  blocks: PageBlock[];
  plan: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: (nextBlocks: PageBlock[], nextTheme: Theme, prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<PageBlock[] | null>(null);
  const [baseline, setBaseline] = useState<PageBlock[] | null>(null);
  const [designSuggestion, setDesignSuggestion] = useState<DesignSuggestion | null>(null);

  const runSuggest = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/page-ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessId: business.id, blocks, theme, prompt }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Could not generate a suggestion");
      const data = (await res.json()) as { blocks: PageBlock[]; design: DesignSuggestion | null };
      setBaseline(blocks);
      setSuggestion(data.blocks);
      setDesignSuggestion(data.design);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate a suggestion");
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    if (!suggestion) return;
    onAccept(suggestion, applyDesignSuggestion(theme, designSuggestion), prompt);
    setSuggestion(null);
    setBaseline(null);
    setDesignSuggestion(null);
    setPrompt("");
  };

  const reject = () => {
    setSuggestion(null);
    setBaseline(null);
    setDesignSuggestion(null);
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-xl border bg-card">
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Ask AI
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">
          {plan === "free" ? (
            <div className="rounded-xl border-2 border-dashed bg-secondary/20 p-4 text-center">
              <Crown className="h-4 w-4 text-[color:var(--gold-deep)] mx-auto" />
              <p className="text-xs text-muted-foreground mt-2">
                Describing changes in plain English is a Studio feature.
              </p>
              <Link
                to="/settings"
                search={{ tab: "plan" } as any}
                className="inline-flex items-center gap-1.5 mt-3 rounded-[6px] bg-primary text-primary-foreground font-semibold text-xs px-4 py-2 hover:-translate-y-px transition-all"
              >
                Upgrade to Studio
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Nothing is saved until you review a before/after and approve it.
              </p>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Make the hero punchier, add a gallery of my work"
                rows={3}
              />
              <Button className="w-full" onClick={runSuggest} disabled={loading || !prompt.trim()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Suggest changes
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={!!suggestion} onOpenChange={(o) => !o && reject()}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review AI suggestion</DialogTitle>
            <DialogDescription>
              Nothing is saved yet — compare your current page against the suggested change.
            </DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Current
              </div>
              <WizardPagePreview
                business={business}
                theme={theme}
                pageBlocks={baseline ?? []}
                height={420}
                scale={0.45}
              />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                Suggested
                {designSuggestion && (
                  <span className="normal-case tracking-normal inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                    <Palette className="h-2.5 w-2.5" /> Also updates design
                  </span>
                )}
              </div>
              <WizardPagePreview
                business={business}
                theme={applyDesignSuggestion(theme, designSuggestion)}
                pageBlocks={suggestion ?? []}
                height={420}
                scale={0.45}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reject}>
              Keep current
            </Button>
            <Button onClick={accept}>Use this</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
