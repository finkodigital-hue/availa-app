import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Globe,
  Check,
  Clock,
  Calendar as CalendarIcon,
  User,
  Sun,
  Sunset,
  Moon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
        <h1 className="font-display text-3xl mt-4">We couldn't find that page.</h1>
        <p className="text-muted-foreground mt-2">The link may be wrong, or the business has moved.</p>
      </div>
    </div>
  ),
  component: PublicBooking,
});

type Service = { id: string; name: string; duration_minutes: number; price_cents: number; description: string | null; buffer_before_min?: number | null; buffer_after_min?: number | null; color?: string | null };
type Staff = { id: string; name: string; role: string | null };
type Step = "service" | "staff" | "time" | "info" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "service", label: "Service" },
  { id: "staff", label: "Staff" },
  { id: "time", label: "Time" },
  { id: "info", label: "Details" },
];

function PublicBooking() {
  const biz = Route.useLoaderData();
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState<string | null>(null);
  const [info, setInfo] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const brand = biz.brand_color ?? "#C2410C";
  const brandStyle = { ["--brand" as any]: brand } as React.CSSProperties;

  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ["pub-services", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, duration_minutes, price_cents, description, buffer_before_min, buffer_after_min, color").eq("business_id", biz.id).eq("active", true).order("name");
      if (error) throw error; return data as Service[];
    },
  });

  const { data: allStaff, isLoading: loadingStaff } = useQuery({
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

  const { data: dayData, isLoading: loadingDay } = useQuery({
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
    const slotMin = 15;
    const bufBefore = service.buffer_before_min ?? 0;
    const bufAfter = service.buffer_after_min ?? 0;
    const totalMin = service.duration_minutes + bufBefore + bufAfter;
    const [oh, om] = dayData.hours.open_time.split(":").map(Number);
    const [ch, cm] = dayData.hours.close_time!.split(":").map(Number);
    const open = new Date(date); open.setHours(oh, om, 0, 0);
    const close = new Date(date); close.setHours(ch, cm, 0, 0);
    const result: { time: string; iso: string; hour: number }[] = [];
    const now = new Date();
    for (let t = new Date(open); t.getTime() + totalMin * 60000 <= close.getTime(); t = new Date(t.getTime() + slotMin * 60000)) {
      if (t < now) continue;
      const slotEnd = new Date(t.getTime() + totalMin * 60000);
      const conflict = dayData.bookings.some((b: any) => new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      const blocked = dayData.blocked.some((b: any) => (!b.staff_id || b.staff_id === staff?.id) && new Date(b.starts_at) < slotEnd && new Date(b.ends_at) > t);
      if (!conflict && !blocked) {
        const start = new Date(t.getTime() + bufBefore * 60000);
        result.push({ time: start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), iso: start.toISOString(), hour: start.getHours() });
      }
    }
    return result;
  }, [service, dayData, date, staff]);

  const grouped = useMemo(() => ({
    morning: slots.filter((s) => s.hour < 12),
    afternoon: slots.filter((s) => s.hour >= 12 && s.hour < 17),
    evening: slots.filter((s) => s.hour >= 17),
  }), [slots]);

  // 14-day strip
  const dayStrip = useMemo(() => {
    const arr: Date[] = [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i); arr.push(d);
    }
    return arr;
  }, []);

  const book = async () => {
    if (!service || !staff || !time || !info.name) return;
    setSubmitting(true);
    try {
      const starts_at = time;
      const ends_at = new Date(new Date(starts_at).getTime() + service.duration_minutes * 60000).toISOString();
      const { data: clash } = await supabase.from("bookings").select("id").eq("staff_id", staff.id).neq("status", "cancelled").lt("starts_at", ends_at).gt("ends_at", starts_at);
      if (clash && clash.length > 0) {
        toast.error("That slot was just taken — pick another.");
        setStep("time");
        setTime(null);
        setSubmitting(false);
        return;
      }
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

  const reset = () => {
    setStep("service"); setService(null); setStaff(null); setTime(null);
    setInfo({ name: "", email: "", phone: "", notes: "" });
  };

  return (
    <div className="min-h-screen bg-background" style={brandStyle}>
      {/* Branded header */}
      <header
        className="relative overflow-hidden"
        style={{
          background:
            `linear-gradient(135deg, color-mix(in oklab, ${brand} 12%, transparent), transparent 70%)`,
        }}
      >
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12 flex items-center gap-4">
          <div
            className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-2xl grid place-items-center font-display text-2xl text-white shadow-elegant"
            style={{ background: brand }}
          >
            {biz.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: brand }}>
              Book online
            </div>
            <h1 className="font-display text-2xl sm:text-3xl mt-0.5 truncate">{biz.name}</h1>
            <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {biz.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{biz.address}</span>}
              {biz.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{biz.phone}</span>}
              {biz.website && (
                <a href={biz.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                  <Globe className="h-3 w-3" />Website
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-10 pb-32">
        {biz.description && step === "service" && (
          <p className="text-muted-foreground mb-8 text-pretty">{biz.description}</p>
        )}

        {step !== "done" && <Stepper step={step} brand={brand} />}

        {/* Selection summary */}
        {(service || staff || time) && step !== "done" && (
          <div className="rounded-2xl border bg-card/60 backdrop-blur p-4 mb-6 flex flex-wrap gap-2 text-xs animate-rise">
            {service && <Chip onClick={() => setStep("service")} icon={Sparkles} label={service.name} />}
            {staff && <Chip onClick={() => setStep("staff")} icon={User} label={staff.name} />}
            {time && (
              <Chip
                onClick={() => setStep("time")}
                icon={Clock}
                label={new Date(time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              />
            )}
          </div>
        )}

        {/* SERVICE */}
        {step === "service" && (
          <div key="service" className="space-y-3 animate-rise">
            {loadingServices && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
            {!loadingServices && services?.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-card/40 p-16 text-center text-muted-foreground">
                No services available yet. Please check back soon.
              </div>
            )}
            {services?.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setService(s); setStep("staff"); }}
                className={`group w-full text-left rounded-2xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1}`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl">{s.name}</h3>
                    {s.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2 text-pretty">{s.description}</p>}
                    <div className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {s.duration_minutes} min
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-lg tabular-nums">{fmtMoney(s.price_cents)}</div>
                    <div className="mt-2 inline-flex items-center justify-center h-7 w-7 rounded-full bg-secondary group-hover:bg-foreground group-hover:text-background transition-colors">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* STAFF */}
        {step === "staff" && (
          <div key="staff" className="space-y-3 animate-rise">
            <BackBtn onClick={() => setStep("service")} />
            {loadingStaff && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
            {!loadingStaff && allStaff?.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center text-muted-foreground">
                No staff available for this service.
              </div>
            )}
            {allStaff?.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setStaff(p); setStep("time"); }}
                className={`group w-full text-left rounded-2xl border bg-card p-5 flex items-center gap-4 card-hover animate-rise stagger-${(i % 6) + 1}`}
              >
                <div className="h-12 w-12 rounded-full bg-secondary grid place-items-center font-display text-lg shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.name}</div>
                  {p.role && <div className="text-xs text-muted-foreground truncate">{p.role}</div>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* TIME */}
        {step === "time" && service && (
          <div key="time" className="animate-rise">
            <BackBtn onClick={() => setStep("staff")} />
            {/* Date strip */}
            <div className="rounded-2xl border bg-card p-3 mb-5 shadow-soft">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="font-display text-base inline-flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); if (d >= new Date(new Date().setHours(0, 0, 0, 0))) setDate(d); }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
                {dayStrip.map((d) => {
                  const isSel = d.toDateString() === date.toDateString();
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => setDate(d)}
                      className={`shrink-0 flex flex-col items-center min-w-[56px] py-2.5 rounded-xl text-xs transition-all ${
                        isSel
                          ? "text-white shadow-soft"
                          : "bg-secondary/50 hover:bg-secondary text-foreground"
                      }`}
                      style={isSel ? { background: brand } : undefined}
                    >
                      <span className="uppercase tracking-wider text-[10px] opacity-80">
                        {d.toLocaleDateString([], { weekday: "short" })}
                      </span>
                      <span className="font-display text-lg mt-0.5 tabular-nums leading-none">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loadingDay ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {Array.from({ length: 8 }).map((_, j) => <Skeleton key={j} className="h-11 rounded-xl" />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card/40 p-12 text-center">
                <Clock className="h-6 w-6 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-3">
                  No availability on this day. Try another date.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <SlotGroup label="Morning" icon={Sun} slots={grouped.morning} brand={brand} onPick={(iso) => { setTime(iso); setStep("info"); }} />
                <SlotGroup label="Afternoon" icon={Sunset} slots={grouped.afternoon} brand={brand} onPick={(iso) => { setTime(iso); setStep("info"); }} />
                <SlotGroup label="Evening" icon={Moon} slots={grouped.evening} brand={brand} onPick={(iso) => { setTime(iso); setStep("info"); }} />
              </div>
            )}
          </div>
        )}

        {/* INFO */}
        {step === "info" && service && staff && time && (
          <div key="info" className="space-y-4 animate-rise">
            <BackBtn onClick={() => setStep("time")} />
            <div
              className="rounded-2xl p-5 text-white shadow-elegant"
              style={{ background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 70%, black))` }}
            >
              <div className="text-[11px] uppercase tracking-[0.2em] opacity-80">Almost there</div>
              <div className="font-display text-xl mt-1">{service.name}</div>
              <div className="text-sm opacity-90 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{staff.name}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span>· {fmtMoney(service.price_cents)}</span>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your name</Label>
              <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} className="mt-1.5 h-11" required autoFocus />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
                <Input type="email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} className="mt-1.5 h-11" placeholder="you@email.com" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Phone</Label>
                <Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} className="mt-1.5 h-11" placeholder="(555) 000-0000" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes <span className="text-muted-foreground/60 normal-case">(optional)</span></Label>
              <Textarea value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} className="mt-1.5" placeholder="Anything we should know?" />
            </div>
            <Button
              onClick={book}
              disabled={submitting || !info.name}
              className="w-full h-12 text-base shadow-glow"
              style={{ background: brand }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Booking…
                </>
              ) : (
                <>Confirm booking · {fmtMoney(service.price_cents)}</>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              By confirming, you agree to our booking terms.
            </p>
          </div>
        )}

        {/* DONE */}
        {step === "done" && service && staff && time && (
          <div className="text-center py-12 animate-rise">
            <div
              className="mx-auto h-20 w-20 rounded-full grid place-items-center text-white shadow-glow animate-pulse-ring"
              style={{ background: brand }}
            >
              <Check className="h-9 w-9" />
            </div>
            <h2 className="font-display text-3xl sm:text-4xl mt-8 text-balance">
              You're booked.
            </h2>
            <p className="text-muted-foreground mt-3 text-pretty">
              We'll see you {new Date(time).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} at{" "}
              {new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
            <div className="mt-8 mx-auto max-w-sm rounded-2xl border bg-card p-5 text-left text-sm">
              <SummaryRow label="Service" value={service.name} />
              <SummaryRow label="With" value={staff.name} />
              <SummaryRow label="Total" value={fmtMoney(service.price_cents)} />
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button variant="outline" onClick={reset}>Book another</Button>
              {info.email && (
                <a
                  href="/portal"
                  className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                >
                  Manage your bookings →
                </a>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-muted-foreground py-6">
        Powered by <span className="font-display text-foreground">Luma<span style={{ color: brand }}>.</span></span>
      </footer>
    </div>
  );
}

function SlotGroup({
  label,
  icon: Icon,
  slots,
  brand,
  onPick,
}: {
  label: string;
  icon: any;
  slots: { time: string; iso: string }[];
  brand: string;
  onPick: (iso: string) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5 text-xs uppercase tracking-[0.15em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className="text-muted-foreground/70 normal-case tracking-normal">· {slots.length}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slots.map((s) => (
          <button
            key={s.iso}
            onClick={() => onPick(s.iso)}
            className="px-3 h-11 rounded-xl border bg-card hover:text-white hover:border-transparent text-sm tabular-nums transition-colors"
            style={{ ["--tw-bg-opacity" as any]: 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = brand)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            {s.time}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ step, brand }: { step: Step; brand: string }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        <span>Step {idx + 1} of {STEPS.length}</span>
        <span>{STEPS[idx]?.label}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className="h-1 flex-1 rounded-full bg-secondary overflow-hidden"
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: i <= idx ? "100%" : "0%",
                background: brand,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4 group"
    >
      <ChevronLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back
    </button>
  );
}

function Chip({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-secondary hover:bg-secondary/70 px-2.5 py-1 text-foreground transition-colors"
    >
      <Icon className="h-3 w-3" />
      <span className="truncate max-w-[180px]">{label}</span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
