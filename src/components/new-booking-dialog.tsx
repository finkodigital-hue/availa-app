import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserPlus, ChevronLeft, Pencil } from "lucide-react";
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
type Staff = { id: string; name: string };

type Step = "customer" | "service" | "staff" | "slot" | "confirm";

type Prefill = {
  staffId?: string;
  date?: Date;
  isoTime?: string;
  serviceId?: string;
  customerId?: string;
};

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
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCust, setNewCust] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  // Apply prefill when dialog opens. Resolve any prefilled IDs in parallel
  // then jump straight to the first missing piece of information.
  useEffect(() => {
    if (!open) {
      setStep("customer");
      setCustomer(null);
      setNewCust(null);
      setService(null);
      setStaff(null);
      setTime(null);
      setNotes("");
      setNotify(true);
      setLoadingPrefill(false);
      return;
    }

    const baseDate = prefill?.isoTime
      ? new Date(prefill.isoTime)
      : prefill?.date
      ? new Date(prefill.date)
      : null;
    if (baseDate) {
      const d = new Date(baseDate);
      d.setHours(0, 0, 0, 0);
      setDate(d);
    }
    if (prefill?.isoTime) setTime(prefill.isoTime);

    const hasAnyId = !!(prefill?.staffId || prefill?.serviceId || prefill?.customerId);
    if (!hasAnyId) {
      setStep(firstMissing({ hasCustomer: false, hasService: false, hasStaff: false, hasTime: !!prefill?.isoTime }));
      return;
    }

    setLoadingPrefill(true);
    (async () => {
      const [staffRes, svcRes, custRes] = await Promise.all([
        prefill?.staffId
          ? supabase.from("staff").select("id, name").eq("id", prefill.staffId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        prefill?.serviceId
          ? supabase
              .from("services")
              .select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color")
              .eq("id", prefill.serviceId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        prefill?.customerId
          ? supabase
              .from("customers")
              .select("id, name, email, phone")
              .eq("id", prefill.customerId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      const st = staffRes?.data ? { id: staffRes.data.id, name: staffRes.data.name } : null;
      const sv = svcRes?.data as Service | null;
      const cu = custRes?.data as Customer | null;
      if (st) setStaff(st);
      if (sv) setService(sv);
      if (cu) setCustomer(cu);
      setLoadingPrefill(false);
      setStep(
        firstMissing({
          hasCustomer: !!cu,
          hasService: !!sv,
          hasStaff: !!st,
          hasTime: !!prefill?.isoTime,
        }),
      );
    })();
  }, [open, prefill]);

  const customerLabel = customer?.name ?? newCust?.name ?? null;
  const canConfirm = !!(service && staff && time && (customer || newCust));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">New booking</DialogTitle>
          <DialogDescription>
            We've pre-filled what we already know — only the missing details below.
          </DialogDescription>
        </DialogHeader>

        {/* Inline summary of everything already chosen, with quick edit buttons */}
        {(customerLabel || service || staff || time) && step !== "confirm" && (
          <Summary
            customer={customerLabel}
            service={service}
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

        {!loadingPrefill && step === "customer" && (
          <CustomerStep
            businessId={businessId}
            onPick={(c) => {
              setCustomer(c);
              setNewCust(null);
              setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time }));
            }}
            onCreate={(c) => {
              setNewCust(c);
              setCustomer(null);
              setStep(firstMissing({ hasCustomer: true, hasService: !!service, hasStaff: !!staff, hasTime: !!time }));
            }}
          />
        )}

        {!loadingPrefill && step === "service" && (
          <ServiceStep
            businessId={businessId}
            current={service}
            onBack={() => setStep("customer")}
            onPick={(svc) => {
              setService(svc);
              // If staff already chosen and still valid, keep it
              setStep(firstMissing({ hasCustomer: !!(customer || newCust), hasService: true, hasStaff: !!staff, hasTime: !!time }));
            }}
          />
        )}

        {!loadingPrefill && step === "staff" && service && (
          <StaffStep
            businessId={businessId}
            service={service}
            current={staff}
            onBack={() => setStep("service")}
            onPick={(st) => {
              setStaff(st);
              setStep(firstMissing({ hasCustomer: !!(customer || newCust), hasService: true, hasStaff: true, hasTime: !!time }));
            }}
          />
        )}

        {!loadingPrefill && step === "slot" && service && staff && (
          <SlotStep
            businessId={businessId}
            staff={staff}
            service={service}
            date={date}
            setDate={setDate}
            onBack={() => setStep("staff")}
            onPick={(iso) => {
              setTime(iso);
              setStep("confirm");
            }}
          />
        )}

        {!loadingPrefill && step === "confirm" && canConfirm && service && staff && time && (
          <div className="space-y-4">
            <Summary
              customer={customerLabel}
              service={service}
              staff={staff}
              time={time}
              onJump={(s) => setStep(s)}
            />
            <div>
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5" placeholder="Optional…" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
              <div>
                <Label className="text-sm">Send confirmation</Label>
                <p className="text-xs text-muted-foreground">Email/SMS the customer when integrations are connected.</p>
              </div>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("slot")}>Back</Button>
              <Button
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    let custId = customer?.id ?? null;
                    let custName = customer?.name ?? newCust?.name ?? "Walk-in";
                    const custEmail = customer?.email ?? newCust?.email ?? null;
                    const custPhone = customer?.phone ?? newCust?.phone ?? null;
                    if (!custId && newCust) {
                      const phoneNorm = newCust.phone.replace(/\D/g, "") || null;
                      const orParts: string[] = [];
                      if (newCust.email) orParts.push(`email.ilike.${newCust.email}`);
                      if (phoneNorm) orParts.push(`phone_normalized.eq.${phoneNorm}`);
                      if (orParts.length) {
                        const { data: existing } = await supabase
                          .from("customers")
                          .select("id, name, email, phone")
                          .eq("business_id", businessId)
                          .or(orParts.join(","))
                          .limit(1);
                        if (existing && existing.length) {
                          custId = existing[0].id;
                          custName = existing[0].name;
                        }
                      }
                      if (!custId) {
                        const { data: ins, error } = await supabase
                          .from("customers")
                          .insert({
                            business_id: businessId,
                            name: newCust.name,
                            email: newCust.email || null,
                            phone: newCust.phone || null,
                          })
                          .select("id")
                          .single();
                        if (error) throw error;
                        custId = ins.id;
                      }
                    }
                    const starts_at = time;
                    const ends_at = new Date(
                      new Date(starts_at).getTime() + service.duration_minutes * 60000,
                    ).toISOString();
                    const { error } = await supabase.from("bookings").insert({
                      business_id: businessId,
                      service_id: service.id,
                      staff_id: staff.id,
                      customer_id: custId,
                      customer_name: custName,
                      customer_email: custEmail,
                      customer_phone: custPhone,
                      starts_at,
                      ends_at,
                      price_cents: service.price_cents,
                      notes: notes || null,
                      source: "walkin",
                      notify_customer: notify,
                    });
                    if (error) throw error;
                    toast.success("Booking created");
                    onCreated?.();
                    onOpenChange(false);
                  } catch (e: any) {
                    toast.error(e.message ?? "Could not create booking");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create booking
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
  customer,
  service,
  staff,
  time,
  onJump,
}: {
  customer: string | null;
  service: Service | null;
  staff: Staff | null;
  time: string | null;
  onJump: (s: Step) => void;
}) {
  return (
    <div className="rounded-xl border bg-secondary/40 p-3 text-sm space-y-1.5">
      <SummaryRow k="Customer" v={customer} onEdit={() => onJump("customer")} />
      <SummaryRow
        k="Service"
        v={service ? `${service.name} · ${service.duration_minutes}m · ${fmtMoney(service.price_cents)}` : null}
        onEdit={() => onJump("service")}
      />
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
      <span className={`font-medium text-sm truncate ${v ? "" : "text-muted-foreground/60 italic"}`}>
        {v ?? "—"}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <Pencil className="h-3 w-3" /> {v ? "Change" : "Set"}
      </button>
    </div>
  );
}

function CustomerStep({
  businessId,
  onPick,
  onCreate,
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
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("business_id", businessId)
        .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(8);
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
        <p className="text-[11px] text-muted-foreground text-center">
          We'll auto-merge with an existing customer if email or phone matches.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search by name, email or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 h-11"
        />
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
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="w-full text-left px-4 py-3 hover:bg-secondary/60 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                {c.name[0]?.toUpperCase()}
              </div>
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
  businessId,
  current,
  onBack,
  onPick,
}: {
  businessId: string;
  current: Service | null;
  onBack: () => void;
  onPick: (svc: Service) => void;
}) {
  const { data: services, isLoading } = useQuery({
    queryKey: ["wi-services", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes, price_cents, buffer_before_min, buffer_after_min, color")
        .eq("business_id", businessId)
        .eq("active", true)
        .order("name");
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
          <button
            key={s.id}
            onClick={() => onPick(s)}
            className={`w-full text-left rounded-xl border p-3 hover:bg-secondary/40 flex items-center justify-between ${
              current?.id === s.id ? "border-primary bg-primary/5" : "bg-card"
            }`}
          >
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
  businessId,
  service,
  current,
  onBack,
  onPick,
}: {
  businessId: string;
  service: Service;
  current: Staff | null;
  onBack: () => void;
  onPick: (st: Staff) => void;
}) {
  const { data: staffList, isLoading } = useQuery({
    queryKey: ["wi-staff", businessId, service.id],
    queryFn: async () => {
      const linked = await supabase.from("service_staff").select("staff_id").eq("service_id", service.id);
      let q = supabase.from("staff").select("id, name").eq("business_id", businessId).eq("active", true);
      if (linked.data && linked.data.length > 0) q = q.in("id", linked.data.map((r) => r.staff_id));
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
          <button
            key={s.id}
            onClick={() => onPick(s)}
            className={`w-full text-left rounded-xl border p-3 hover:bg-secondary/40 flex items-center gap-3 ${
              current?.id === s.id ? "border-primary bg-primary/5" : "bg-card"
            }`}
          >
            <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
              {s.name[0]?.toUpperCase()}
            </div>
            <div className="font-medium text-sm">{s.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotStep({
  businessId,
  staff,
  service,
  date,
  setDate,
  onBack,
  onPick,
}: {
  businessId: string;
  staff: Staff;
  service: Service;
  date: Date;
  setDate: (d: Date) => void;
  onBack: () => void;
  onPick: (iso: string) => void;
}) {
  const { slots, isLoading } = useAvailableSlots({
    businessId,
    staffId: staff.id,
    service,
    date,
  });
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
            <button
              key={d.toISOString()}
              onClick={() => setDate(d)}
              className={`shrink-0 flex flex-col items-center min-w-[52px] py-2 rounded-xl text-xs transition-all ${
                sel ? "bg-primary text-primary-foreground" : "bg-secondary/50 hover:bg-secondary"
              }`}
            >
              <span className="uppercase tracking-wider text-[10px] opacity-80">
                {d.toLocaleDateString([], { weekday: "short" })}
              </span>
              <span className="font-display text-base mt-0.5 tabular-nums">{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      {isLoading && (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      )}
      {!isLoading && slots.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No availability on this day.</p>
      )}
      {!isLoading && slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto">
          {slots.map((s) => (
            <button
              key={s.iso}
              onClick={() => onPick(s.iso)}
              className="h-10 rounded-xl border bg-card hover:bg-primary hover:text-primary-foreground hover:border-transparent text-sm tabular-nums transition-colors"
            >
              {s.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
