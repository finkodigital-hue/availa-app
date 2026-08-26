import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  STOREFRONT_SECTION_LABELS,
  defaultStorefrontSettings,
  parseStorefrontSettings,
  type StorefrontSettings,
} from "@/lib/storefront";

export function StorefrontSettingsEditor({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StorefrontSettings>(defaultStorefrontSettings());
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["storefront-settings", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_layouts")
        .select("storefront_settings")
        .eq("business_id", businessId)
        .maybeSingle();
      if (error) throw error;
      return parseStorefrontSettings(data?.storefront_settings);
    },
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setDraft({ ...draft, sections });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("page_layouts").upsert(
      {
        business_id: businessId,
        storefront_settings: draft as unknown as Json,
      },
      { onConflict: "business_id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Storefront sections saved");
    qc.invalidateQueries({ queryKey: ["storefront-settings", businessId] });
  };

  if (isLoading) return <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {draft.sections.map((section, index) => (
          <div key={section.id} className="rounded-xl border bg-background p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{STOREFRONT_SECTION_LABELS[section.id]}</h3>
                  {section.id === "booking" && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Required
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Rename the heading, choose how much appears, and set its position.
                </p>
              </div>
              <Switch
                checked={section.visible}
                disabled={section.id === "booking"}
                onCheckedChange={(visible) =>
                  setDraft({
                    ...draft,
                    sections: draft.sections.map((item) =>
                      item.id === section.id ? { ...item, visible } : item,
                    ),
                  })
                }
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move section up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, 1)}
                  disabled={index === draft.sections.length - 1}
                  aria-label="Move section down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px]">
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Section heading
                </Label>
                <Input
                  className="mt-1.5"
                  value={section.heading}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((item) =>
                        item.id === section.id ? { ...item, heading: event.target.value } : item,
                      ),
                    })
                  }
                  placeholder="Leave blank for no heading"
                />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Items shown
                </Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  min={1}
                  max={section.id === "location" ? 7 : 12}
                  value={section.itemLimit}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((item) =>
                        item.id === section.id
                          ? { ...item, itemLimit: Math.max(1, Number(event.target.value) || 1) }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-background p-4 space-y-4">
        <div>
          <h3 className="text-sm font-medium">Review content</h3>
          <p className="text-xs text-muted-foreground">
            Add only genuine customer reviews. The review section stays hidden until at least one is
            added.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Overall score
            </Label>
            <Input
              className="mt-1.5"
              type="number"
              min="1"
              max="5"
              step="0.1"
              value={draft.reviewScore ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, reviewScore: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="5.0"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total review count
            </Label>
            <Input
              className="mt-1.5"
              type="number"
              min="0"
              value={draft.reviewCount ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, reviewCount: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="3653"
            />
          </div>
        </div>
        <div className="space-y-3">
          {draft.reviews.map((review, index) => (
            <div key={review.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-current" /> Review {index + 1}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      reviews: draft.reviews.filter((item) => item.id !== review.id),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={review.name}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reviews: draft.reviews.map((item) =>
                      item.id === review.id ? { ...item, name: e.target.value } : item,
                    ),
                  })
                }
                placeholder="Customer name"
              />
              <Textarea
                rows={2}
                value={review.quote}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reviews: draft.reviews.map((item) =>
                      item.id === review.id ? { ...item, quote: e.target.value } : item,
                    ),
                  })
                }
                placeholder="Their review"
              />
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setDraft({
              ...draft,
              reviews: [
                ...draft.reviews,
                { id: crypto.randomUUID(), name: "", quote: "", rating: 5 },
              ],
            })
          }
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add review
        </Button>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save storefront
        </Button>
      </div>
    </div>
  );
}
