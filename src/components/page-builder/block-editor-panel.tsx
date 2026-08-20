import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  BLOCK_LABELS,
  type PageBlock,
  type HeroConfig,
  type AboutConfig,
  type GalleryConfig,
  type ServicesListConfig,
  type StaffSpotlightConfig,
  type TestimonialConfig,
  type HoursLocationConfig,
} from "@/components/page-blocks";

// The left-panel editor for whichever block is selected on the canvas.
// Field components are unchanged from the old inline manual editor — this
// is a relocation, not a rewrite; only the container (a canvas selection
// instead of an accordion list) changed.
export function BlockEditorPanel({
  block,
  businessId,
  onChange,
  onRemove,
  onDeselect,
}: {
  block: PageBlock;
  businessId: string;
  onChange: (config: PageBlock["config"]) => void;
  onRemove: () => void;
  onDeselect: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
            {BLOCK_LABELS[block.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDeselect}
            aria-label="Deselect block"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {block.type === "hero" && <HeroFields config={block.config} onChange={onChange} />}
      {block.type === "about" && <AboutFields config={block.config} onChange={onChange} />}
      {block.type === "gallery" && <GalleryFields config={block.config} onChange={onChange} />}
      {block.type === "services-list" && (
        <ServicesListFields config={block.config} onChange={onChange} />
      )}
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
          <SelectTrigger className="mt-1.5 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text-only">Text only</SelectItem>
            <SelectItem value="text-photo">Text + photo</SelectItem>
            <SelectItem value="split-screen">Split screen</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
      <div>
        <FieldLabel>Subheading</FieldLabel>
        <Textarea
          className="mt-1.5"
          rows={2}
          value={config.subheading ?? ""}
          onChange={(e) => onChange({ ...config, subheading: e.target.value })}
        />
      </div>
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
          <div key={i} className="space-y-1.5 rounded-lg border p-2">
            <Input
              value={p.url}
              onChange={(e) => updatePhoto(i, { url: e.target.value })}
              placeholder="Photo URL"
            />
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
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
  );
}

function ServicesListFields({
  config,
  onChange,
}: {
  config: ServicesListConfig;
  onChange: (c: ServicesListConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Heading</FieldLabel>
        <Input
          className="mt-1.5"
          value={config.heading ?? ""}
          onChange={(e) => onChange({ ...config, heading: e.target.value })}
          placeholder="Our services"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Services are pulled automatically from your active service list.
      </p>
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
