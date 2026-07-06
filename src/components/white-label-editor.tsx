import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Globe, Crown, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { compressImage, signedUrl } from "@/lib/image";
import { toast } from "sonner";

export function WhiteLabelEditor({ business }: { business: any }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [favPreview, setFavPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;
    setF(business);
    if (business.favicon_url) signedUrl(business.favicon_url).then(setFavPreview).catch(() => {});
    if (business.email_logo_url) signedUrl(business.email_logo_url).then(setLogoPreview).catch(() => {});
  }, [business?.id]);

  const premium = (f.plan ?? "free") !== "free";

  const upload = async (kind: "favicon" | "email-logo", file: File) => {
    try {
      const blob = await compressImage(file, 512, 0.9);
      const path = `${business.id}/whitelabel/${kind}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("business-assets").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      if (kind === "favicon") setF((p: any) => ({ ...p, favicon_url: path }));
      else setF((p: any) => ({ ...p, email_logo_url: path }));
      const url = await signedUrl(path);
      if (kind === "favicon") setFavPreview(url); else setLogoPreview(url);
      toast.success("Uploaded");
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("businesses").update({
      custom_domain: f.custom_domain || null,
      favicon_url: f.favicon_url || null,
      browser_title: f.browser_title || null,
      email_logo_url: f.email_logo_url || null,
      email_footer: f.email_footer || null,
      hide_powered_by: premium ? !!f.hide_powered_by : false,
    }).eq("id", business.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("White-label saved");
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Custom domain</span>
        </div>
        <Input
          placeholder="book.yourdomain.com"
          value={f.custom_domain ?? ""}
          onChange={(e) => setF({ ...f, custom_domain: e.target.value })}
          className="h-10"
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Point a CNAME from <span className="font-mono">{f.custom_domain || "book.yourdomain.com"}</span> to <span className="font-mono">cname.luma.app</span>. SSL is provisioned automatically.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-background p-4">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Favicon</Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg border bg-muted grid place-items-center overflow-hidden">
              {favPreview ? <img src={favPreview} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] text-muted-foreground">None</span>}
            </div>
            <label className="inline-flex items-center justify-center h-9 px-3 rounded-md border bg-card text-xs cursor-pointer hover:bg-secondary/50 transition-colors">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && upload("favicon", e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Browser title</Label>
          <Input value={f.browser_title ?? ""} onChange={(e) => setF({ ...f, browser_title: e.target.value })} placeholder={`Book with ${business?.name}`} className="mt-2 h-10" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-background p-4">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email logo</Label>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-12 w-24 rounded-lg border bg-muted grid place-items-center overflow-hidden">
              {logoPreview ? <img src={logoPreview} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">None</span>}
            </div>
            <label className="inline-flex items-center justify-center h-9 px-3 rounded-md border bg-card text-xs cursor-pointer hover:bg-secondary/50 transition-colors">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && upload("email-logo", e.target.files[0])} />
            </label>
          </div>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email footer</Label>
          <Textarea value={f.email_footer ?? ""} onChange={(e) => setF({ ...f, email_footer: e.target.value })} placeholder="Address, contact, unsubscribe note…" className="mt-2" rows={3} />
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${premium ? "" : "opacity-70"}`}>
        <div className="flex items-start gap-3">
          <Crown className="h-4 w-4 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Remove "Powered by Bookzenvo"</span>
              {!premium && <Badge variant="secondary" className="text-[10px]">Premium</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hide Bookzenvo branding across your booking page, customer portal and emails.
            </p>
          </div>
          <Switch checked={!!f.hide_powered_by && premium} onCheckedChange={(v) => setF({ ...f, hide_powered_by: v })} disabled={!premium} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save white-label
        </Button>
      </div>
    </div>
  );
}
