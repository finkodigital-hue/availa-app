import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserPlus, ChevronLeft, Pencil, Sparkles, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtTime } from "@/lib/format";
import { useAvailableSlots, buildDateStrip } from "@/lib/slots";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  buffer_before_min: number;
  buffer_after_min: number;
  color: string | null;
};
type Staff = { id: string; name: string; business_id?: string };

type Step = "customer" | "service" | "staff" | "slot" | "payment" | "confirm" | "custom";

type Prefill = {
  staffId?: string;
  date?: Date;
  isoTime?: string;
  serviceId?: string;
  customerId?: string;
};

const CUSTOM_COLORS = ["#a78bfa", "#f472b6", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#94a3b8"];

export function NewBookingDialog({
  open,
  onOpenChange,
  businessId,
  prefill,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  prefill?: Prefill;
  onCreated?: () => void;
}) {
  const [isCustom, setIsCustom] = useState(false);
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCust, setNewCust] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  // Custom-only fields
  const [customTitle, setCustomTitle] = useState("");
  const [customColor, setCustomColor] = useState(CUSTOM_COLORS[0]);
  const [customDuration, setCustomDuration] = useState(30);

  // Payment fields
  const [depositCents, setDepositCents] = useState<number>(0);
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "deposit" | "paid">("unpaid");

  useEffect(() => {
    if (!open) {
      setIsCustom(false);
      setStep("customer");
      setCustomer(null); setNewCust(null); setService(null); setStaff(null);
      setTime(null); setNotes(""); setNotify(true); setLoadingPrefill(false);
      setCustomTitle(""); setCustomColor(CUSTOM_COLORS[0]); setCustomDuration(30);
      setDepositCents(0); setPaymentStatus("unpaid");
      return;
    }
    const baseDate = prefill?.isoTime ? new Date(prefill.isoTime) : prefill?.date ? new Date(prefill.date) : null;
    if (baseDate) { const d = new Date(baseDate); d.setHours(0, 0, 0, 0); setDate(d); }
    if (prefill?.isoTime) setTime(prefill.isoTime);

    const hasAnyId = !!(prefill?.staffId || prefill?.serviceId || prefill?.customerId);
    if (!hasAnyId) {
      setStep(firstMissing({ hasCustomer: false, hasService: false, hasStaff: false, hasTime: !!prefill?.isoTime }));
      return;
    }
    setLoadingPrefill(true);
    (async () => {
      const [staffRes, svcRes, custRes] = await Promise.all([
        prefill?.staffId ? supabase.from("staff").select("id, name, business_id").eq("id", prefill.staffId).maybeSingle() : Promise.resolve({ data: null } as any),
        prefill?.serviceId ? supabase.from("services").select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color").eq("id", prefill.serviceId).maybeSingle() : Promise.resolve({ data: null } as any),
        prefill?.customerId ? supabase.from("customers").select("id, name, email, phone").eq("id", prefill.customerId).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      const st = staffRes?.data ? { id: staffRes.data.id, name: staffRes.data.name, business_id: staffRes.data.business_id } : null;
      const sv = svcRes?.data as Service | null;
      const cu = custRes?.data as Customer | null;
      if (st) setStaff(st);
      if (sv) setService(sv);
      if (cu) setCustomer(cu);
      setLoadingPrefill(false);
      setStep(firstMissing({ hasCustomer: !!cu, hasService: !!sv, hasStaff: !!st, hasTime: !!prefill?.isoTime }));
    })();
  }, [open, prefill]);

  // Switch to/from custom mode
  useEffect(() => {
    if (isCustom) {
      setStep(staff ? (time ? "confirm" : "slot") : "custom");
    } else {
      setStep(firstMissing({ hasCustomer: !!(customer || newCust), hasService: !!service, hasStaff: !!staff, hasTime: !!time }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom]);

  const customerLabel = customer?.name ?? newCust?.name ?? null;
  const wizardSteps: Step[] = isCustom
    ? ["custom", "staff", "slot", "confirm"]
    : ["customer", "service", "staff", "slot", "payment", "confirm"];
  const stepIndex = Math.max(0, wizardSteps.indexOf(step));

  const canConfirmRegular = !!(service && staff && time && (customer || newCust));
  const canConfirmCustom = !!(customTitle && staff && time);

  const customService: Service | null = isCustom
    ? { id: "custom", name: customTitle || "Custom", duration_minutes: customDuration, price_cents: 0, buffer_before_min: 0, buffer_after_min: 0, color: customColor }
    : null;

  async function submit() {
    setSubmitting(true);
    try {
      const starts_at = time!;
      // If the target staff belongs to a different business (independent
      // professional linked to this salon), route the booking to THAT business
      // so it lands in the pro's own data. RLS policies allow the salon owner
      // to insert on the pro's behalf when the link permits it.
      const targetBiz = staff?.business_id || businessId;
      const isCrossBiz = targetBiz !== businessId;
      if (isCustom) {
        const ends_at = new Date(new Date(starts_at).getTime() + customDuration * 60000).toISOString();
        const { error } = await supabase.from("bookings").insert({
          business_id: targetBiz,
          staff_id: staff!.id,
          service_id: null,
          customer_id: null,
          customer_name: customTitle,
          starts_at,
          ends_at,
          price_cents: 0,
          notes: notes || null,
          source: "walkin",
          notify_customer: false,
          is_custom: true,
          custom_title: customTitle,
          custom_color: customColor,
          status: "confirmed",
        } as any);
        if (error) throw error;
      } else {
        let custId = customer?.id ?? null;
        let custName = customer?.name ?? newCust?.name ?? "Walk-in";
        const custEmail = customer?.email ?? newCust?.email ?? null;
        const custPhone = customer?.phone ?? newCust?.phone ?? null;
        // Only look up / create customer rows on the current user's OWN
        // business. For cross-business bookings (salon booking on behalf of a
        // pro), keep customer info inline on the booking row — the pro owns
        // their customer list and RLS blocks writes here anyway.
        if (!isCrossBiz && !custId && newCust) {
          const phoneNorm = newCust.phone.replace(/\D/g, "") || null;
          const orParts: string[] = [];
          if (newCust.email) orParts.push(`email.ilike.${newCust.email}`);
          if (phoneNorm) orParts.push(`phone_normalized.eq.${phoneNorm}`);
          if (orParts.length) {
            const { data: existing } = await supabase.from("customers").select("id, name, email, phone").eq("business_id", businessId).or(orParts.join(",")).limit(1);
            if (existing && existing.length) { custId = existing[0].id; custName = existing[0].name; }
          }
          if (!custId) {
            const { data: ins, error } = await supabase.from("customers").insert({ business_id: businessId, name: newCust.name, email: newCust.email || null, phone: newCust.phone || null }).select("id").single();
            if (error) throw error;
            custId = ins.id;
          }
        }
        const ends_at = new Date(new Date(starts_at).getTime() + service!.duration_minutes * 60000).toISOString();
        const { error } = await supabase.from("bookings").insert({
          business_id: targetBiz,
          service_id: service!.id,
          staff_id: staff!.id,
          customer_id: isCrossBiz ? null : custId,
          customer_name: custName,
          customer_email: custEmail,
          customer_phone: custPhone,
          starts_at,
          ends_at,
          price_cents: service!.price_cents,
          notes: notes || null,
          source: "walkin",
          notify_customer: notify,
          amount_due_cents: depositCents || 0,
          payment_status: paymentStatus,
        } as any);
        if (error) throw error;
      }
      toast.success(isCustom ? "Time blocked" : "Booking created");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            {isCustom ? <><Lock className="h-5 w-5" /> Block time / custom</> : <>New booking</>}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-3">
            <span>{isCustom ? "Internal only — no customer notification." : "We've pre-filled what we already know."}</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={isCustom} onCheckedChange={setIsCustom} />
              Custom
            </label>
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          {wizardSteps.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-secondary")} />
          ))}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-1">
          Step {stepIndex + 1} of {wizardSteps.length}
        </div>

        {/* Summary */}
        {step !== "confirm" && (customerLabel || service || staff || time || (isCustom && customTitle)) && (
          <Summary
            isCustom={isCustom}
            customerOrTitle={isCustom ? customTitle || null : customerLabel}
            service={isCustom ? customService : service}
            staff={staff}
            time={time}
            onJump={(s) => setStep(s)}
          />
        )}

        {loadingPrefill && (
          <div className="py-6 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingPrefill && !isCustom && step === "customer" && (
          <CustomerStep
            businessId={businessId}
            onPick={(c) => { setCustomer(c); setNewCust(null); setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time })); }}
            onCreate={(c) => { setNewCust(c); setCustomer(null); setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time })); }}
          />
        )}

        {!loadingPrefill && !isCustom && step === "service" && (
          <ServiceStep
            businessId={businessId}
            current={service}
            onBack={() => setStep("customer")}
            onPick={(svc) => { setService(svc); setStep(firstMissing({ hasCustomer: !!(customer || newCust), hasService: true, hasStaff: !!staff, hasTime: !!time })); }}
          />
        )}

        {!loadingPrefill && isCustom && step === "custom" && (
          <CustomStep
            title={customTitle} setTitle={setCustomTitle}
            color={customColor} setColor={setCustomColor}
            duration={customDuration} setDuration={setCustomDuration}
            onNext={() => setStep("staff")}
          />
        )}

        {!loadingPrefill && (step === "staff") && (isCustom ? customService : service) && (
          <StaffStep
            businessId={businessId}
            service={(isCustom ? customService : service)!}
            current={staff}
            allowAny={isCustom}
            onBack={() => setStep(isCustom ? "custom" : "service")}
            onPick={(st) => { setStaff(st); setStep(firstMissing({ hasCustomer: isCustom || !!(customer || newCust), hasService: true, hasStaff: true, hasTime: !!time })); }}
          />
        )}

        {!loadingPrefill && step === "slot" && staff && (isCustom ? customService : service) && (
          <SlotStep
            businessId={businessId}
            staff={staff}
            service={(isCustom ? customService : service)!}
            date={date}
            setDate={setDate}
            onBack={() => setStep("staff")}
            onPick={(iso) => { setTime(iso); setStep(isCustom ? "confirm" : "payment"); }}
          />
        )}

        {!loadingPrefill && !isCustom && step === "payment" && service && (
          <PaymentStep
            price={service.price_cents}
            deposit={depositCents}
            setDeposit={setDepositCents}
            status={paymentStatus}
            setStatus={setPaymentStatus}
            onBack={() => setStep("slot")}
            onNext={() => setStep("confirm")}
          />
        )}

        {!loadingPrefill && step === "confirm" && ((isCustom && canConfirmCustom) || (!isCustom && canConfirmRegular)) && (
          <div className="space-y-4">
            <Summary
              isCustom={isCustom}
              customerOrTitle={isCustom ? customTitle : customerLabel}
              service={isCustom ? customService : service}
              staff={staff}
              time={time}
              onJump={(s) => setStep(s)}
            />
            {isCustom && (
              <div className="rounded-xl border-dashed border-2 p-3 bg-secondary/30 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Custom bookings are only visible to your team.
              </div>
            )}
            <div>
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" placeholder="Optional…" />
            </div>
            {!isCustom && (
              <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
                <div>
                  <Label className="text-sm">Send confirmation</Label>
                  <p className="text-xs text-muted-foreground">Email/SMS the customer when integrations are connected.</p>
                </div>
                <Switch checked={notify} onCheckedChange={setNotify} />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep(isCustom ? "slot" : "payment")}>Back</Button>
              <Button disabled={submitting} onClick={submit}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isCustom ? "Block time" : "Create booking"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function firstMissing(s: { hasCustomer: boolean; hasService: boolean; hasStaff: boolean; hasTime: boolean }): Step {
  if (!s.hasCustomer) return "customer";
  if (!s.hasService) return "service";
  if (!s.hasStaff) return "staff";
  if (!s.hasTime) return "slot";
  return "confirm";
}

function Summary({
  isCustom,
  customerOrTitle,
  service,
  staff,
  time,
  onJump,
}: {
  isCustom: boolean;
  customerOrTitle: string | null;
  service: Service | null;
  staff: Staff | null;
  time: string | null;
  onJump: (s: Step) => void;
}) {
  return (
    <div className="rounded-xl border bg-secondary/40 p-3 text-sm space-y-1.5">
      <SummaryRow k={isCustom ? "Title" : "Customer"} v={customerOrTitle} onEdit={() => onJump(isCustom ? "custom" : "customer")} />
      {!isCustom && (
        <SummaryRow
          k="Service"
          v={service ? `${service.name} · ${service.duration_minutes}m · ${fmtMoney(service.price_cents)}` : null}
          onEdit={() => onJump("service")}
        />
      )}
      {isCustom && service && (
        <SummaryRow k="Duration" v={`${service.duration_minutes} min`} onEdit={() => onJump("custom")} />
      )}
      <SummaryRow k="Staff" v={staff?.name ?? null} onEdit={() => onJump("staff")} />
      <SummaryRow
        k="When"
        v={time ? `${new Date(time).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} · ${fmtTime(time)}` : null}
        onEdit={() => onJump("slot")}
      />
    </div>
  );
}

function SummaryRow({ k, v, onEdit }: { k: string; v: string | null; onEdit: () => void }) {
  return (
    <div className="grid grid-cols-[72px_1fr_auto] gap-3 items-center">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`font-medium text-sm truncate ${v ? "" : "text-muted-foreground/60 italic"}`}>{v ?? "—"}</span>
      <button type="button" onClick={onEdit} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <Pencil className="h-3 w-3" /> {v ? "Change" : "Set"}
      </button>
    </div>
  );
}

function CustomStep({
  title, setTitle, color, setColor, duration, setDuration, onNext,
}: {
  title: string; setTitle: (v: string) => void;
  color: string; setColor: (v: string) => void;
  duration: number; setDuration: (v: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label>Title</Label>
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5 h-10" placeholder="e.g. Lunch, Training, Personal" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Duration (minutes)</Label>
          <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 30)} className="mt-1.5 h-10" />
        </div>
        <div>
          <Label>Colour</Label>
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            {CUSTOM_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={cn("h-8 w-8 rounded-full border-2 transition-transform", color === c ? "border-foreground scale-110" : "border-transparent")}
                style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </div>
      </div>
      <Button className="w-full" disabled={!title.trim()} onClick={onNext}>Continue</Button>
    </div>
  );
}

function PaymentStep({
  price, deposit, setDeposit, status, setStatus, onBack, onNext,
}: {
  price: number;
  deposit: number; setDeposit: (v: number) => void;
  status: "unpaid" | "deposit" | "paid"; setStatus: (v: "unpaid" | "deposit" | "paid") => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payment</Label>
      <div className="rounded-xl border p-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Service price</span>
        <span className="tabular-nums font-medium">{fmtMoney(price)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["unpaid", "deposit", "paid"] as const).map((v) => (
          <button key={v} onClick={() => setStatus(v)}
            className={cn("h-11 rounded-xl border text-xs font-medium capitalize", status === v ? "border-primary bg-primary/5 text-primary" : "bg-card text-muted-foreground hover:bg-secondary/40")}>
            {v}
          </button>
        ))}
      </div>
      {status === "deposit" && (
        <div>
          <Label>Deposit amount (in cents)</Label>
          <Input type="number" min={0} value={deposit} onChange={(e) => setDeposit(parseInt(e.target.value) || 0)} className="mt-1.5 h-10" />
          <p className="text-[11px] text-muted-foreground mt-1">Currently {fmtMoney(deposit)} of {fmtMoney(price)}.</p>
        </div>
      )}
      <Button className="w-full" onClick={onNext}>Continue</Button>
    </div>
  );
}

function CustomerStep({
  businessId, onPick, onCreate,
}: {
  businessId: string;
  onPick: (c: Customer) => void;
  onCreate: (c: { name: string; email: string; phone: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const { data: results, isLoading } = useQuery({
    queryKey: ["customer-search", businessId, q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = q.trim();
      const { data, error } = await supabase.from("customers").select("id, name, email, phone").eq("business_id", businessId).or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(8);
      if (error) throw error;
      return data as Customer[];
    },
  });

  if (creating) {
    return (
      <div className="space-y-3">
        <button onClick={() => setCreating(false)} className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" /> Back to search
        </button>
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-10" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-10" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-10" />
          </div>
        </div>
        <Button className="w-full" disabled={!form.name} onClick={() => onCreate(form)}>Continue</Button>
        <p className="text-[11px] text-muted-foreground text-center">We'll auto-merge with an existing customer if email or phone matches.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input autoFocus placeholder="Search by name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-11" />
      </div>
      <Button variant="outline" className="w-full justify-start" onClick={() => setCreating(true)}>
        <UserPlus className="h-4 w-4 mr-2" /> New customer
      </Button>
      {q.trim().length >= 2 && (
        <div className="rounded-xl border bg-card divide-y max-h-72 overflow-y-auto">
          {isLoading && <div className="p-4"><Skeleton className="h-8 w-full" /></div>}
          {!isLoading && results?.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">No matches — create new customer above.</div>
          )}
          {results?.map((c) => (
            <button key={c.id} onClick={() => onPick(c)} className="w-full text-left px-4 py-3 hover:bg-secondary/60 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">{c.name[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? "—"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceStep({
  businessId, current, onBack, onPick,
}: {
  businessId: string; current: Service | null; onBack: () => void; onPick: (svc: Service) => void;
}) {
  const { data: services, isLoading } = useQuery({
    queryKey: ["wi-services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color").eq("business_id", businessId).eq("active", true).order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service</Label>
      {isLoading && <Skeleton className="h-12 w-full" />}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {services?.map((s) => (
          <button key={s.id} onClick={() => onPick(s)}
            className={`w-full text-left rounded-xl border p-3 hover:bg-secondary/40 flex items-center justify-between ${current?.id === s.id ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div>
              <div className="font-medium text-sm">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.duration_minutes} min</div>
            </div>
            <div className="text-sm tabular-nums">{fmtMoney(s.price_cents)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StaffStep({
  businessId, service, current, onBack, onPick, allowAny,
}: {
  businessId: string; service: Service; current: Staff | null; onBack: () => void; onPick: (st: Staff) => void; allowAny?: boolean;
}) {
  const { data: staffList, isLoading } = useQuery({
    queryKey: ["wi-staff", businessId, service.id, allowAny],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (!allowAny) {
        const linked = await supabase.from("service_staff").select("staff_id").eq("service_id", service.id);
        if (linked.data && linked.data.length > 0) ids = linked.data.map((r) => r.staff_id);
      }
      let q = supabase.from("staff").select("id, name").eq("business_id", businessId).eq("active", true);
      if (ids) q = q.in("id", ids);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data as Staff[];
    },
  });
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Staff</Label>
      {isLoading && <Skeleton className="h-12 w-full" />}
      {!isLoading && staffList?.length === 0 && (
        <p className="text-sm text-muted-foreground">No staff assigned to this service.</p>
      )}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {staffList?.map((s) => (
          <button key={s.id} onClick={() => onPick(s)}
            className={`w-full text-left rounded-xl border p-3 hover:bg-secondary/40 flex items-center gap-3 ${current?.id === s.id ? "border-primary bg-primary/5" : "bg-card"}`}>
            <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">{s.name[0]?.toUpperCase()}</div>
            <div className="font-medium text-sm">{s.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotStep({
  businessId, staff, service, date, setDate, onBack, onPick,
}: {
  businessId: string; staff: Staff; service: Service; date: Date; setDate: (d: Date) => void; onBack: () => void; onPick: (iso: string) => void;
}) {
  const { slots, isLoading } = useAvailableSlots({ businessId, staffId: staff.id, service, date });
  const days = useMemo(() => buildDateStrip(14), []);
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
        {days.map((d) => {
          const sel = d.toDateString() === date.toDateString();
          return (
            <button key={d.toISOString()} onClick={() => setDate(d)}
              className={`shrink-0 flex flex-col items-center min-w-[52px] py-2 rounded-xl text-xs transition-all ${sel ? "bg-primary text-primary-foreground" : "bg-secondary/50 hover:bg-secondary"}`}>
              <span className="uppercase tracking-wider text-[10px] opacity-80">{d.toLocaleDateString([], { weekday: "short" })}</span>
              <span className="font-display text-base mt-0.5 tabular-nums">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      {isLoading && (
        <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-10 rounded-xl" />))}</div>
      )}
      {!isLoading && slots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No availability on this day.</p>
      )}
      {!isLoading && slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
          {slots.map((s) => (
            <button key={s.iso} onClick={() => onPick(s.iso)} className="h-10 rounded-xl border bg-card hover:bg-primary hover:text-primary-foreground hover:border-transparent text-sm tabular-nums transition-colors">
              {s.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
