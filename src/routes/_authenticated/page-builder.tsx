import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  LayoutTemplate,
  Sparkles,
  History,
  Pencil,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  BLOCK_TYPES,
  BLOCK_LABELS,
  defaultConfigForType,
  BlockRenderer,
  type BlockType,
  type PageBlock,
  type HeroConfig,
  type AboutConfig,
  type GalleryConfig,
  type StaffSpotlightConfig,
  type TestimonialConfig,
  type HoursLocationConfig,
} from "@/components/page-blocks";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/page-builder")({
  component: PageBuilderPage,
});

function PageBuilderPage() {
  const qc = useQueryClient();
  const { data: biz } = useMyBusiness();

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

  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  // Snapshot of the last-saved state, used as blocks_before when logging to page_edit_history.
  const savedBlocksRef = useRef<PageBlock[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loaded = (layout?.blocks as unknown as PageBlock[]) ?? [];
    setBlocks(loaded);
    savedBlocksRef.current = loaded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const addBlock = (type: BlockType) => {
    if (!biz) return;
    const block = {
      id: crypto.randomUUID(),
      type,
      config: defaultConfigForType(type, biz.id),
    } as PageBlock;
    setBlocks((b) => [...b, block]);
  };

  const removeBlock = (id: string) => setBlocks((b) => b.filter((x) => x.id !== id));

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((b) => {
      const idx = b.findIndex((x) => x.id === id);
      const next = idx + dir;
      if (idx === -1 || next < 0 || next >= b.length) return b;
      return arrayMove(b, idx, next);
    });
  };

  const updateBlockConfig = (id: string, config: PageBlock["config"]) => {
    setBlocks((b) => b.map((x) => (x.id === id ? ({ ...x, config } as PageBlock) : x)));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBlocks((b) => {
      const oldIdx = b.findIndex((x) => x.id === active.id);
      const newIdx = b.findIndex((x) => x.id === over.id);
      return arrayMove(b, oldIdx, newIdx);
    });
  };

  // Upserts page_layouts and logs the before/after pair to page_edit_history.
  // Shared by the manual Save button, accepting an AI suggestion, and
  // restoring a prior version — each just supplies a different history prompt.
  const persist = async (
    nextBlocks: PageBlock[],
    historyPrompt: string | null,
    blocksBefore: PageBlock[] = savedBlocksRef.current,
  ) => {
    if (!biz) return false;
    setSaving(true);
    const { error } = await supabase
      .from("page_layouts")
      .upsert(
        { business_id: biz.id, blocks: nextBlocks as unknown as Json },
        { onConflict: "business_id" },
      );

    if (!error) {
      await supabase.from("page_edit_history").insert({
        business_id: biz.id,
        prompt: historyPrompt,
        blocks_before: blocksBefore as unknown as Json,
        blocks_after: nextBlocks as unknown as Json,
      });
      savedBlocksRef.current = nextBlocks;
      setBlocks(nextBlocks);
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["page-layout", biz.id] });
    return true;
  };

  const save = async () => {
    if (!biz) return;
    for (const b of blocks) {
      if (b.type === "hero" && !b.config.heading.trim())
        return toast.error("Every hero block needs a heading.");
      if (b.type === "about" && !b.config.bio.trim())
        return toast.error("Every about block needs a bio.");
      if (b.type === "testimonial" && (!b.config.quote.trim() || !b.config.name.trim()))
        return toast.error("Every testimonial needs a quote and a name.");
    }
    if (await persist(blocks, null)) toast.success("Page layout saved");
  };

  // AI-assisted editing — the primary editing flow. The manual block editor
  // below is secondary and collapsed by default.
  const [manualOpen, setManualOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<PageBlock[] | null>(null);
  const [aiBaseline, setAiBaseline] = useState<PageBlock[] | null>(null);
  const [aiBeforeImage, setAiBeforeImage] = useState<string | null>(null);
  const [aiAfterImage, setAiAfterImage] = useState<string | null>(null);

  const runAiSuggest = async () => {
    if (!biz || !aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/page-ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ businessId: biz.id, blocks, prompt: aiPrompt }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Could not generate a suggestion");
      const data = (await res.json()) as {
        blocks: PageBlock[];
        beforeImage: string | null;
        afterImage: string | null;
      };
      setAiBaseline(blocks);
      setAiSuggestion(data.blocks);
      setAiBeforeImage(data.beforeImage);
      setAiAfterImage(data.afterImage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate a suggestion");
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAiSuggestion = async () => {
    if (!aiSuggestion) return;
    const ok = await persist(aiSuggestion, aiPrompt, aiBaseline ?? savedBlocksRef.current);
    if (ok) {
      toast.success("Page layout updated");
      setAiSuggestion(null);
      setAiBaseline(null);
      setAiBeforeImage(null);
      setAiAfterImage(null);
      setAiPrompt("");
    }
  };

  const rejectAiSuggestion = () => {
    setAiSuggestion(null);
    setAiBaseline(null);
    setAiBeforeImage(null);
    setAiAfterImage(null);
  };

  // Version history
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: history, isLoading: historyLoading } = useQuery({
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
    const ok = await persist(restored, label, blocks);
    if (ok) {
      toast.success("Restored previous version");
      setHistoryOpen(false);
      qc.invalidateQueries({ queryKey: ["page-edit-history", biz?.id] });
    }
  };

  if (!biz) return null;

  return (
    <div className="p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="Public page"
        title="Page builder"
        subtitle="Tell Claude what you want changed, review a visual before/after, and approve it."
        action={
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1.5" /> History
          </Button>
        }
      />

      <div className="rounded-2xl border-2 border-primary/15 bg-card p-6 sm:p-8 mb-8 shadow-soft">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl">Describe what you want to change</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Nothing is saved until you review a before/after and approve it.
        </p>
        <Textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="e.g. Make the hero punchier, add a gallery of my work, and feature Jen and Leanne"
          rows={3}
          className="text-base"
        />
        <div className="flex justify-end mt-3">
          <Button size="lg" onClick={runAiSuggest} disabled={aiLoading || !aiPrompt.trim()}>
            {aiLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Suggest changes
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-xl border border-dashed bg-secondary/20 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors mb-4"
      >
        <span className="inline-flex items-center gap-2">
          <Pencil className="h-4 w-4" /> Edit manually
          <span className="text-xs font-normal text-muted-foreground">
            ({blocks.length} block{blocks.length === 1 ? "" : "s"})
          </span>
        </span>
        {manualOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {manualOpen && (
        <div>
          <div className="flex items-center justify-end gap-2 mb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-1.5" /> Add block
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {BLOCK_TYPES.map((t) => (
                  <DropdownMenuItem key={t} onClick={() => addBlock(t)}>
                    {BLOCK_LABELS[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : blocks.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/40 p-16 text-center">
              <LayoutTemplate className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-3">
                No blocks yet. Add one to start building your page.
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={blocks.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {blocks.map((b, i) => (
                    <BlockCard
                      key={b.id}
                      block={b}
                      index={i}
                      total={blocks.length}
                      businessId={biz.id}
                      onChange={(config) => updateBlockConfig(b.id, config)}
                      onRemove={() => removeBlock(b.id)}
                      onMoveUp={() => moveBlock(b.id, -1)}
                      onMoveDown={() => moveBlock(b.id, 1)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      <Dialog open={!!aiSuggestion} onOpenChange={(open) => !open && rejectAiSuggestion()}>
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
              {aiBeforeImage ? (
                <img
                  src={aiBeforeImage}
                  alt="Current page"
                  className="w-full rounded-xl border object-cover object-top"
                />
              ) : (
                <div className="space-y-4 rounded-xl border border-dashed bg-secondary/10 p-3">
                  {blocks.length === 0 && (
                    <p className="text-sm text-muted-foreground p-4">No blocks.</p>
                  )}
                  {blocks.map((b) => (
                    <BlockRenderer key={b.id} block={b} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Suggested
              </div>
              {aiAfterImage ? (
                <img
                  src={aiAfterImage}
                  alt="Suggested page"
                  className="w-full rounded-xl border object-cover object-top"
                />
              ) : (
                <div className="space-y-4 rounded-xl border bg-secondary/10 p-3">
                  {(aiSuggestion ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground p-4">No blocks.</p>
                  )}
                  {(aiSuggestion ?? []).map((b) => (
                    <BlockRenderer key={b.id} block={b} />
                  ))}
                </div>
              )}
            </div>
          </div>
          {!aiBeforeImage && !aiAfterImage && (
            <p className="text-xs text-muted-foreground text-center">
              Live screenshots aren't available right now — showing a component preview instead.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={rejectAiSuggestion}>
              Keep current
            </Button>
            <Button onClick={acceptAiSuggestion} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Use this
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {!historyLoading && (!history || history.length === 0) && (
              <p className="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
            )}
            {history?.map((entry) => (
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

function BlockCard({
  block,
  index,
  total,
  businessId,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: PageBlock;
  index: number;
  total: number;
  businessId: string;
  onChange: (config: PageBlock["config"]) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          {...attributes}
          {...listeners}
          className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
          {BLOCK_LABELS[block.type]}
        </span>
        <span className="text-xs text-muted-foreground">#{index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Remove block"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
            title="Remove this block?"
            description="This only changes your draft — save to apply it to your live page."
            confirmLabel="Remove"
            onConfirm={onRemove}
          />
        </div>
      </div>

      {block.type === "hero" && <HeroFields config={block.config} onChange={onChange} />}
      {block.type === "about" && <AboutFields config={block.config} onChange={onChange} />}
      {block.type === "gallery" && <GalleryFields config={block.config} onChange={onChange} />}
      {block.type === "staff-spotlight" && (
        <StaffSpotlightFields config={block.config} onChange={onChange} businessId={businessId} />
      )}
      {block.type === "testimonial" && (
        <TestimonialFields config={block.config} onChange={onChange} />
      )}
      {block.type === "hours-location" && (
        <HoursLocationFields config={block.config} onChange={onChange} />
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</Label>
  );
}

function HeroFields({
  config,
  onChange,
}: {
  config: HeroConfig;
  onChange: (c: HeroConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Variant</FieldLabel>
        <Select
          value={config.variant}
          onValueChange={(v) => onChange({ ...config, variant: v as HeroConfig["variant"] })}
        >
          <SelectTrigger className="mt-1.5 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text-only">Text only</SelectItem>
            <SelectItem value="text-photo">Text + photo</SelectItem>
            <SelectItem value="split-screen">Split screen</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Eyebrow</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.eyebrow ?? ""}
            onChange={(e) => onChange({ ...config, eyebrow: e.target.value })}
            placeholder="Book online"
          />
        </div>
        <div>
          <FieldLabel>Heading</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.heading}
            onChange={(e) => onChange({ ...config, heading: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <FieldLabel>Subheading</FieldLabel>
        <Textarea
          className="mt-1.5"
          rows={2}
          value={config.subheading ?? ""}
          onChange={(e) => onChange({ ...config, subheading: e.target.value })}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Button label</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.ctaLabel ?? ""}
            onChange={(e) => onChange({ ...config, ctaLabel: e.target.value })}
            placeholder="Book now"
          />
        </div>
        <div>
          <FieldLabel>Button link</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.ctaHref ?? ""}
            onChange={(e) => onChange({ ...config, ctaHref: e.target.value })}
            placeholder="#services"
          />
        </div>
      </div>
      {config.variant !== "text-only" && (
        <div>
          <FieldLabel>Photo URL</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.photoUrl ?? ""}
            onChange={(e) => onChange({ ...config, photoUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      )}
      <div>
        <FieldLabel>Brand colour</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.brandColor ?? ""}
          onChange={(e) => onChange({ ...config, brandColor: e.target.value })}
          placeholder="#8E2A38"
        />
      </div>
    </div>
  );
}

function AboutFields({
  config,
  onChange,
}: {
  config: AboutConfig;
  onChange: (c: AboutConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Heading</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.heading ?? ""}
          onChange={(e) => onChange({ ...config, heading: e.target.value })}
          placeholder="Our story"
        />
      </div>
      <div>
        <FieldLabel>Bio</FieldLabel>
        <Textarea
          className="mt-1.5"
          rows={4}
          value={config.bio}
          onChange={(e) => onChange({ ...config, bio: e.target.value })}
        />
      </div>
      <div>
        <FieldLabel>Photo URL</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.photoUrl ?? ""}
          onChange={(e) => onChange({ ...config, photoUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

function GalleryFields({
  config,
  onChange,
}: {
  config: GalleryConfig;
  onChange: (c: GalleryConfig) => void;
}) {
  const updatePhoto = (i: number, patch: Partial<{ url: string; alt: string }>) => {
    const photos = config.photos.map((p, j) => (j === i ? { ...p, ...patch } : p));
    onChange({ ...config, photos });
  };
  const addPhoto = () => onChange({ ...config, photos: [...config.photos, { url: "", alt: "" }] });
  const removePhoto = (i: number) =>
    onChange({ ...config, photos: config.photos.filter((_, j) => j !== i) });

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Layout</FieldLabel>
        <Select
          value={String(config.layout)}
          onValueChange={(v) => onChange({ ...config, layout: Number(v) as 3 | 6 | 9 })}
        >
          <SelectTrigger className="mt-1.5 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 photos</SelectItem>
            <SelectItem value="6">6 photos</SelectItem>
            <SelectItem value="9">9 photos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        {config.photos.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <Input
              className="flex-1"
              value={p.url}
              onChange={(e) => updatePhoto(i, { url: e.target.value })}
              placeholder="Photo URL"
            />
            <Input
              className="w-40"
              value={p.alt ?? ""}
              onChange={(e) => updatePhoto(i, { alt: e.target.value })}
              placeholder="Alt text"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removePhoto(i)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addPhoto}
        disabled={config.photos.length >= config.layout}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add photo
      </Button>
    </div>
  );
}

function StaffSpotlightFields({
  config,
  onChange,
  businessId,
}: {
  config: StaffSpotlightConfig;
  onChange: (c: StaffSpotlightConfig) => void;
  businessId: string;
}) {
  const { data: staff, isLoading } = useQuery({
    queryKey: ["page-builder-staff", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, role")
        .eq("business_id", businessId)
        .eq("bookable", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; role: string | null }[];
    },
  });

  const toggle = (id: string) => {
    const current = config.staffIds ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...config, staffIds: next.length ? next : undefined });
  };

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Heading</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.heading ?? ""}
          onChange={(e) => onChange({ ...config, heading: e.target.value })}
          placeholder="Meet the team"
        />
      </div>
      <div>
        <FieldLabel>Staff shown</FieldLabel>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Leave none selected to show every bookable staff member.
        </p>
        {isLoading && <Skeleton className="h-9 w-full" />}
        {!isLoading && (!staff || staff.length === 0) && (
          <p className="text-sm text-muted-foreground">No staff yet. Add some on the Staff page.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {staff?.map((s) => {
            const on = (config.staffIds ?? []).includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  on
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "bg-card hover:bg-secondary/60"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TestimonialFields({
  config,
  onChange,
}: {
  config: TestimonialConfig;
  onChange: (c: TestimonialConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Quote</FieldLabel>
        <Textarea
          className="mt-1.5"
          rows={3}
          value={config.quote}
          onChange={(e) => onChange({ ...config, quote: e.target.value })}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
          />
        </div>
        <div>
          <FieldLabel>Role</FieldLabel>
          <Input
            className="mt-1.5"
            value={config.role ?? ""}
            onChange={(e) => onChange({ ...config, role: e.target.value })}
            placeholder="Regular customer"
          />
        </div>
      </div>
    </div>
  );
}

function HoursLocationFields({
  config,
  onChange,
}: {
  config: HoursLocationConfig;
  onChange: (c: HoursLocationConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Heading</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.heading ?? ""}
          onChange={(e) => onChange({ ...config, heading: e.target.value })}
          placeholder="Visit us"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Address, phone, and hours are pulled automatically from your business settings.
      </p>
    </div>
  );
}
