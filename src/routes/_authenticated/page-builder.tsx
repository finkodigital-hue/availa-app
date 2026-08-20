import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  History,
  Undo2,
  Redo2,
  LayoutTemplate,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SetupWizard } from "@/components/page-builder-wizard/setup-wizard";
import { PageBuilderCanvas } from "@/components/page-builder/canvas";
import { AddBlockPicker } from "@/components/page-builder/add-block-picker";
import { BlockEditorPanel } from "@/components/page-builder/block-editor-panel";
import { DesignSection } from "@/components/page-builder/design-section";
import { AskClaudeSection } from "@/components/page-builder/ask-claude-section";
import { useUndoRedoState } from "@/lib/use-undo-redo-state";
import { parseTheme, type Theme } from "@/lib/theme";
import { BLOCK_LABELS, defaultConfigForType, type BlockType, type PageBlock } from "@/components/page-blocks";
import { toast } from "sonner";

type BuilderState = { blocks: PageBlock[]; theme: Theme };
// The left panel's collapsible sections (Design, Ask AI) behave as a single
// accordion — opening one closes the other, and re-clicking the open one
// collapses to none. One piece of shared state instead of each section
// tracking its own open/closed.
type OpenSection = "design" | "ask-ai" | null;

export const Route = createFileRoute("/_authenticated/page-builder")({
  // `tab=design` is a pre-existing deep link from Settings > Branding — kept
  // for backward compat, now just opens the Design section by default
  // instead of switching a tab (Design no longer has its own tab).
  validateSearch: (search: Record<string, unknown>): { tab?: "design" } => ({
    tab: search.tab === "design" ? "design" : undefined,
  }),
  component: PageBuilderPage,
});

