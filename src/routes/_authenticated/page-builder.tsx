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
  Palette,
  Sparkles,
  Check,
  ExternalLink,
  Maximize2,
  Minimize2,
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
import { BookingChannelsSection } from "@/components/booking-channels-section";
import {
  PageContentEditor,
  type PageContentSettings,
} from "@/components/page-content-editor";
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
  type StorefrontSectionId,
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
type OpenSection =
  | "storefront"
  | "gallery"
  | "content"
  | "channels"
  | "design"
  | "ask-ai"
  | null;

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
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [tool, setTool] = useState("design");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [savedState, setSavedState] = useState("");
  const [selectedSection, setSelectedSection] = useState<StorefrontSectionId>();

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
  const [openSection, setOpenSection] = useState<OpenSection>(
    "design",
  );

  useEffect(() => {
    if (!biz || isLoading) return;
    const loaded = ((layout?.blocks as unknown as PageBlock[]) ?? []).filter(
      (block) => block.type !== "testimonial",
    );
    savedBlocksRef.current = loaded;
    const initial = {
      blocks: loaded,
      theme: parseTheme(biz.page_theme),
      storefront: parseStorefrontSettings(layout?.storefront_settings),
      content: pageContentFromBusiness(biz),
    };
    history.resetTo(initial);
    setSavedState(JSON.stringify(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id, biz?.id, isLoading]);

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
  const hasChanges = savedState !== "" && JSON.stringify(history.value) !== savedState;
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  const setBlocks = (
    updater: PageBlock[] | ((prev: PageBlock[]) => PageBlock[]),
  ) => {
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
      const idx = selectedBlockId
        ? b.findIndex((x) => x.id === selectedBlockId)
        : -1;
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
    setBlocks((b) =>
      b.map((x) => (x.id === id ? ({ ...x, config } as PageBlock) : x)),
    );
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
          page_theme: {
            ...next.theme,
            updatedAt: new Date().toISOString(),
          } as unknown as Json,
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
      setSavedState(JSON.stringify(next));
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
      return toast.error(
        "Add an emergency closure message, or turn the banner off.",
      );
    }
    for (const b of blocks) {
      if (b.type === "hero" && !b.config.heading.trim())
        return toast.error("Every welcome banner needs a heading.");
      if (b.type === "about" && !b.config.bio.trim())
        return toast.error("Every about block needs a bio.");
    }
    if (await persist(history.value, null)) toast.success("Page saved");
  };

  const acceptAiSuggestion = async (
    nextBlocks: PageBlock[],
    nextTheme: Theme,
    prompt: string,
  ) => {
    const baseline = blocks;
    const next: BuilderState = {
      blocks: nextBlocks,
      theme: nextTheme,
      storefront,
      content,
    };
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

  const restoreVersion = async (entry: {
    blocks_after: unknown;
    created_at: string;
  }) => {
    const restored = (
      (entry.blocks_after as unknown as PageBlock[]) ?? []
    ).filter((b) => b && b.type);
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
            description:
              "Tweak anything here — click a block on the page to edit it.",
          });
        }}
      />
    );
  }

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;
  const editableBlocks = blocks.filter((block) => block.type === "about");

  return (
    <div data-builder-studio className="flex min-h-[100dvh] flex-col p-4 sm:p-6 lg:h-screen lg:min-h-0">
      <PageHeader
        eyebrow="Your creative space"
        title="Make it yours."
        subtitle="A beautiful first impression, built by you."
        action={
          <div className="flex flex-wrap items-center gap-1.5">
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
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      />
      <div className="builder-status-bar">
        <span role="status" className="inline-flex items-center gap-2 text-sm">
          {hasChanges ? <span className="h-2 w-2 rounded-full bg-gold-deep" /> : <Check className="h-4 w-4 text-gold-deep" />}
          {saving ? "Saving your page…" : hasChanges ? "Unsaved changes · preview updated" : "You're up to date"}
        </span>
        <a href={`/book/${biz.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium">
          View live page <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

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

      <div data-preview-expanded={previewExpanded} className="builder-workspace mt-5 grid flex-1 gap-5 pb-24 lg:min-h-0 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:pb-0">
        {/* Left panel */}
        <div
          className={`${mobileView === "edit" ? "block" : "hidden"} builder-inspector lg:flex lg:min-h-0 lg:flex-col`}
        >
          <nav aria-label="Page editing tools" className="builder-tools">
            {[
              { id: "design", label: "Design", icon: Palette, section: "design" },
              { id: "content", label: "Content", icon: FileText, section: "content" },
              { id: "storefront", label: "Sections", icon: LayoutTemplate, section: "storefront" },
              { id: "channels", label: "Share", icon: ExternalLink, section: "channels" },
              { id: "ask-ai", label: "Ask AI", icon: Sparkles, section: "ask-ai" },
            ].map(({id, label, icon: Icon, section}) => (
              <button key={id} type="button" aria-pressed={tool === id} onClick={() => { setTool(id); setOpenSection(section as OpenSection); }}>
                <Icon className="h-5 w-5" /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="builder-controls space-y-4 overflow-y-auto p-4">
          <div className="builder-tip">
            <span className="text-xs font-semibold text-gold-deep">{tool === "design" ? "Start with a feeling" : tool === "content" ? "Let your personality shine" : tool === "storefront" ? "Give everything its place" : tool === "ask-ai" ? "A little creative help" : "Ready to be discovered"}</span>
            <p className="mt-1 text-sm text-muted-foreground">{tool === "design" ? "Try a look, choose your colours and watch your page come to life." : tool === "content" ? "Your words and photos tell clients what makes your salon special." : tool === "storefront" ? "Choose what appears and put your favourite sections first." : tool === "ask-ai" ? "Describe what you have in mind. Review suggestions before applying them." : "Find your booking link and ways to share it with clients."}</p>
          </div>
          <div hidden={tool !== "channels"}>
          <BookingChannelsSection
            businessName={biz.name}
            slug={biz.slug}
            open={openSection === "channels"}
            onOpenChange={(isOpen) =>
              setOpenSection(isOpen ? "channels" : null)
            }
          />
          </div>

          <div hidden={tool !== "storefront"} className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) =>
                  current === "storefront" ? null : "storefront",
                )
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
                  selectedSection={selectedSection}
                />
              </div>
            )}
          </div>

          <div hidden={tool !== "content"} className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) =>
                  current === "content" ? null : "content",
                )
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

          <div hidden={tool !== "content"} className="overflow-hidden rounded-xl border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/25"
              onClick={() =>
                setOpenSection((current) =>
                  current === "gallery" ? null : "gallery",
                )
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
                <p className="mb-3 text-xs text-muted-foreground">Photo changes are saved as you go.</p>
                <GalleryManager businessId={biz.id} />
              </div>
            )}
          </div>

          <div hidden={tool !== "content"} className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Optional content
          </div>

          <div hidden={tool !== "content"} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">About your salon</div>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Add a short introduction beneath the main page sections.
                </p>
              </div>
              {editableBlocks.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddPickerOpen(true)}
                >
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
                  onClick={() => { setSelectedBlockId(block.id); setTool("content"); }}
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

          {selectedBlock && biz.id && tool === "content" && (
            <div className="rounded-xl border bg-card p-4">
              <BlockEditorPanel
                block={selectedBlock}
                businessId={biz.id}
                onChange={(config) =>
                  updateBlockConfig(selectedBlock.id, config)
                }
                onRemove={() => removeBlock(selectedBlock.id)}
                onDeselect={() => setSelectedBlockId(null)}
              />
            </div>
          )}

          <div hidden={tool !== "design"}>
          <DesignSection
            studio
            theme={theme}
            onChange={setTheme}
            open={openSection === "design"}
            onOpenChange={(o) => setOpenSection(o ? "design" : null)}
          />
          </div>
          <div hidden={tool !== "ask-ai"}>
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
          </div>
        </div>

        {/* Right pane: the real public page, live */}
        <div
          className={`${mobileView === "preview" ? "flex" : "hidden"} builder-preview min-h-[720px] flex-col overflow-hidden rounded-2xl border lg:flex lg:min-h-0`}
        >
          <div className="builder-preview-toolbar">
            <span className="inline-flex items-center gap-2"><span className="builder-live-dot" /> Live preview</span>
            <span className="truncate text-muted-foreground">/book/{biz.slug}</span>
            <button type="button" className="hidden rounded-lg p-2 hover:bg-secondary lg:block" aria-label={previewExpanded ? "Show editing tools" : "Expand preview"} onClick={() => setPreviewExpanded(v => !v)}>
              {previewExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
          <div className="builder-canvas min-h-0 flex-1 overflow-y-auto bg-card" onClickCapture={(event) => {
            const section = (event.target as HTMLElement).closest<HTMLElement>("[data-storefront-section]");
            if (!section) return;
            event.preventDefault();
            event.stopPropagation();
            setSelectedSection(section.dataset.storefrontSection as StorefrontSectionId);
            setPreviewExpanded(false);
            setTool("storefront");
            setOpenSection("storefront");
            setMobileView("edit");
          }}>
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
              onSelectBlock={(id) => { setSelectedBlockId(id); if (id) { setPreviewExpanded(false); setTool("content"); setMobileView("edit"); } }}
              onReorder={reorderBlocks}
            />
          )}
          </div>
          <div className="builder-preview-footer">Click a section to edit it. Save when you're happy.</div>
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
            <DialogDescription>
              Restore an earlier version of your page layout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {historyLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            {!historyLoading &&
              (!versionHistory || versionHistory.length === 0) && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No history yet.
                </p>
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
