import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, Loader2, Palette, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";
import { GalleryManager } from "@/components/gallery-manager";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: biz } = useMyBusiness();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => { if (biz) setForm(biz); }, [biz?.id]);

  const { data: hours, isLoading: hoursLoading } = useQuery({
    queryKey: ["business-hours", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("business_hours").select("*").eq("business_id", biz!.id).order("weekday");
      if (error) throw error;
      return data;
    },
  });
  const [hoursForm, setHoursForm] = useState<any[]>([]);
  useEffect(() => { if (hours) setHoursForm(hours); }, [hours]);

  const saveBiz = async () => {
    if (!biz) return;
    setSavingProfile(true);
    const { error } = await supabase.from("businesses").update({
      name: form.name, description: form.description,
      address: form.address, phone: form.phone, email: form.email, website: form.website,
      brand_color: form.brand_color, timezone: form.timezone,
      instagram: form.instagram, facebook: form.facebook, twitter: form.twitter,
    }).eq("id", biz.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: ["my-business"] });
  };

  const saveHours = async () => {
    if (!biz) return;
    setSavingHours(true);
    try {
      for (const h of hoursForm) {
        await supabase.from("business_hours").update({
          open_time: h.closed ? null : h.open_time,
          close_time: h.closed ? null : h.close_time,
          closed: h.closed,
        }).eq("id", h.id);
      }
      toast.success("Hours saved");
      qc.invalidateQueries({ queryKey: ["business-hours"] });
    } finally {
      setSavingHours(false);
    }
  };

  if (!biz) return null;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-3xl">
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Configure your business profile, brand and opening hours." />

      <Section icon={Building2} title="Business profile" description="How customers see you on your booking page.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" /></Field>
          <Field label="Brand color">
            <div className="flex items-center gap-3 rounded-xl border bg-background h-10 px-3">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <input
                type="color"
                value={form.brand_color ?? "#C2410C"}
                onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer bg-transparent border-0"
              />
              <span className="text-xs text-muted-foreground tabular-nums">{form.brand_color ?? "#C2410C"}</span>
            </div>
          </Field>
          <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10" /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" /></Field>
          <Field label="Website"><Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} className="h-10" placeholder="https://" /></Field>
          <Field label="Timezone"><Input value={form.timezone ?? ""} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="h-10" /></Field>
        </div>
        <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="h-10" /></Field>
        <Field label="Description"><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="A short pitch for your booking page" /></Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Instagram"><Input value={form.instagram ?? ""} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="h-10" placeholder="@handle" /></Field>
          <Field label="Facebook"><Input value={form.facebook ?? ""} onChange={(e) => setForm({ ...form, facebook: e.target.value })} className="h-10" /></Field>
          <Field label="Twitter"><Input value={form.twitter ?? ""} onChange={(e) => setForm({ ...form, twitter: e.target.value })} className="h-10" /></Field>
        </div>
        <div className="pt-2 flex justify-end">
          <Button onClick={saveBiz} disabled={savingProfile}>
            {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save profile
          </Button>
        </div>
      </Section>

      <Section icon={Clock} title="Opening hours" description="When customers can book online.">
        {hoursLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-1.5">
            {hoursForm.map((h, i) => (
              <div
                key={h.id}
                className={`grid grid-cols-[80px_1fr_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                  h.closed ? "opacity-60" : "hover:bg-secondary/40"
                }`}
              >
                <span className="text-sm font-medium">{WEEKDAYS[h.weekday]}</span>
                <Input type="time" disabled={h.closed} value={h.open_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...hoursForm]; c[i] = { ...h, open_time: e.target.value }; setHoursForm(c); }} className="h-9 tabular-nums" />
                <Input type="time" disabled={h.closed} value={h.close_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...hoursForm]; c[i] = { ...h, close_time: e.target.value }; setHoursForm(c); }} className="h-9 tabular-nums" />
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-muted-foreground">Closed</span>
                  <Switch checked={h.closed} onCheckedChange={(v) => { const c = [...hoursForm]; c[i] = { ...h, closed: v }; setHoursForm(c); }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pt-2 flex justify-end">
          <Button onClick={saveHours} disabled={savingHours}>
            {savingHours && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save hours
          </Button>
        </div>
      </Section>

      <Section icon={ImageIcon} title="Gallery & branding" description="Logo, cover image and showcase photos shown on your booking page.">
        <GalleryManager businessId={biz.id} />
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: any;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-6 space-y-4 mb-5 shadow-soft animate-rise">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-secondary grid place-items-center text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