function PageBuilderPage() {
  const qc = useQueryClient();
  const { data: biz } = useMyBusiness();
  const { tab } = Route.useSearch();

  const { data: layout, isLoading } = useQuery({
    queryKey: ["page-layout", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_layouts")
        .select("*")
        .eq("business_id", biz!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const history = useUndoRedoState<BuilderState>({ blocks: [], theme: parseTheme(null) });
  // Snapshot of the last-saved blocks, used as blocks_before when logging to
  // page_edit_history (page_edit_history has no theme column — version
  // history stays block-content-only, same scope as before this rewrite).
  const savedBlocksRef = useRef<PageBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openSection, setOpenSection] = useState<OpenSection>(tab === "design" ? "design" : null);

  useEffect(() => {
    if (!biz) return;
    const loaded = (layout?.blocks as unknown as PageBlock[]) ?? [];
    savedBlocksRef.current = loaded;
    history.resetTo({ blocks: loaded, theme: parseTheme(biz.page_theme) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id, biz?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { blocks, theme } = history.value;

  const setBlocks = (updater: PageBlock[] | ((prev: PageBlock[]) => PageBlock[])) => {
    history.set((v) => ({
      ...v,
      blocks: typeof updater === "function" ? (updater as (p: PageBlock[]) => PageBlock[])(v.blocks) : updater,
    }));
  };
  const setTheme = (next: Theme) => history.set((v) => ({ ...v, theme: next }));

  const addBlock = (type: BlockType) => {
    if (!biz) return;
    const block = { id: crypto.randomUUID(), type, config: defaultConfigForType(type, biz.id) } as PageBlock;
    setBlocks((b) => {
      const idx = selectedBlockId ? b.findIndex((x) => x.id === selectedBlockId) : -1;
      if (idx === -1) return [...b, block];
      return [...b.slice(0, idx + 1), block, ...b.slice(idx + 1)];
    });
    history.commitNow();
    setSelectedBlockId(block.id);
  };

  const removeBlock = (id: string) => {
    setBlocks((b) => b.filter((x) => x.id !== id));
    history.commitNow();
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const updateBlockConfig = (id: string, config: PageBlock["config"]) => {
    setBlocks((b) => b.map((x) => (x.id === id ? ({ ...x, config } as PageBlock) : x)));
  };

  const reorderBlocks = (activeId: string, overId: string) => {
    setBlocks((b) => {
      const oldIdx = b.findIndex((x) => x.id === activeId);
      const newIdx = b.findIndex((x) => x.id === overId);
      if (oldIdx === -1 || newIdx === -1) return b;
      const next = b.slice();
      const [moved] = next.splice(oldIdx, 1);
      next.splice(newIdx, 0, moved);
      return next;
    });
    history.commitNow();
  };

  // Upserts page_layouts + businesses.page_theme together and logs the
  // blocks before/after pair to page_edit_history. Shared by the manual
  // Save button, accepting an AI suggestion, and restoring a prior version.
  const persist = async (
    next: BuilderState,
    historyPrompt: string | null,
    blocksBefore: PageBlock[] = savedBlocksRef.current,
  ) => {
    if (!biz) return false;
    setSaving(true);
    const [layoutRes, themeRes] = await Promise.all([
      supabase
        .from("page_layouts")
        .upsert({ business_id: biz.id, blocks: next.blocks as unknown as Json }, { onConflict: "business_id" }),
      supabase
        .from("businesses")
        .update({ page_theme: { ...next.theme, updatedAt: new Date().toISOString() } as unknown as Json })
        .eq("id", biz.id),
    ]);
    const error = layoutRes.error ?? themeRes.error;

    if (!error) {
      await supabase.from("page_edit_history").insert({
        business_id: biz.id,
        prompt: historyPrompt,
        blocks_before: blocksBefore as unknown as Json,
        blocks_after: next.blocks as unknown as Json,
      });
      savedBlocksRef.current = next.blocks;
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["page-layout", biz.id] });
    qc.invalidateQueries({ queryKey: ["my-business"] });
    return true;
  };

  const save = async () => {
    if (!biz) return;
    for (const b of blocks) {
      if (b.type === "hero" && !b.config.heading.trim())
        return toast.error("Every welcome banner needs a heading.");
      if (b.type === "about" && !b.config.bio.trim())
        return toast.error("Every about block needs a bio.");
      if (b.type === "testimonial" && (!b.config.quote.trim() || !b.config.name.trim()))
        return toast.error("Every testimonial needs a quote and a name.");
    }
    if (await persist(history.value, null)) toast.success("Page saved");
  };

  const acceptAiSuggestion = async (nextBlocks: PageBlock[], nextTheme: Theme, prompt: string) => {
    const baseline = blocks;
    const next: BuilderState = { blocks: nextBlocks, theme: nextTheme };
    history.set(next);
    history.commitNow();
    if (await persist(next, prompt, baseline)) {
      toast.success("Page updated");
    }
  };

  const { data: versionHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["page-edit-history", biz?.id],
    enabled: !!biz?.id && historyOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_edit_history")
        .select("id, prompt, blocks_after, created_at")
        .eq("business_id", biz!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const restoreVersion = async (entry: { blocks_after: unknown; created_at: string }) => {
    const restored = ((entry.blocks_after as unknown as PageBlock[]) ?? []).filter((b) => b && b.type);
    const label = `Reverted to version from ${new Date(entry.created_at).toLocaleString()}`;
    history.set((v) => ({ ...v, blocks: restored }));
    history.commitNow();
    if (await persist({ ...history.value, blocks: restored }, label, blocks)) {
      toast.success("Restored previous version");
      setHistoryOpen(false);
      qc.invalidateQueries({ queryKey: ["page-edit-history", biz?.id] });
    }
  };

  if (!biz) return null;

  // wizard_completed is the sole gate — pre-existing businesses were
  // backfilled to `true`, so this only fires for genuinely new businesses
  // and for "Re-run setup wizard" (flips it back to `false`).
  if (!biz.wizard_completed) {
    return (
      <SetupWizard
        business={biz}
        onComplete={() => {
          toast.success("Your page is live!", {
            description: "Tweak anything here — click a block on the page to edit it.",
          });
        }}
      />
    );
  }

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="p-5 sm:p-8 md:p-10 h-screen flex flex-col">
      <PageHeader
        eyebrow="Public page"
        title="Page builder"
        subtitle="Click a block on the page to edit it. Everything updates live."
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4 mr-1.5" /> History
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-[360px_1fr] gap-6 flex-1 min-h-0 mt-4">
        {/* Left panel */}
        <div className="overflow-y-auto space-y-4 pr-1">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5" /> Blocks ({blocks.length})
              </span>
              <Button variant="outline" size="sm" onClick={() => setAddPickerOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : blocks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No blocks yet — add one to start building your page.
              </p>
            ) : (
              <div className="space-y-1">
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBlockId(b.id)}
                    className={`w-full text-left rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      selectedBlockId === b.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary/60"
                    }`}
                  >
                    {BLOCK_LABELS[b.type]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedBlock && biz.id && (
            <div className="rounded-xl border bg-card p-4">
              <BlockEditorPanel
                block={selectedBlock}
                businessId={biz.id}
                onChange={(config) => updateBlockConfig(selectedBlock.id, config)}
                onRemove={() => removeBlock(selectedBlock.id)}
                onDeselect={() => setSelectedBlockId(null)}
              />
            </div>
          )}

          <DesignSection
            theme={theme}
            onChange={setTheme}
            open={openSection === "design"}
            onOpenChange={(o) => setOpenSection(o ? "design" : null)}
          />

          <AskClaudeSection
            business={biz}
            theme={theme}
            blocks={blocks}
            plan={biz.plan ?? "free"}
            open={openSection === "ask-ai"}
            onOpenChange={(o) => setOpenSection(o ? "ask-ai" : null)}
            onAccept={acceptAiSuggestion}
          />
        </div>

        {/* Right pane: the real public page, live */}
        <div className="rounded-2xl border bg-secondary/10 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <PageBuilderCanvas
              business={biz}
              theme={theme}
              blocks={blocks}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              onReorder={reorderBlocks}
            />
          )}
        </div>
      </div>

      <AddBlockPicker open={addPickerOpen} onOpenChange={setAddPickerOpen} onAdd={addBlock} />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>Restore an earlier version of your page layout.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {historyLoading &&
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            {!historyLoading && (!versionHistory || versionHistory.length === 0) && (
              <p className="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
            )}
            {versionHistory?.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.prompt ?? "Manual edit"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline" className="shrink-0">
                      Restore
                    </Button>
                  }
                  title="Restore this version?"
                  description="This replaces your current page layout and saves immediately."
                  confirmLabel="Restore"
                  onConfirm={() => restoreVersion(entry)}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
