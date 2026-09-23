import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserPlus, ChevronLeft, ChevronRight, Pencil, Sparkles, Lock } from "lucide-react";
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
import { useAvailableSlots } from "@/lib/slots";
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
  gap_min?: number | null;
  active_after_min?: number | null;
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
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "deposit_paid" | "paid">("unpaid");

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
    let cancelled = false;
    setCustomer(null); setNewCust(null); setService(null); setStaff(null);
    setTime(null); setNotes(""); setDepositCents(0); setPaymentStatus("unpaid");
    const baseDate = prefill?.isoTime ? new Date(prefill.isoTime) : prefill?.date ? new Date(prefill.date) : new Date();
    if (baseDate) { const d = new Date(baseDate); d.setHours(0, 0, 0, 0); setDate(d); }
    if (prefill?.isoTime) setTime(prefill.isoTime);

    const hasAnyId = !!(prefill?.staffId || prefill?.serviceId || prefill?.customerId);
    if (!hasAnyId) {
      setStep(firstMissing({ hasCustomer: false, hasService: false, hasStaff: false, hasTime: !!prefill?.isoTime }));
      return;
    }
    setLoadingPrefill(true);
    (async () => {
      const staffRes = prefill?.staffId ? await supabase.from("staff").select("id, name, business_id").eq("id", prefill.staffId).eq("active", true).maybeSingle() : { data: null };
      const targetBusinessId = staffRes.data?.business_id ?? businessId;
      const [svcRes, custRes] = await Promise.all([
        prefill?.serviceId ? supabase.from("services").select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color, gap_min, active_after_min").eq("id", prefill.serviceId).eq("business_id", targetBusinessId).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
        prefill?.customerId && targetBusinessId === businessId ? supabase.from("customers").select("id, name, email, phone").eq("id", prefill.customerId).eq("business_id", businessId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      let st = staffRes?.data ? { id: staffRes.data.id, name: staffRes.data.name, business_id: staffRes.data.business_id } : null;
      let sv = svcRes?.data as Service | null;
      const cu = custRes?.data as Customer | null;
      if (st && sv) {
        const links = await supabase.from("service_staff").select("staff_id").eq("service_id", sv.id);
        if (links.error || (links.data?.length && !links.data.some((link) => link.staff_id === st!.id))) st = null;
      }
      if (cancelled) return;
      if (st) setStaff(st);
      // Keep a professional's service out of a salon-scoped fallback flow.
      if (!st && targetBusinessId !== businessId) sv = null;
      if (sv) setService(sv);
      if (cu) setCustomer(cu);
      setLoadingPrefill(false);
      setStep(firstMissing({ hasCustomer: !!cu, hasService: !!sv, hasStaff: !!st, hasTime: !!prefill?.isoTime }));
    })();
    return () => { cancelled = true; };
  }, [open, prefill, businessId]);

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
        const { error } = await supabase.rpc("create_staff_booking", {
          p_business_id: targetBiz,
          p_service_id: null,
          p_staff_id: staff!.id,
          p_customer_id: null,
          p_customer_name: customTitle,
          p_customer_email: null,
          p_customer_phone: null,
          p_starts_at: starts_at,
          p_ends_at: ends_at,
          p_price_cents: 0,
          p_amount_paid_cents: 0,
          p_amount_due_cents: 0,
          p_notes: notes || null,
          p_source: "walkin",
          p_notify_customer: false,
          p_is_custom: true,
          p_custom_title: customTitle,
          p_custom_color: customColor,
          p_status: "confirmed",
          p_gap_min: null,
          p_active_after_min: null,
        });
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
        const gapMin = service!.gap_min ?? 0;
        const activeAfterMin = service!.active_after_min ?? 0;
        const totalMin = service!.duration_minutes + gapMin + activeAfterMin;
        const ends_at = new Date(new Date(starts_at).getTime() + totalMin * 60000).toISOString();
        // amount_paid_cents is what was actually collected; amount_due_cents
        // is what's left owing. The deposit input is money collected now,
        // so it belongs in amount_paid_cents, not amount_due_cents.
        const amountPaid = paymentStatus === "paid" ? service!.price_cents : paymentStatus === "deposit_paid" ? (depositCents || 0) : 0;
        const amountDue = Math.max(0, service!.price_cents - amountPaid);
        const { data: bookingId, error } = await supabase.rpc("create_staff_booking", {
          p_business_id: targetBiz,
          p_service_id: service!.id,
          p_staff_id: staff!.id,
          p_customer_id: isCrossBiz ? null : custId,
          p_customer_name: custName,
          p_customer_email: custEmail,
          p_customer_phone: custPhone,
          p_starts_at: starts_at,
          p_ends_at: ends_at,
          p_price_cents: service!.price_cents,
          p_amount_paid_cents: amountPaid,
          p_amount_due_cents: amountDue,
          p_notes: notes || null,
          p_source: "walkin",
          p_notify_customer: notify,
          p_is_custom: false,
          p_custom_title: null,
          p_custom_color: null,
          p_status: "confirmed",
          p_gap_min: service!.gap_min ?? null,
          p_active_after_min: service!.active_after_min ?? null,
          p_payment_status: paymentStatus,
        });
        if (error) throw error;
        if (notify && custEmail && bookingId) {
          // Best-effort — the sweep backstop in /api/cron/send-reminders
          // catches it if this call is dropped.
          fetch("/api/bookings/send-confirmation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ booking_id: bookingId }),
          }).catch(() => {});
        }
      }
      toast.success(isCustom ? "Time blocked" : "Booking created");
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message?.includes("SLOT_TAKEN") ? "That time was just booked — pick another slot." : e.message ?? "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-5 sm:p-6 gap-3 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1">
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            {isCustom ? <><Lock className="h-4 w-4" /> Block time / custom</> : <>New booking</>}
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
        <div className="shrink-0 flex items-center gap-1.5">
          {wizardSteps.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", i <= stepIndex ? "bg-primary" : "bg-secondary")} />
          ))}
        </div>
        <div className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground -mt-2">
          Step {stepIndex + 1} of {wizardSteps.length}
        </div>

        {/* Summary — compact reference info, not the main event */}
        {step !== "confirm" && (customerLabel || service || staff || time || (isCustom && customTitle)) && (
          <div className="shrink-0">
            <Summary
              isCustom={isCustom}
              customerOrTitle={isCustom ? customTitle || null : customerLabel}
              service={isCustom ? customService : service}
              staff={staff}
              time={time}
              onJump={(s) => setStep(s)}
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">

        {loadingPrefill && (
          <div className="py-6 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingPrefill && !isCustom && step === "customer" && (
          <CustomerStep
            businessId={businessId}
            crossBusiness={!!(staff?.business_id && staff.business_id !== businessId)}
            onPick={(c) => { setCustomer(c); setNewCust(null); setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time })); }}
            onCreate={(c) => { setNewCust(c); setCustomer(null); setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time })); }}
          />
        )}

        {!loadingPrefill && !isCustom && step === "service" && (
          <ServiceStep
            businessId={staff?.business_id ?? businessId}
            customerId={staff?.business_id && staff.business_id !== businessId ? undefined : customer?.id}
            current={service}
            onReuse={(svc, previousStaff) => {
              setService(svc); setStaff(previousStaff); setTime(null);
              setDepositCents(0); setPaymentStatus("unpaid");
              setStep(previousStaff ? "slot" : "staff");
            }}
            onBack={() => setStep("customer")}
            onPick={(svc) => { setService(svc); setTime(null); setDepositCents(0); setPaymentStatus("unpaid"); setStep("staff"); }}
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
            businessId={staff?.business_id ?? businessId}
            service={(isCustom ? customService : service)!}
            current={staff}
            allowAny={isCustom}
            onBack={() => setStep(isCustom ? "custom" : "service")}
            onPick={(st) => {
              setStaff(st);
              setTime(null);
              const next = firstMissing({ hasCustomer: isCustom || !!(customer || newCust), hasService: true, hasStaff: true, hasTime: false });
              setStep(isCustom && next === "payment" ? "confirm" : next);
            }}
          />
        )}

        {!loadingPrefill && step === "slot" && staff && (isCustom ? customService : service) && (
          <SlotStep
            businessId={staff?.business_id ?? businessId}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function firstMissing(s: { hasCustomer: boolean; hasService: boolean; hasStaff: boolean; hasTime: boolean }): Step {
  if (!s.hasCustomer) return "customer";
  if (!s.hasService) return "service";
  if (!s.hasStaff) return "staff";
  if (!s.hasTime) return "slot";
  return "payment";
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
    <div className="rounded-lg border bg-secondary/40 px-2.5 py-1.5 text-sm">
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
        last
      />
    </div>
  );
}

function SummaryRow({ k, v, onEdit, last }: { k: string; v: string | null; onEdit: () => void; last?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[64px_1fr_auto] gap-2 items-center py-1", !last && "border-b border-border/60")}>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</span>
      <span className={`font-medium text-xs truncate ${v ? "" : "text-muted-foreground/60 italic"}`}>{v ?? "—"}</span>
      <button type="button" onClick={onEdit} className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0">
        <Pencil className="h-2.5 w-2.5" /> {v ? "Change" : "Set"}
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
  status: "unpaid" | "deposit_paid" | "paid"; setStatus: (v: "unpaid" | "deposit_paid" | "paid") => void;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground flex w-fit items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payment</Label>
      <div className="rounded-xl border p-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Service price</span>
        <span className="tabular-nums font-medium">{fmtMoney(price)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["unpaid", "deposit_paid", "paid"] as const).map((v) => (
          <button key={v} onClick={() => setStatus(v)}
            className={cn("h-11 rounded-xl border text-xs font-medium capitalize", status === v ? "border-primary bg-primary/5 text-primary" : "bg-card text-muted-foreground hover:bg-secondary/40")}>
            {v === "deposit_paid" ? "Deposit" : v}
          </button>
        ))}
      </div>
      {status === "deposit_paid" && (
        <div>
          <Label>Deposit amount ($)</Label>
          <Input type="number" min={0} max={price / 100} step="0.01" value={deposit / 100} onChange={(e) => setDeposit(Math.max(0, Math.min(price, Math.round((parseFloat(e.target.value) || 0) * 100))))} className="mt-1.5 h-10" />
          <p className="text-[11px] text-muted-foreground mt-1">Currently {fmtMoney(deposit)} of {fmtMoney(price)}.</p>
        </div>
      )}
      <Button className="w-full" onClick={onNext}>Continue</Button>
    </div>
  );
}

