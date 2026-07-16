import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, Loader2, ImageIcon, Palette, FileText, Crown, Armchair, Eye, CalendarCheck, Move, Globe2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";
import { GalleryManager } from "@/components/gallery-manager";
import { PageContentEditor } from "@/components/page-content-editor";
import { WhiteLabelEditor } from "@/components/white-label-editor";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: biz } = useMyBusiness();
  const navigate = useNavigate();

  // A business is an "independent pro" if it's linked to at least one salon
  // as the pro side — that's what unlocks the chair-rentals tab below.
  const { data: salonLinks } = useQuery({
    queryKey: ["my-salon-links", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_professionals")
        .select("id, salon_business_id, status, chair_label, permissions, rent_mode, rent_amount_cents, commission_percent, rent_due_day")
        .eq("pro_business_id", biz!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const salonIds = Array.from(new Set(data.map((d) => d.salon_business_id)));
      let salons: Record<string, { name: string }> = {};
      if (salonIds.length > 0) {
        const { data: bizRows } = await (supabase as any)
          .from("public_businesses")
          .select("id, name")
          .in("id", salonIds);
        salons = Object.fromEntries((bizRows ?? []).map((b: any) => [b.id, b]));
      }
      return data.map((d) => ({ ...d, salon: salons[d.salon_business_id] }));
    },
  });

  if (!biz) return <div className="p-8"><Skeleton className="h-[400px]" /></div>;

  const isIndependentPro = (salonLinks?.length ?? 0) > 0;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-4xl">
      <PageHeader eyebrow="Workspace" title="Settings" subtitle="Customise your brand, booking page and business details." />

      <Tabs defaultValue="profile" className="space-y-5">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 rounded-[10px] bg-card border p-1.5 shadow-soft">
          <TabsTrigger value="profile" className={TAB_CLS}><Building2 className="h-3.5 w-3.5 mr-1.5" /> Business</TabsTrigger>
          <TabsTrigger value="hours" className={TAB_CLS}><Clock className="h-3.5 w-3.5 mr-1.5" /> Hours</TabsTrigger>
          <TabsTrigger value="branding" className={TAB_CLS}><Palette className="h-3.5 w-3.5 mr-1.5" /> Branding</TabsTrigger>
          <TabsTrigger value="gallery" className={TAB_CLS}><ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Gallery</TabsTrigger>
          <TabsTrigger value="page" className={TAB_CLS}><FileText className="h-3.5 w-3.5 mr-1.5" /> Page content</TabsTrigger>
          <TabsTrigger value="whitelabel" className={TAB_CLS}><Crown className="h-3.5 w-3.5 mr-1.5" /> White-label</TabsTrigger>
          {isIndependentPro && (
            <TabsTrigger value="chairs" className={TAB_CLS}><Armchair className="h-3.5 w-3.5 mr-1.5" /> Chair rentals</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <Section icon={Building2} title="Business profile" description="The core details customers and staff see across the app.">
            <ProfileEditor biz={biz} />
          </Section>
        </TabsContent>
        <TabsContent value="hours">
          <Section icon={Clock} title="Opening hours" description="Your weekly schedule, split shifts and holiday closures.">
            <HoursEditor biz={biz} />
          </Section>
        </TabsContent>
        <TabsContent value="branding">
          <Section icon={Palette} title="Branding" description="Your logo, colours and the look of your booking page.">
            <div className="rounded-2xl border border-dashed bg-card/40 p-10 text-center">
              <Palette className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-3 max-w-sm mx-auto">
                Your booking page design has moved. Customise everything — colors, fonts, buttons — in the Page Builder.
              </p>
              <Button className="mt-5" onClick={() => navigate({ to: "/page-builder", search: { tab: "design" } })}>
                Open Page Builder <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </Section>
        </TabsContent>
        <TabsContent value="gallery">
          <Section icon={ImageIcon} title="Gallery" description="Photos shown on your public booking page.">
            <GalleryManager businessId={biz.id} />
          </Section>
        </TabsContent>
        <TabsContent value="page">
          <Section icon={FileText} title="Page content" description="Customise the text and layout of your booking page.">
            <PageContentEditor business={biz} />
          </Section>
        </TabsContent>
        <TabsContent value="whitelabel">
          <Section icon={Crown} title="White-label" description="Remove Bookzenvo branding for your customers.">
            <WhiteLabelEditor business={biz} />
          </Section>
        </TabsContent>
        {isIndependentPro && (
          <TabsContent value="chairs"><ChairRentalsEditor businessId={biz.id} links={salonLinks ?? []} /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const TAB_CLS =
  "rounded-[7px] px-3.5 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 " +
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:font-semibold";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: typeof Building2;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-soft animate-rise">
      {(title || description) && (
        <div className="flex items-start gap-3 mb-5 pb-5 border-b">
          {Icon && (
            <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-foreground">
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg leading-tight">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground mt-0.5 text-pretty">{description}</p>}
          </div>
        </div>
      )}
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

type SalonLink = {
  id: string;
  salon_business_id: string;
  status: string;
  chair_label: string | null;
  permissions: any;
  rent_mode: string;
  rent_amount_cents: number | null;
  commission_percent: number | null;
  rent_due_day: number | null;
  salon?: { name: string };
};

const PRO_PERMISSIONS: {
  key: string;
  label: string;
  description: string;
  icon: typeof Eye;
}[] = [
  {
    key: "salon_can_view_calendar",
    label: "Show me on their calendar",
    description: "The salon sees your bookings and staff column on their internal calendar.",
    icon: Eye,
  },
  {
    key: "public_bookable",
    label: "List me on their booking page",
    description: "Customers can book you directly through the salon's public booking page.",
    icon: Globe2,
  },
  {
    key: "salon_can_book",
    label: "Let them create bookings for me",
    description: "The salon can add new bookings on your calendar, e.g. for walk-ins.",
    icon: CalendarCheck,
  },
  {
    key: "salon_can_move",
    label: "Let them reschedule my bookings",
    description: "The salon can drag/move or resize your existing bookings.",
    icon: Move,
  },
];

function rentSummaryFor(l: { rent_mode: string; rent_amount_cents: number | null; commission_percent: number | null }) {
  const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
  switch (l.rent_mode) {
    case "weekly": return `${money(l.rent_amount_cents)} / week`;
    case "monthly": return `${money(l.rent_amount_cents)} / month`;
    case "percentage": return `${l.commission_percent ?? 0}% commission`;
    case "fixed_commission": return `${money(l.rent_amount_cents)} per booking`;
    default: return "No rent agreement";
  }
}

function ChairRentalsEditor({ businessId, links }: { businessId: string; links: SalonLink[] }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const togglePermission = async (link: SalonLink, key: string, value: boolean) => {
    const next = { ...link.permissions, [key]: value };
    setPending(`${link.id}:${key}`);
    // Optimistic update so the switch responds instantly.
    qc.setQueryData<SalonLink[]>(["my-salon-links", businessId], (old) =>
      old?.map((l) => (l.id === link.id ? { ...l, permissions: next } : l)),
    );
    const { error } = await supabase.from("salon_professionals").update({ permissions: next }).eq("id", link.id);
    setPending(null);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["my-salon-links", businessId] });
      return;
    }
    toast.success("Saved");
  };

  if (links.length === 0) return null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground text-pretty px-1">
        You're renting a chair at {links.length} salon{links.length === 1 ? "" : "s"}. Control exactly
        what each one can see and do — your revenue, customers and reports are never shared, no matter
        what's toggled here.
      </p>
      {links.map((l) => (
        <Section key={l.id}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display text-lg truncate">{l.salon?.name ?? "Salon"}</h3>
                {l.status === "active" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Active" />
                ) : (
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{l.status}</Badge>
                )}
              </div>
              {l.chair_label && (
                <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                  <Armchair className="h-3 w-3 shrink-0" /> {l.chair_label}
                </p>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right shrink-0">
              <div className="uppercase tracking-wide text-[10px]">You pay</div>
              <div className="font-medium text-foreground">{rentSummaryFor(l)}</div>
            </div>
          </div>
          <div className="space-y-1 -mx-1">
            {PRO_PERMISSIONS.map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-secondary/40">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <p className="text-xs text-muted-foreground text-pretty">{description}</p>
                  </div>
                </div>
                <Switch
                  checked={l.permissions?.[key] ?? true}
                  disabled={pending === `${l.id}:${key}`}
                  onCheckedChange={(v) => togglePermission(l, key, v)}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ProfileEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(biz);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(biz); }, [biz?.id]);

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Business name is required");
    setSaving(true);
    const { error } = await supabase.from("businesses").update({
      name: form.name.trim(), description: form.description,
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

type Period = { id?: string; open_time: string; close_time: string };

function HoursEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const { data: periods, isLoading } = useQuery({
    queryKey: ["business-hour-periods", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hour_periods")
        .select("*")
        .eq("business_id", biz.id)
        .order("weekday")
        .order("open_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 7 buckets — array of periods per weekday. Empty array = closed.
  const [days, setDays] = useState<Period[][]>(() => Array.from({ length: 7 }, () => []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const buckets: Period[][] = Array.from({ length: 7 }, () => []);
    for (const p of periods ?? []) {
      buckets[(p as any).weekday]?.push({
        id: (p as any).id,
        open_time: String((p as any).open_time).slice(0, 5),
        close_time: String((p as any).close_time).slice(0, 5),
      });
    }
    setDays(buckets);
  }, [periods]);

  const updatePeriod = (w: number, i: number, patch: Partial<Period>) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w][i] = { ...next[w][i], ...patch };
      return next;
    });
  };
  const addPeriod = (w: number) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      const last = next[w][next[w].length - 1];
      next[w].push(last ? { open_time: last.close_time, close_time: "18:00" } : { open_time: "09:00", close_time: "18:00" });
      return next;
    });
  };
  const removePeriod = (w: number, i: number) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w].splice(i, 1);
      return next;
    });
  };
  const toggleClosed = (w: number, closed: boolean) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w] = closed ? [] : [{ open_time: "09:00", close_time: "18:00" }];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Validate: each period open < close; no overlap within a day.
      for (let w = 0; w < 7; w++) {
        const sorted = [...days[w]].sort((a, b) => a.open_time.localeCompare(b.open_time));
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].open_time >= sorted[i].close_time) throw new Error(`${WEEKDAYS[w]}: opening time must be before closing time.`);
          if (i > 0 && sorted[i].open_time < sorted[i - 1].close_time) throw new Error(`${WEEKDAYS[w]}: periods overlap.`);
        }
      }

      // Wipe & reinsert — simplest correct behaviour.
      const { error: delErr } = await supabase.from("business_hour_periods").delete().eq("business_id", biz.id);
      if (delErr) throw delErr;
      const rows = days.flatMap((arr, w) => arr.map((p) => ({
        business_id: biz.id, weekday: w, open_time: p.open_time, close_time: p.close_time,
      })));
      if (rows.length) {
        const { error } = await supabase.from("business_hour_periods").insert(rows);
        if (error) throw error;
      }

      // Mirror primary period back into legacy business_hours for compatibility.
      const legacy = Array.from({ length: 7 }, (_, w) => {
        const first = [...days[w]].sort((a, b) => a.open_time.localeCompare(b.open_time))[0];
        return {
          business_id: biz.id,
          weekday: w,
          open_time: first?.open_time ?? null,
          close_time: first?.close_time ?? null,
          closed: !first,
        };
      });
      await supabase.from("business_hours").upsert(legacy, { onConflict: "business_id,weekday" });

      toast.success("Hours saved");
      qc.invalidateQueries({ queryKey: ["business-hour-periods"] });
      qc.invalidateQueries({ queryKey: ["business-hours"] });
      qc.invalidateQueries({ queryKey: ["slots-day"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally { setSaving(false); }
  };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Add multiple periods per day for split shifts (e.g. 9:00–13:00 and 14:00–18:00).</p>
      <div className="space-y-2">
        {days.map((periods, w) => {
          const closed = periods.length === 0;
          return (
            <div key={w} className={`rounded-xl border bg-background p-3 transition-colors ${closed ? "opacity-70" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{WEEKDAYS[w]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{closed ? "Closed" : "Open"}</span>
                  <Switch checked={!closed} onCheckedChange={(v) => toggleClosed(w, !v)} />
                </div>
              </div>
              {!closed && (
                <div className="space-y-1.5">
                  {periods.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                      <Input type="time" value={p.open_time} onChange={(e) => updatePeriod(w, i, { open_time: e.target.value })} className="h-9 tabular-nums" />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="time" value={p.close_time} onChange={(e) => updatePeriod(w, i, { close_time: e.target.value })} className="h-9 tabular-nums" />
                      <Button variant="ghost" size="sm" onClick={() => removePeriod(w, i)} disabled={periods.length === 1} className="h-9 text-xs text-muted-foreground hover:text-destructive">Remove</Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => addPeriod(w)} className="h-8 text-xs">+ Add period</Button>
                </div>
              )}
            </div>
          );
        })}
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
    if (draft.starts_on > draft.ends_on) return toast.error("End date must be on or after the start date");
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
