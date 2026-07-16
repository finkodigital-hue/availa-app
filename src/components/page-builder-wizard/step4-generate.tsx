import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { assembleInitialBlocks } from "@/lib/page-generation";
import type { PageBlock } from "@/components/page-blocks";

const STATUS_MESSAGES = [
  "Laying out your services…",
  "Applying your style…",
  "Adding the finishing touches…",
];

export function Step4Generate({
  businessId,
  businessName,
  onFinish,
}: {
  businessId: string;
  businessName: string;
  onFinish: (blocks: PageBlock[]) => Promise<boolean>;
}) {
  const { data: counts } = useQuery({
    queryKey: ["wizard-step4-counts", businessId],
    queryFn: async () => {
      const [servicesRes, staffRes] = await Promise.all([
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("active", true),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("bookable", true),
      ]);
      return { services: servicesRes.count ?? 0, staff: staffRes.count ?? 0 };
    },
  });

  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length), 900);
    return () => clearInterval(id);
  }, [generating]);

  const generate = async () => {
    setGenerating(true);
    setFailed(false);
    const blocks = assembleInitialBlocks({
      businessId,
      businessName,
      hasStaff: (counts?.staff ?? 0) > 0,
    });
    const ok = await onFinish(blocks);
    setGenerating(false);
    if (!ok) setFailed(true);
  };

  const skipBlank = async () => {
    setGenerating(true);
    const ok = await onFinish([]);
    setGenerating(false);
    if (!ok) setFailed(true);
  };

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl text-balance">
        Generate your <span className="italic text-primary">page</span>.
      </h1>
      <p className="text-sm text-muted-foreground mt-3">
        We'll build your booking page using your services, staff and your chosen style.
      </p>

      {counts && counts.services === 0 && (
        <div className="mt-5 rounded-xl border border-dashed bg-secondary/20 p-4 flex items-start gap-2.5 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          You haven't added services yet — your page will use placeholders you can replace.
        </div>
      )}

      {generating ? (
        <div className="mt-10 text-center py-6">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground mt-4">{STATUS_MESSAGES[statusIdx]}</p>
        </div>
      ) : failed ? (
        <div className="mt-8 space-y-2.5">
          <p className="text-sm text-destructive text-center">Something went wrong generating your page.</p>
          <Button className="w-full h-11" onClick={generate}>Try again</Button>
          <Button variant="ghost" className="w-full h-10 text-muted-foreground" onClick={skipBlank}>
            Skip and start from a blank page
          </Button>
        </div>
      ) : (
        <Button className="w-full h-11 mt-8 shadow-glow" onClick={generate}>
          <Sparkles className="h-4 w-4 mr-2" /> Generate my page
        </Button>
      )}
    </div>
  );
}
