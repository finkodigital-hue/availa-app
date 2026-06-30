import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Monitor, Smartphone, ExternalLink, RotateCw } from "lucide-react";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/preview")({
  component: PreviewPage,
});

function PreviewPage() {
  const { data: biz, isLoading } = useMyBusiness();
  const [device, setDevice] = useState<"mobile" | "desktop">("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  if (isLoading) return <div className="p-8"><Skeleton className="h-[600px]" /></div>;
  if (!biz?.slug) return <div className="p-8 text-muted-foreground">Finish onboarding to preview your booking page.</div>;

  const src = `/book/${biz.slug}?preview=1&v=${reloadKey}`;
  const w = device === "mobile" ? 393 : 1280;
  const h = device === "mobile" ? 780 : 820;

  return (
    <div className="p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="Preview"
        title="Booking page preview"
        subtitle="Exactly what customers see. Changes you make in Settings update instantly here."
        action={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              <button onClick={() => setDevice("mobile")} className={`px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1.5 ${device === "mobile" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                <Smartphone className="h-3.5 w-3.5" /> Mobile
              </button>
              <button onClick={() => setDevice("desktop")} className={`px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1.5 ${device === "desktop" ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                <Monitor className="h-3.5 w-3.5" /> Desktop
              </button>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setReloadKey((n) => n + 1)} aria-label="Refresh">
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button asChild variant="outline" className="h-9">
              <a href={`/book/${biz.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open live
              </a>
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border bg-secondary/40 p-4 sm:p-6 flex justify-center overflow-x-auto">
        <div
          className="bg-background rounded-xl shadow-elegant overflow-hidden transition-all"
          style={{ width: w, height: h, maxWidth: "100%" }}
        >
          <iframe
            key={reloadKey + device}
            title="Booking page preview"
            src={src}
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