function CustomerStep({
  businessId, crossBusiness, onPick, onCreate,
}: {
  businessId: string;
  crossBusiness?: boolean;
  onPick: (c: Customer) => void;
  onCreate: (c: { name: string; email: string; phone: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(!!crossBusiness);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });

  const { data: results, isLoading } = useQuery({
    queryKey: ["customer-search", businessId, q],
    enabled: !crossBusiness && q.trim().length >= 2,
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
          <Label htmlFor="booking-customer-name">Name</Label>
          <Input id="booking-customer-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-10" autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="booking-customer-email">Email</Label>
            <Input id="booking-customer-email" autoComplete="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-10" />
          </div>
          <div>
            <Label htmlFor="booking-customer-phone">Phone</Label>
            <Input id="booking-customer-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-10" />
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
        <Input autoFocus aria-label="Search customers by name, email or phone" placeholder="Search by name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-11" />
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
  businessId, customerId, current, onBack, onPick, onReuse,
}: {
  businessId: string; current: Service | null; onBack: () => void; onPick: (svc: Service) => void;
  customerId?: string;
  onReuse: (svc: Service, staff: Staff | null) => void;
}) {
  const [q, setQ] = useState("");
  const { data: services, isLoading } = useQuery({
    queryKey: ["wi-services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color, gap_min, active_after_min").eq("business_id", businessId).eq("active", true).order("name");
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: lastVisit, isError: historyUnavailable } = useQuery({
    queryKey: ["booking-last-completed-visit", businessId, customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data: visit, error } = await supabase.from("bookings")
        .select("service_id, staff_id, starts_at")
        .eq("business_id", businessId).eq("customer_id", customerId!)
        .eq("status", "completed").eq("is_custom", false)
        .order("starts_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!visit?.service_id) return null;
      const [staffResult, links] = await Promise.all([
        supabase.from("staff").select("id, name, business_id")
          .eq("id", visit.staff_id).eq("business_id", businessId).eq("active", true).maybeSingle(),
        supabase.from("service_staff").select("staff_id").eq("service_id", visit.service_id),
      ]);
      if (staffResult.error || links.error) throw staffResult.error ?? links.error;
      const previousStaff = staffResult.data;
      const eligible = previousStaff && (!links.data.length || links.data.some((link) => link.staff_id === previousStaff.id));
      return { ...visit, staff: eligible ? previousStaff : null };
    },
  });
  const previousService = services?.find((item) => item.id === lastVisit?.service_id);

  // Filtered client-side: the whole active service list is already loaded,
  // and salons with long menus (colour variants, add-ons) otherwise mean a
  // lot of scrolling to find one item.
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? (services ?? []).filter((s) => s.name.toLowerCase().includes(needle))
    : services ?? [];

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground flex w-fit items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Service</Label>
      {lastVisit && previousService && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <p className="text-sm font-medium">Same as their last visit?</p>
          <p className="text-sm">{previousService.name}{lastVisit.staff ? ` with ${lastVisit.staff.name}` : ""}</p>
          <p className="text-xs text-muted-foreground">{previousService.duration_minutes} min · {fmtMoney(previousService.price_cents)} at today's price. Choose a fresh available time next.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => onReuse(previousService, lastVisit.staff)}>
            {lastVisit.staff ? "Use service & stylist" : "Use service, choose stylist"}
          </Button>
        </div>
      )}
      {historyUnavailable && <p className="text-xs text-muted-foreground">Previous visit unavailable — you can still choose any service below.</p>}
      {(services?.length ?? 0) > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            aria-label="Search services"
            placeholder="Search services…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
      )}
      {isLoading && <Skeleton className="h-12 w-full" />}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground text-center">
          {needle ? "No services match that search." : "No active services yet."}
        </div>
      )}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {filtered.map((s) => (
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
        if (linked.error) throw linked.error;
        if (linked.data && linked.data.length > 0) ids = linked.data.map((r) => r.staff_id);
      }
      let q = supabase.from("staff").select("id, name, business_id").eq("business_id", businessId).eq("active", true);
      if (ids) q = q.in("id", ids);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data as Staff[];
    },
  });
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground flex w-fit items-center gap-1">
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function SlotStep({
  businessId, staff, service, date, setDate, onBack, onPick,
}: {
  businessId: string; staff: Staff; service: Service; date: Date; setDate: (d: Date) => void; onBack: () => void; onPick: (iso: string) => void;
}) {
  const { slots, isLoading } = useAvailableSlots({ businessId, staffId: staff.id, service, date });

  // 7-day week view with prev/next nav, instead of a 14-pill strip that
  // forced horizontal scrolling — grid-cols-7 with no fixed pill width
  // always fits the modal, at any width. Starts on whichever week already
  // contains the selected/prefilled date.
  const [weekStart, setWeekStart] = useState(() => {
    const today = startOfToday();
    return date >= today ? date : today;
  });
  const week = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);
  const canGoPrev = weekStart > startOfToday();
  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d < startOfToday() ? startOfToday() : d);
  };
  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5">
      <button onClick={onBack} className="shrink-0 w-fit text-xs text-muted-foreground inline-flex items-center gap-1">
        <ChevronLeft className="h-3 w-3" /> Back
      </button>

      <div className="shrink-0 flex flex-wrap gap-2" aria-label="Jump to a booking date">
        {[0, 2, 4, 6, 8].map((weeks) => (
          <Button key={weeks} type="button" size="sm" variant="outline" onClick={() => {
            const next = startOfToday();
            next.setDate(next.getDate() + weeks * 7);
            setWeekStart(next);
            setDate(next);
          }}>
            {weeks === 0 ? "Today" : `In ${weeks} weeks`}
          </Button>
        ))}
      </div>
      <p className="text-sm font-medium" aria-live="polite">
        {date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
      <div className="shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={prevWeek}
          disabled={!canGoPrev}
          aria-label="Previous week"
          className="h-8 w-6 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const sel = d.toDateString() === date.toDateString();
            return (
              <button key={d.toISOString()} onClick={() => setDate(d)}
                className={`flex flex-col items-center py-1.5 rounded-lg text-xs transition-all ${sel ? "bg-primary text-primary-foreground" : "bg-secondary/50 hover:bg-secondary"}`}>
                <span className="uppercase tracking-wider text-[9px] opacity-80">{d.toLocaleDateString([], { weekday: "short" })}</span>
                <span className="font-display text-sm mt-0.5 tabular-nums">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={nextWeek}
          aria-label="Next week"
          className="h-8 w-6 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-10 rounded-xl" />))}</div>
      )}
      {!isLoading && slots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No availability on this day.</p>
      )}
      {!isLoading && slots.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto content-start grid grid-cols-3 sm:grid-cols-4 gap-2 pr-0.5">
          {slots.map((s) => (
            <button key={s.iso} onClick={() => onPick(s.iso)} className="h-9 rounded-lg border bg-card hover:bg-primary hover:text-primary-foreground hover:border-transparent text-sm tabular-nums transition-colors">
              {s.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
