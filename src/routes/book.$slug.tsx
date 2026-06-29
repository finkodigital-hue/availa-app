import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Phone, Globe, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, slug, description, brand_color, logo_url, address, phone, website, email, timezone, instagram, facebook, twitter")
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Book with ${loaderData.name}` : "Book" },
      { name: "description", content: loaderData?.description ?? `Book online with ${loaderData?.name ?? ""}.` },
      { property: "og:title", content: loaderData ? `Book with ${loaderData.name}` : "Book" },
      { property: "og:description", content: loaderData?.description ?? "" },
    ],
  }),
  errorComponent: ({ error }) => <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">{error.message}</div>,
  notFoundComponent: () => <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">Business not found.</div>,
  component: PublicBooking,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null };
type Staff = { id: string; name: string; role: string | null };
type Step = "service" | "staff" | "time" | "info" | "done";

function PublicBooking() {
  const biz = Route.useLoaderData();
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [time, setTime] = useState<string | null>(null);
  const [info, setInfo] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  // Apply brand color
  const brandStyle = biz.brand_color ? { ["--brand" as any]: biz.brand_color } : {};

  const { data: services } = useQuery({
    queryKey: ["pub-services", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, duration_minutes, price_cents, description").eq("business_id", biz.id).eq("active", true).order("name");
      if (error) throw error; return data as Service[];
    },
  });

  const { data: allStaff } = useQuery({
    queryKey: ["pub-staff", biz.id, service?.id],
    enabled: !!service,
    queryFn: async () => {
      const linked = await supabase.from("service_staff").select("staff_id").eq("service_id", service!.id);
      let q = supabase.from("staff").select("id, name, role").eq("business_id", biz.id).eq("bookable", true);
      if (linked.data && linked.data.length > 0) q = q.in("id", linked.data.map((r) => r.staff_id));
      const { data, error } = await q.order("name");
      if (error) throw error; return data as Staff[];
    },
  });

  const { data: dayData } = useQuery({
    queryKey: ["pub-day", biz.id, staff?.id, date.toDateString()],
    enabled: !!staff && !!service,
    queryFn: async () => {
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
      const [hoursR, bookingsR, blockedR] = await Promise.all([
        supabase.from("business_hours").select("*").eq("business_id", biz.id).eq("weekday", date.getDay()).maybeSingle(),
        supabase.from("bookings").select("starts_at, ends_at, status").eq("business_id", biz.id).eq("staff_id", staff!.id).gte("starts_at", dayStart.toISOString()).lte("starts_at", dayEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("blocked_dates").select("starts_at, ends_at, staff_id").eq("business_id", biz.id).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
      ]);
      return { hours: hoursR.data, bookings: bookingsR.data ?? [], blocked: blockedR.data ?? [] };
    },
  });

  const slots = useMemo(() => {
    if (!service || !dayData?.hours || dayData.hours.closed || !dayData.hours.open_time) return [];
    const slotMin = 30;
    const [oh, om] = dayData.hours.open_time.split(":").map(Number);
    const [ch, cm] = dayData.hours.close_time!.split(":").map(Number);
    const open = new Date(date); open.setHours(oh, om, 0, 0);
    const close = new Date(date); close.setHours(ch, cm, 0, 0);
    const result: { time: string; iso: string }[] = [];
    const now = new Date();
    for (let t = new Date(open); t.getTime() + service.duration_minutes * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
      if (t < now) continue;
      const slotEnd = new Date(t.getTime() + service.duration_minutes * 60000);
      const conflict = dayData.bookings.some((b: any) => new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      const blocked = dayData.blocked.some((b: any) => (!b.staff_id || b.staff_id === staff?.id) && new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      if (!conflict && !blocked) result.push({ time: t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), iso: t.toISOString() });
    }
    return result;
  }, [service, dayData, date, staff]);

  const book = async () => {
    if (!service || !staff || !time || !info.name) return;
    setSubmitting(true);
    try {
      const starts_at = time;
      const ends_at = new Date(new Date(starts_at).getTime() + service.duration_minutes * 60000).toISOString();
      // Double-booking check (best-effort RLS-safe)
      const { data: clash } = await supabase.from("bookings").select("id").eq("staff_id", staff.id).neq("status", "cancelled").lt("starts_at", ends_at).gt("ends_at", starts_at);
      if (clash && clash.length > 0) { toast.error("That slot was just taken — pick another."); setSubmitting(false); return; }
      const { error } = await supabase.from("bookings").insert({
        business_id: biz.id, service_id: service.id, staff_id: staff.id,
        customer_name: info.name, customer_email: info.email || null, customer_phone: info.phone || null,
        starts_at, ends_at, price_cents: service.price_cents, notes: info.notes || null,
      });
      if (error) throw error;
      setStep("done");
    } catch (e: any) {
      toast.error(e.message ?? "Could not book");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-background" style={brandStyle as any}>
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full flex items-center justify-center font-display text-lg text-white" style={{ background: biz.brand_color ?? "#C2410C" }}>
            {biz.name.charAt(0)}
          </div>
          <div>
            <h1 className="font-display text-2xl leading-none">{biz.name}</h1>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3">
              {biz.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{biz.address}</span>}
              {biz.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{biz.phone}</span>}
              {biz.website && <a href={biz.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground"><Globe className="h-3 w-3" />Website</a>}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {biz.description && <p className="text-muted-foreground mb-8">{biz.description}</p>}

        <Stepper step={step} />

        {step === "service" && (
          <div className="space-y-2">
            {services?.map((s) => (
              <button key={s.id} onClick={() => { setService(s); setStep("staff"); }} className="w-full text-left rounded-2xl border bg-card p-5 hover:border-foreground transition-colors">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-display text-xl">{s.name}</h3>
                    {s.description && <p className="text-sm text-muted-foreground mt-1">{s.description}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">{fmtMoney(s.price_cents)}</div>
                    <div className="text-xs text-muted-foreground">{s.duration_minutes} min</div>
                  </div>
                </div>
              </button>
            ))}
            {services?.length === 0 && <p className="text-muted-foreground text-center py-12">No services available yet.</p>}
          </div>
        )}

        {step === "staff" && (
          <div className="space-y-2">
            <BackBtn onClick={() => setStep("service")} />
            {allStaff?.map((p) => (
              <button key={p.id} onClick={() => { setStaff(p); setStep("time"); }} className="w-full text-left rounded-2xl border bg-card p-5 hover:border-foreground flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center font-display">{p.name.charAt(0)}</div>
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.role && <div className="text-xs text-muted-foreground">{p.role}</div>}
                </div>
              </button>
            ))}
            {allStaff?.length === 0 && <p className="text-muted-foreground text-center py-12">No staff available for this service.</p>}
          </div>
        )}

        {step === "time" && service && (
          <div>
            <BackBtn onClick={() => setStep("staff")} />
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="icon" onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); }}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="font-display text-xl">{date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
              <Button variant="outline" size="icon" onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((s) => (
                <button key={s.iso} onClick={() => { setTime(s.iso); setStep("info"); }} className="px-3 py-2.5 rounded-xl border bg-card hover:border-foreground text-sm">
                  {s.time}
                </button>
              ))}
              {slots.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8">No slots available on this day.</p>}
            </div>
          </div>
        )}

        {step === "info" && service && staff && time && (
          <div className="space-y-4">
            <BackBtn onClick={() => setStep("time")} />
            <div className="rounded-2xl border bg-card p-5 text-sm">
              <div className="font-display text-lg">{service.name}</div>
              <div className="text-muted-foreground mt-1">With {staff.name} · {new Date(time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {fmtMoney(service.price_cents)}</div>
            </div>
            <div><Label>Your name</Label><Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} className="mt-1.5" required /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Phone</Label><Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div><Label>Notes (optional)</Label><Textarea value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} className="mt-1.5" /></div>
            <Button onClick={book} disabled={submitting || !info.name} className="w-full" style={{ background: biz.brand_color ?? undefined }}>
              {submitting ? "Booking…" : "Confirm booking"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-16">
            <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center" style={{ background: biz.brand_color ?? "#C2410C" }}>
              <Check className="h-6 w-6 text-white" />
            </div>
            <h2 className="font-display text-3xl mt-6">You're booked!</h2>
            <p className="text-muted-foreground mt-2">A confirmation has been recorded. We'll see you soon.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: Step[] = ["service", "staff", "time", "info"];
  if (step === "done") return null;
  const idx = items.indexOf(step);
  return (
    <div className="flex items-center gap-2 mb-6 text-xs">
      {items.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center ${i <= idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
          <span className={i === idx ? "font-medium capitalize" : "text-muted-foreground capitalize"}>{s}</span>
          {i < items.length - 1 && <span className="text-muted-foreground">·</span>}
        </div>
      ))}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"><ChevronLeft className="h-3 w-3" /> Back</button>;
}
