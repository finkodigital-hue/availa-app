import { useEffect, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Loader2, GripVertical, Image as ImageIcon } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { compressImage, signedUrl } from "@/lib/image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

type Media = { id: string; kind: string; path: string; sort_order: number };

const KINDS: { key: "cover" | "logo" | "interior" | "team" | "portfolio"; label: string; description: string; single: boolean }[] = [
  { key: "cover", label: "Cover photo", description: "Wide hero image at the top of your booking page.", single: true },
  { key: "logo", label: "Logo", description: "Square logo shown in the header.", single: true },
  { key: "interior", label: "Interior", description: "Photos of your space.", single: false },
  { key: "team", label: "Team", description: "Group photos of your team.", single: false },
  { key: "portfolio", label: "Portfolio", description: "Examples of your work.", single: false },
];

export function GalleryManager({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const { data: media, isLoading } = useQuery({
    queryKey: ["business-media", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_media").select("*").eq("business_id", businessId).order("kind").order("sort_order");
      if (error) throw error;
      return data as Media[];
    },
  });

  const byKind = (k: string) => (media ?? []).filter((m) => m.kind === k);

  const handleUpload = async (kind: string, file: File) => {
    try {
      const blob = await compressImage(file);
      const ext = "jpg";
      const path = `${businessId}/gallery/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("business-assets").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const def = KINDS.find((k) => k.key === kind);
      if (def?.single) {
        // remove existing of same kind
        const existing = byKind(kind);
        for (const e of existing) {
          await supabase.storage.from("business-assets").remove([e.path]);
          await supabase.from("business_media").delete().eq("id", e.id);
        }
      }
      const order = byKind(kind).length;
      const { error } = await supabase.from("business_media").insert({ business_id: businessId, kind, path, sort_order: order });
      if (error) throw error;
      toast.success("Photo uploaded");
      qc.invalidateQueries({ queryKey: ["business-media", businessId] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    }
  };

  const removeOne = async (m: Media) => {
    await supabase.storage.from("business-assets").remove([m.path]);
    await supabase.from("business_media").delete().eq("id", m.id);
    toast.success("Photo removed");
    qc.invalidateQueries({ queryKey: ["business-media", businessId] });
  };

  const reorder = async (kind: string, ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      await supabase.from("business_media").update({ sort_order: i }).eq("id", ids[i]);
    }
    qc.invalidateQueries({ queryKey: ["business-media", businessId] });
  };

  if (isLoading) return <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;

  return (
    <div className="space-y-6">
      {KINDS.map((k) => (
        <GallerySection
          key={k.key}
          def={k}
          items={byKind(k.key)}
          onUpload={(f) => handleUpload(k.key, f)}
          onRemove={removeOne}
          onReorder={(ids) => reorder(k.key, ids)}
        />
      ))}
    </div>
  );
}

function GallerySection({
  def, items, onUpload, onRemove, onReorder,
}: {
  def: { key: string; label: string; description: string; single: boolean };
  items: Media[];
  onUpload: (f: File) => Promise<void>;
  onRemove: (m: Media) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(items);
  useEffect(() => setList(items), [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    await onUpload(file);
    setBusy(false);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = list.findIndex((m) => m.id === active.id);
    const newIdx = list.findIndex((m) => m.id === over.id);
    const next = arrayMove(list, oldIdx, newIdx);
    setList(next);
    await onReorder(next.map((m) => m.id));
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-medium text-sm">{def.label}</h3>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
        {(!def.single || list.length === 0) && (
          <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs hover:bg-secondary/40 cursor-pointer">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
          </label>
        )}
      </div>
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground">
          <ImageIcon className="h-5 w-5 mx-auto mb-1.5 opacity-50" />
          No photos yet
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {list.map((m) => (
                <SortablePhoto key={m.id} media={m} onRemove={() => onRemove(m)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortablePhoto({ media, onRemove }: { media: Media; onRemove: () => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrl(media.path).then(setUrl).catch(() => setUrl(null)); }, [media.path]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="relative group rounded-lg overflow-hidden border bg-secondary aspect-square"
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Skeleton className="w-full h-full" />}
      <button
        {...attributes} {...listeners}
        className="absolute top-1 left-1 h-7 w-7 grid place-items-center rounded bg-background/80 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
        aria-label="Reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <ConfirmDialog
        trigger={
          <button
            className="absolute top-1 right-1 h-7 w-7 grid place-items-center rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        }
        title="Delete photo?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onRemove}
      />
    </div>
  );
}
