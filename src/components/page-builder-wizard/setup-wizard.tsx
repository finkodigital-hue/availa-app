import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { type PageBlock } from "@/components/page-blocks";
import { parseTheme, type Theme } from "@/lib/theme";
import { defaultPresetForBusinessType, themeFromPreset } from "@/lib/theme-presets";
import { assembleInitialBlocks } from "@/lib/page-generation";
import type { BusinessType } from "@/lib/business-type";
import { toast } from "sonner";
import { WizardShell } from "./wizard-shell";
import { Step1BusinessInfo } from "./step1-business-info";
import { Step2PickVibe } from "./step2-pick-vibe";
import { Step3MakeItYours } from "./step3-make-it-yours";
import { Step4Generate } from "./step4-generate";

type Business = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  page_theme: unknown;
  business_type: string | null;
  instagram: string | null;
  website: string | null;
};

function looksLikeUrl(v: string) {
  return /\.[a-z]{2,}/i.test(v) || /^https?:\/\//i.test(v);
}

export function SetupWizard({ business, onComplete }: { business: Business; onComplete: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [businessType, setBusinessType] = useState<BusinessType | null>(
    (business.business_type as BusinessType | null) ?? null,
  );
  const [instagramOrWebsite, setInstagramOrWebsite] = useState(business.instagram ?? business.website ?? "");
  const [theme, setTheme] = useState<Theme>(() => parseTheme(business.page_theme));

  // What the live page preview (Steps 2-3) shows: the business's actual
  // saved page if it already has one (e.g. re-running the wizard), otherwise
  // the same deterministic starter blocks Step 4 would generate — so the
  // preview always reflects real content, never a static mock.
  const { data: previewBlocks } = useQuery({
    queryKey: ["wizard-preview-blocks", business.id],
    queryFn: async () => {
      const [{ data: layout }, staffRes] = await Promise.all([
        supabase.from("page_layouts").select("blocks").eq("business_id", business.id).maybeSingle(),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", business.id).eq("bookable", true),
      ]);
      const existing = ((layout?.blocks as unknown as PageBlock[]) ?? []).filter((b) => b && b.type);
      if (existing.length > 0) return existing;
      return assembleInitialBlocks({
        businessId: business.id,
        businessName: business.name,
        hasStaff: (staffRes.count ?? 0) > 0,
      });
    },
  });

  const autosave = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("businesses").update(patch as any).eq("id", business.id);
    if (error) toast.error(error.message);
  };

  const goStep2 = async () => {
    const trimmed = instagramOrWebsite.trim();
    const isUrl = trimmed.length > 0 && looksLikeUrl(trimmed);
    await autosave({
      business_type: businessType,
      instagram: trimmed.length > 0 && !isUrl ? (trimmed.startsWith("@") ? trimmed : `@${trimmed}`) : null,
      website: isUrl ? trimmed : null,
      page_theme: { ...theme, logoUrl: theme.logoUrl } as unknown as Json,
    });
    // Pre-highlight (and apply, until the user picks otherwise in Step 2) the
    // default preset for this business type.
    if (theme.preset === "clean_minimal" && businessType) {
      setTheme(themeFromPreset(defaultPresetForBusinessType(businessType), theme));
    }
    setStep(2);
  };

  const goStep3 = async () => {
    await autosave({ page_theme: theme as unknown as Json });
    setStep(3);
  };

  const goStep4 = async () => {
    await autosave({ page_theme: theme as unknown as Json });
    setStep(4);
  };

  const finish = async (blocks: PageBlock[]): Promise<boolean> => {
    const nextTheme: Theme = { ...theme, updatedAt: new Date().toISOString() };
    const [themeRes, layoutRes] = await Promise.all([
      supabase.from("businesses").update({ page_theme: nextTheme as unknown as Json, wizard_completed: true }).eq("id", business.id),
      supabase.from("page_layouts").upsert({ business_id: business.id, blocks: blocks as unknown as Json }, { onConflict: "business_id" }),
    ]);
    if (themeRes.error || layoutRes.error) {
      toast.error(themeRes.error?.message ?? layoutRes.error?.message ?? "Could not save your page");
      return false;
    }
    qc.invalidateQueries({ queryKey: ["my-business"] });
    qc.invalidateQueries({ queryKey: ["page-layout", business.id] });
    onComplete();
    return true;
  };

  return (
    <WizardShell step={step} totalSteps={4} onBack={step > 1 ? () => setStep((s) => (s - 1) as 1 | 2 | 3) : undefined}>
      {step === 1 && (
        <Step1BusinessInfo
          businessId={business.id}
          businessType={businessType}
          instagramOrWebsite={instagramOrWebsite}
          logoUrl={theme.logoUrl}
          onChange={(patch) => {
            if (patch.businessType !== undefined) setBusinessType(patch.businessType);
            if (patch.instagramOrWebsite !== undefined) setInstagramOrWebsite(patch.instagramOrWebsite);
            if (patch.logoUrl !== undefined) setTheme((t) => ({ ...t, logoUrl: patch.logoUrl! }));
          }}
          onContinue={goStep2}
        />
      )}
      {step === 2 && (
        <Step2PickVibe
          theme={theme}
          business={business}
          previewBlocks={previewBlocks ?? []}
          onChange={setTheme}
          onContinue={goStep3}
        />
      )}
      {step === 3 && (
        <Step3MakeItYours
          theme={theme}
          business={business}
          previewBlocks={previewBlocks ?? []}
          onChange={setTheme}
          onContinue={goStep4}
        />
      )}
      {step === 4 && (
        <Step4Generate businessId={business.id} businessName={business.name} onFinish={finish} />
      )}
    </WizardShell>
  );
}
