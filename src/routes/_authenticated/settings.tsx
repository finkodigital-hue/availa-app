import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, Loader2, ImageIcon, Palette, FileText, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";
import { GalleryManager } from "@/components/gallery-manager";
import { BrandingEditor } from "@/components/branding-editor";
import { PageContentEditor } from "@/components/page-content-editor";
import { WhiteLabelEditor } from "@/components/white-label-editor";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: biz } = useMyBusiness();

  if (!biz) return <div className="p-8"><Skeleton className="h-[400px]" /></div>;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-4xl">
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Customise your brand, booking page and business details." />

      <Tabs defaultValue="profile" className="space-y-5">
        <TabsList className="flex flex-wrap h-auto bg-card border p-1">
          <TabsTrigger value="profile"><Building2 className="h-3.5 w-3.5 mr-1.5" /> Business</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-3.5 w-3.5 mr-1.5" /> Hours</TabsTrigger>
          <TabsTrigger value="branding"><Palette className="h-3.5 w-3.5 mr-1.5" /> Branding</TabsTrigger>
          <TabsTrigger value="gallery"><ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Gallery</TabsTrigger>
          <TabsTrigger value="page"><FileText className="h-3.5 w-3.5 mr-1.5" /> Page content</TabsTrigger>
          <TabsTrigger value="whitelabel"><Crown className="h-3.5 w-3.5 mr-1.5" /> White-label</TabsTrigger>
        </TabsList>

        <TabsContent value="profile"><Section><ProfileEditor biz={biz} /></Section></TabsContent>
        <TabsContent value="hours"><Section><HoursEditor biz={biz} /></Section></TabsContent>
        <TabsContent value="branding"><Section><BrandingEditor business={biz} /></Section></TabsContent>
        <TabsContent value="gallery"><Section><GalleryManager businessId={biz.id} /></Section></TabsContent>
        <TabsContent value="page"><Section><PageContentEditor business={biz} /></Section></TabsContent>
        <TabsContent value="whitelabel"><Section><WhiteLabelEditor business={biz} /></Section></TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-soft animate-rise">{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ProfileEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(biz);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(biz); }, [biz?.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("businesses").update({
      name: form.name, description: form.description,
      address: form.address, phone: form.phone, email: form.email, website: form.website,
      timezone: form.timezone,
      instagram: form.instagram, facebook: form.facebook, tiktok: form.tiktok, twitter: form.twitter,
    }).eq("id", biz.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" /></Field>
        <Field label="Timezone"><Input value={form.timezone ?? ""} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="h-10" /></Field>
        <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10" /></Field>
        <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" /></Field>
        <Field label="Website"><Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} className="h-10" placeholder="https://" /></Field>
        <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-10" /></Field>
      </div>
      <Field label="Description"><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A short pitch for your booking page" /></Field>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Instagram"><Input value={form.instagram ?? ""} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-10" placeholder="@handle" /></Field>
        <Field label="Facebook"><Input value={form.facebook ?? ""} onChange={(e) => setForm({ ...form, facebook: e.target.value })} className="h-10" /></Field>
        <Field label="TikTok"><Input value={form.tiktok ?? ""} onChange={(e) => setForm({ ...form, tiktok: e.target.value })} className="h-10" placeholder="@handle" /></Field>
        <Field label="Twitter"><Input value={form.twitter ?? ""} onChange={(e) => setForm({ ...form, twitter: e.target.value })} className="h-10" /></Field>
      </div>
      <div className="pt-1 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}

function HoursEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const { data: hours, isLoading } = useQuery({
    queryKey: ["business-hours", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*").eq("business_id", biz.id).order("weekday");
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // Always render 7 rows, even if no rows exist yet — saving will upsert.
    const byDay = new Map<number, any>((hours ?? []).map((r: any) => [r.weekday, r]));
    setForm(
      Array.from({ length: 7 }, (_, w) =>
        byDay.get(w) ?? {
          business_id: biz.id,
          weekday: w,
          open_time: w === 0 ? null : "09:00",
          close_time: w === 0 ? null : "18:00",
          closed: w === 0,
        },
      ),
    );
  }, [hours, biz.id]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = form.map((h) => ({
        id: h.id,
        business_id: biz.id,
        weekday: h.weekday,
        open_time: h.closed ? null : (h.open_time || "09:00"),
        close_time: h.closed ? null : (h.close_time || "18:00"),
        closed: !!h.closed,
      }));
      const { error } = await supabase.from("business_hours").upsert(payload, { onConflict: "business_id,weekday" });
      if (error) throw error;
      toast.success("Hours saved");
      qc.invalidateQueries({ queryKey: ["business-hours"] });
      qc.invalidateQueries({ queryKey: ["slots-day"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally { setSaving(false); }
  };


  if (isLoading) return <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {form.map((h, i) => (
          <div key={h.weekday} className={`grid grid-cols-[80px_1fr_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 transition-colors ${h.closed ? "opacity-60" : "hover:bg-secondary/40"}`}>
            <span className="text-sm font-medium">{WEEKDAYS[h.weekday]}</span>
            <Input type="time" disabled={h.closed} value={h.open_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...form]; c[i] = { ...h, open_time: e.target.value }; setForm(c); }} className="h-9 tabular-nums" />
            <Input type="time" disabled={h.closed} value={h.close_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...form]; c[i] = { ...h, close_time: e.target.value }; setForm(c); }} className="h-9 tabular-nums" />
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-muted-foreground">Closed</span>
              <Switch checked={h.closed} onCheckedChange={(v) => { const c = [...form]; c[i] = { ...h, closed: v }; setForm(c); }} />
            </div>
          </div>
        ))}
      </div>
      <HolidayClosures businessId={biz.id} />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save hours
        </Button>
      </div>
    </div>
  );
}

function HolidayClosures({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["holiday-closures", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("holiday_closures").select("*").eq("business_id", businessId).order("starts_on");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [draft, setDraft] = useState({ label: "", starts_on: "", ends_on: "" });

  const add = async () => {
    if (!draft.label || !draft.starts_on || !draft.ends_on) return toast.error("Fill all fields");
    const { error } = await supabase.from("holiday_closures").insert({ business_id: businessId, ...draft });
    if (error) return toast.error(error.message);
    setDraft({ label: "", starts_on: "", ends_on: "" });
    qc.invalidateQueries({ queryKey: ["holiday-closures"] });
  };
  const remove = async (id: string) => {
    await supabase.from("holiday_closures").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["holiday-closures"] });
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Holiday closures</div>
      <div className="space-y-1.5 mb-3">
        {(rows ?? []).length === 0 && <p className="text-xs text-muted-foreground">No closures scheduled.</p>}
        {(rows ?? []).map((r: any) => (
          <div key={r.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2 hover:bg-secondary/40">
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{r.starts_on} → {r.ends_on}</span>
            <Button variant="ghost" size="sm" onClick={() => remove(r.id)} className="h-7 text-xs text-muted-foreground hover:text-destructive">Remove</Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_140px_140px_auto] gap-2">
        <Input placeholder="Reason (e.g. Christmas)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-9" />
        <Input type="date" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} className="h-9 tabular-nums" />
        <Input type="date" value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} className="h-9 tabular-nums" />
        <Button variant="outline" size="sm" onClick={add}>Add</Button>
      </div>
    </div>
  );
}
