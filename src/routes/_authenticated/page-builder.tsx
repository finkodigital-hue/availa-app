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
  SlidersHorizontal,
  Eye,
  FileText,
  ChevronDown,
  ImageIcon,
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
import { StorefrontSettingsEditor } from "@/components/storefront-settings-editor";
import { GalleryManager } from "@/components/gallery-manager";
import { PageContentEditor, type PageContentSettings } from "@/components/page-content-editor";
import { useUndoRedoState } from "@/lib/use-undo-redo-state";
import { parseTheme, type Theme } from "@/lib/theme";
import {
  BLOCK_LABELS,
  defaultConfigForType,
  type BlockType,
  type PageBlock,
} from "@/components/page-blocks";
import { toast } from "sonner";
import {
  defaultStorefrontSettings,
  parseStorefrontSettings,
  type StorefrontSettings,
} from "@/lib/storefront";

type BuilderState = {
  blocks: PageBlock[];
  theme: Theme;
  storefront: StorefrontSettings;
  content: PageContentSettings;
};

function pageContentFromBusiness(business: unknown): PageContentSettings {
  const source = (business ?? {}) as Partial<PageContentSettings>;
  return {
    welcome_message: source.welcome_message ?? null,
    booking_instructions: source.booking_instructions ?? null,
    cancellation_policy: source.cancellation_policy ?? null,
    terms: source.terms ?? null,
    faq: Array.isArray(source.faq) ? source.faq : [],
    show_prices: !!source.show_prices,
    show_staff: !!source.show_staff,
    show_durations: !!source.show_durations,
    emergency_active: !!source.emergency_active,
    emergency_message: source.emergency_message ?? null,
  };
}
// The left panel's collapsible sections (Design, Ask AI) behave as a single
// accordion — opening one closes the other, and re-clicking the open one
// collapses to none. One piece of shared state instead of each section
// tracking its own open/closed.
type OpenSection = "storefront" | "gallery" | "content" | "design" | "ask-ai" | null;

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
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");

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

  const history = useUndoRedoState<BuilderState>({
    blocks: [],
    theme: parseTheme(null),
    storefront: defaultStorefrontSettings(),
    content: pageContentFromBusiness(null),
  });
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
    history.resetTo({
      blocks: loaded,
      theme: parseTheme(biz.page_theme),
      storefront: parseStorefrontSettings(layout?.storefront_settings),
      content: pageContentFromBusiness(biz),
    });
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

  const { blocks, theme, storefront, content } = history.value;

  const setBlocks = (updater: PageBlock[] | ((prev: PageBlock[]) => PageBlock[])) => {
    history.set((v) => ({
      ...v,
      blocks:
        typeof updater === "function"
          ? (updater as (p: PageBlock[]) => PageBlock[])(v.blocks)
          : updater,
    }));
  };
  const setTheme = (next: Theme) => history.set((v) => ({ ...v, theme: next }));
  const setStorefront = (next: StorefrontSettings) =>
    history.set((value) => ({ ...value, storefront: next }));
  const setContent = (next: PageContentSettings) =>
    history.set((value) => ({ ...value, content: next }));

  const addBlock = (type: BlockType) => {
    if (!biz) return;
    const block = {
      id: crypto.randomUUID(),
      type,
      config: defaultConfigForType(type, biz.id),
    } as PageBlock;
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
      supabase.from("page_layouts").upsert(
        {
          business_id: biz.id,
          blocks: next.blocks as unknown as Json,
          storefront_settings: next.storefront as unknown as Json,
        },
        { onConflict: "business_id" },
      ),
      supabase
        .from("businesses")
        .update({
          page_theme: { ...next.theme, updatedAt: new Date().toISOString() } as unknown as Json,
          welcome_message: next.content.welcome_message,
          booking_instructions: next.content.booking_instructions,
          cancellation_policy: next.content.cancellation_policy,
          terms: next.content.terms,
          faq: next.content.faq as unknown as Json,
          show_prices: next.content.show_prices,
          show_staff: next.content.show_staff,
          show_durations: next.content.show_durations,
          emergency_active: next.content.emergency_active,
          emergency_message: next.content.emergency_message,
        })
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
    if (content.emergency_active && !content.emergency_message?.trim()) {
      return toast.error("Add an emergency closure message, or turn the banner off.");
    }
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
    const next: BuilderState = { blocks: nextBlocks, theme: nextTheme, storefront, content };
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
    const restored = ((entry.blocks_after as unknown as PageBlock[]) ?? []).filter(
      (b) => b && b.type,
    );
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
  const editableBlocks = blocks.filter((block) => block.type === "about");

  return (
    <div className="flex min-h-[100dvh] flex-col p-5 sm:p-8 lg:h-screen lg:min-h-0 lg:p-10">
      <PageHeader
        eyebrow="Public page"
        title="Page builder"
        subtitle="Click a block on the page to edit it. Everything updates live."
        action={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={history.undo}
              disabled={!history.canUndo}
              aria-label="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={history.redo}
              disabled={!history.canRedo}
              aria-label="Redo"
            >
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

      <div className="mt-6 grid grid-cols-2 rounded-xl border bg-secondary/35 p-1 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileView("edit")}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors active:scale-[0.98] ${
            mobileView === "edit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" /> Edit page
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors active:scale-[0.98] ${
            mobileView === "preview"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Eye className="h-4 w-4" /> Live preview
        </button>
      </div>

      <div className="mt-5 grid flex-1 gap-8 pb-24 lg:mt-6 lg:min-h-0 lg:grid-cols-[420px_minmax(0,1fr)] lg:pb-0 xl:grid-cols-[460px_minmax(0,1fr)]">
        {/* Left panel */}
        <div
          className={`${mobileView === "edit" ? "block" : "hidden"} space-y-5 lg:block lg:overflow-y-auto lg:pr-2`}
        >
          <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Page sections
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) => (current === "storefront" ? null : "storefront"))
              }
              aria-expanded={openSection === "storefront"}
            >
              <span className="inline-flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" /> Storefront sections
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  openSection === "storefront" ? "rotate-180" : ""
                }`}
              />
            </button>
            {openSection === "storefront" && (
              <div className="px-4 pb-4">
                <StorefrontSettingsEditor
                  businessId={biz.id}
                  value={storefront}
                  onChange={setStorefront}
                  showSave={false}
                />
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) => (current === "content" ? null : "content"))
              }
              aria-expanded={openSection === "content"}
            >
              <span className="inline-flex items-center gap-2">
                <FileText className="h-4 w-4" /> Page text and policies
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  openSection === "content" ? "rotate-180" : ""
                }`}
              />
            </button>
            {openSection === "content" && (
              <div className="px-4 pb-4">
                <PageContentEditor value={content} onChange={setContent} />
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) => (current === "gallery" ? null : "gallery"))
              }
              aria-expanded={openSection === "gallery"}
            >
              <span className="inline-flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Gallery photos
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  openSection === "gallery" ? "rotate-180" : ""
                }`}
              />
            </button>
            {openSection === "gallery" && (
              <div className="px-4 pb-4">
                <GalleryManager businessId={biz.id} />
              </div>
            )}
          </div>

          <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Optional content
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">About your salon</div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Add a short introduction beneath the main page sections.
                </p>
              </div>
              {editableBlocks.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => setAddPickerOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              )}
            </div>
            {isLoading ? (
              <Skeleton className="mt-3 h-9 w-full" />
            ) : (
              editableBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => setSelectedBlockId(block.id)}
                  className={`mt-3 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedBlockId === block.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/35 hover:bg-secondary/60"
                  }`}
                >
                  Edit about section
                </button>
              ))
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

          <div className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Appearance and assistance
          </div>

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
        <div
          className={`${mobileView === "preview" ? "block" : "hidden"} min-h-[720px] overflow-y-auto rounded-2xl border bg-secondary/10 lg:block lg:min-h-0`}
        >
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-64 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <PageBuilderCanvas
              business={{ ...biz, ...content }}
              theme={theme}
              blocks={blocks}
              storefrontSettings={storefront}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              onReorder={reorderBlocks}
            />
          )}
        </div>
      </div>

      <AddBlockPicker
        open={addPickerOpen}
        onOpenChange={setAddPickerOpen}
        onAdd={addBlock}
        types={["about"]}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>Restore an earlier version of your page layout.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {historyLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            {!historyLoading && (!versionHistory || versionHistory.length === 0) && (
              <p className="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
            )}
            {versionHistory?.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {entry.prompt ?? "Manual edit"}
                  </div>
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
