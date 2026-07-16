import { useRef, useState } from "react";
import { Building2, Scissors, Flower2, Sparkles, Gem, Store, Upload, Loader2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadPublicAsset } from "@/lib/image";
import type { BusinessType } from "@/lib/business-type";
import { toast } from "sonner";

const TYPE_CARDS: { id: BusinessType; label: string; icon: any }[] = [
  { id: "salon", label: "Salon", icon: Building2 },
  { id: "barber", label: "Barber", icon: Scissors },
  { id: "spa", label: "Spa", icon: Flower2 },
  { id: "nails", label: "Nails", icon: Sparkles },
  { id: "beauty", label: "Beauty", icon: Gem },
  { id: "other", label: "Other", icon: Store },
];

export function Step1BusinessInfo({
  businessId,
  businessType,
  instagramOrWebsite,
  logoUrl,
  onChange,
  onContinue,
}: {
  businessId: string;
  businessType: BusinessType | null;
  instagramOrWebsite: string;
  logoUrl: string | null;
  onChange: (patch: { businessType?: BusinessType; instagramOrWebsite?: string; logoUrl?: string | null }) => void;
  onContinue: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB.");
      return;
    }
    setUploading(true);
    try {
      // TODO v2: palette extraction from logo
      const url = await uploadPublicAsset(businessId, "logo", file);
      onChange({ logoUrl: url });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl sm:text-4xl text-balance">
        Tell us about your <span className="italic text-primary">business</span>.
      </h1>
      <p className="text-sm text-muted-foreground mt-3">
        This helps us suggest a starting style — you can change everything later.
      </p>

      <div className="grid grid-cols-3 gap-2.5 mt-8">
        {TYPE_CARDS.map(({ id, label, icon: Icon }) => {
          const active = businessType === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ businessType: id })}
              className={cn(
                "rounded-xl border p-4 flex flex-col items-center gap-2 text-xs font-medium transition-colors",
                active ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-secondary/50",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Instagram handle or website <span className="normal-case text-muted-foreground/60">(optional)</span>
        </Label>
        <Input
          className="mt-1.5 h-11"
          value={instagramOrWebsite}
          onChange={(e) => onChange({ instagramOrWebsite: e.target.value })}
          placeholder="@yourbusiness or yourbusiness.com"
        />
      </div>

      <div className="mt-6">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Logo <span className="normal-case text-muted-foreground/60">(optional)</span>
        </Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-1.5 w-full rounded-xl border border-dashed p-5 flex items-center gap-4 hover:bg-secondary/30 transition-colors"
        >
          <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary grid place-items-center overflow-hidden">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="text-left text-sm text-muted-foreground">
            {logoUrl ? (
              <span className="inline-flex items-center gap-1.5 text-foreground"><Check className="h-3.5 w-3.5" /> Logo uploaded</span>
            ) : (
              "Tap to upload a PNG, JPG or SVG (max 2MB)"
            )}
          </div>
        </button>
      </div>

      <Button className="w-full h-11 mt-8 shadow-glow" disabled={!businessType} onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
