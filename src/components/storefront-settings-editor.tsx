import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  STOREFRONT_SECTION_LABELS,
  defaultStorefrontSettings,
  parseStorefrontSettings,
  type StorefrontSectionId,
  type StorefrontSettings,
} from "@/lib/storefront";

export function StorefrontSettingsEditor({
  businessId,
  value,
  onChange,
  showSave = true,
}: {
  businessId: string;
  value?: StorefrontSettings;
  onChange?: (value: StorefrontSettings) => void;
  showSave?: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StorefrontSettings>(defaultStorefrontSettings());
  const [saving, setSaving] = useState(false);
  const [expandedSectionId, setExpandedSectionId] = useState<StorefrontSectionId | null>("booking");
  const { data, isLoading } = useQuery({
    queryKey: ["storefront-settings", businessId],
    enabled: value === undefined,
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
    if (value) setDraft(value);
    else if (data) setDraft(data);
  }, [data, value]);

  const updateDraft = (next: StorefrontSettings) => {
    setDraft(next);
    onChange?.(next);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updateDraft({ ...draft, sections });
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

  if (isLoading && value === undefined)
    return <div className="h-48 rounded-xl bg-secondary/50 animate-pulse" />;

  return (
    <div className="font-sans text-foreground">
      <div className="divide-y">
        {draft.sections.map((section, index) => (
          <div key={section.id} className="py-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-sans text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground">
                    {STOREFRONT_SECTION_LABELS[section.id]}
                  </h3>
                  {section.id === "booking" && (
                    <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Required
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[13px] leading-5 text-muted-foreground">
                  {section.heading || "No heading"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={section.visible}
                  disabled={section.id === "booking"}
                  onCheckedChange={(visible) =>
                    updateDraft({
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setExpandedSectionId((current) => (current === section.id ? null : section.id))
                  }
                  aria-label={`${expandedSectionId === section.id ? "Close" : "Edit"} ${STOREFRONT_SECTION_LABELS[section.id]}`}
                  aria-expanded={expandedSectionId === section.id}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      expandedSectionId === section.id ? "rotate-180" : ""
                    }`}
                  />
                </Button>
              </div>
            </div>
            {expandedSectionId === section.id && (
              <div className="grid gap-4 pt-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Section heading
                  </Label>
                  <Input
                    className="mt-1.5"
                    value={section.heading}
                    onChange={(event) =>
                      updateDraft({
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
                      updateDraft({
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
            )}
          </div>
        ))}
      </div>

      {showSave && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save storefront
          </Button>
        </div>
      )}
    </div>
  );
}
