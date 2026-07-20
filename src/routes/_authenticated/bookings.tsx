import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Search, Filter, Clock, User as UserIcon, XCircle, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtMoney, fmtTime, BOOKING_STATUSES, statusMeta, type BookingStatus } from "@/lib/format";
import { startBalanceCheckout } from "@/lib/stripe-connect.functions";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

const STATUSES = ["all", ...BOOKING_STATUSES.map((s) => s.id)] as const;

function BookingsPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["bookings-list", bid, status, period],
    enabled: !!bid,
    queryFn: async () => {
      let qb = supabase.from("bookings").select("*, services(name, color), staff(name)").eq("business_id", bid!);
      const now = new Date().toISOString();
      if (period === "upcoming") qb = qb.gte("starts_at", now).order("starts_at", { ascending: true });
      else if (period === "past") qb = qb.lt("starts_at", now).order("starts_at", { ascending: false });
      else qb = qb.order("starts_at", { ascending: false });
      if (status !== "all") qb = qb.eq("status", status);
      const { data, error } = await qb.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setBookingStatus = async (id: string, next: BookingStatus) => {
    const { error } = await supabase.from("bookings").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${statusMeta(next).label}`);
    setSelected((s: any) => (s && s.id === id ? { ...s, status: next } : s));
    qc.invalidateQueries({ queryKey: ["bookings-list", bid] });
  };

  const collectBalance = async () => {
    if (!selected) return;
    try {
      const { checkoutUrl } = await startBalanceCheckout({ data: { bookingId: selected.id } });
      window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      toast.success("Balance checkout opened in a new tab.");
    } catch (error: any) {
      toast.error(error.message ?? "Could not start the balance payment.");
    }
  };

  const filtered = (data ?? []).filter((b: any) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      b.customer_name?.toLowerCase().includes(s) ||
      b.customer_email?.toLowerCase().includes(s) ||
      b.customer_phone?.toLowerCase().includes(s) ||
      b.services?.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader eyebrow="Bookings" title="All bookings" subtitle="Search, filter and review every appointment." />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customer, email, phone, service…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 h-10" />
        </div>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-[140px] h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v: any) => setStatus(v)}>
          <SelectTrigger className="w-[150px] h-10"><Filter className="h-3.5 w-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {BOOKING_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No bookings yet" description="They'll appear here as customers book." />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden divide-y">
          {filtered.map((b: any) => {
            const color = b.services?.color || "var(--gold-deep)";
            const meta = statusMeta(b.status);
            return (
              <div
                key={b.id}
                onClick={() => setSelected(b)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setSelected(b)}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors cursor-pointer"
              >
                <div className="w-1 h-10 rounded-full" style={{ background: color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{b.customer_name}</div>
                    <Badge
                      variant="outline"
                      className="capitalize text-[10px]"
                      style={{ background: meta.tint, color: meta.color, borderColor: meta.color }}
                    >
                      {meta.label}
                    </Badge>
                    {b.source === "walkin" && <Badge variant="secondary" className="text-[10px]">Walk-in</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {b.services?.name} · {b.staff?.name} · {new Date(b.starts_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} {fmtTime(b.starts_at)}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums">{fmtMoney(b.price_cents ?? 0)}</div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{selected?.customer_name}</DialogTitle>
            <DialogDescription>
              {selected && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Clock className="h-3 w-3" />
                  {new Date(selected.starts_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {fmtTime(selected.starts_at)} – {fmtTime(selected.ends_at)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Service</span>
                <span className="font-medium text-sm text-right">{selected.services?.name}</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">With</span>
                <span className="font-medium text-sm text-right inline-flex items-center gap-1 justify-end">
                  <UserIcon className="h-3 w-3" />
                  {selected.staff?.name}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Contact</span>
                <span className="font-medium text-sm text-right">{selected.customer_email || selected.customer_phone || "—"}</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Price</span>
                <span className="font-medium text-sm text-right">{fmtMoney(selected.price_cents ?? 0)}</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Paid</span>
                <span className="font-medium text-sm text-right">{fmtMoney(selected.amount_paid_cents ?? 0)}</span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Balance</span>
                <span className="font-medium text-sm text-right">{fmtMoney(Math.max(0, (selected.price_cents ?? 0) - (selected.amount_paid_cents ?? 0)))}</span>
              </div>
              {selected.source === "walkin" && (
                <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Source</span>
                  <span className="text-right"><Badge variant="secondary">Walk-in</Badge></span>
                </div>
              )}
              {selected.notes && (
                <div className="pt-2 mt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm text-pretty">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Change status</div>
              <div className="grid grid-cols-3 gap-1.5">
                {BOOKING_STATUSES.map((s) => {
                  const on = selected.status === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setBookingStatus(selected.id, s.id)}
                      className={`text-xs rounded-xl border px-2 py-1.5 transition-all ${on ? "ring-2 ring-offset-1 ring-offset-background font-medium" : "hover:bg-secondary/60"}`}
                      style={
                        on
                          ? { background: s.tint, color: s.color, borderColor: s.color, ["--tw-ring-color" as any]: s.color }
                          : { borderColor: "var(--color-border)" }
                      }
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle" style={{ background: s.color }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {selected && selected.payment_status !== "paid" && (selected.price_cents ?? 0) > (selected.amount_paid_cents ?? 0) && (
              <Button onClick={collectBalance} className="rounded-full">
                <CreditCard className="h-4 w-4 mr-1.5" /> Take remaining payment
              </Button>
            )}
            {selected && selected.status !== "cancelled" && (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" className="rounded-full">
                    <XCircle className="h-4 w-4 mr-1.5" /> Cancel booking
                  </Button>
                }
                title="Cancel this booking?"
                description="The customer will be notified if reminders are enabled."
                confirmLabel="Cancel booking"
                onConfirm={async () => { await setBookingStatus(selected.id, "cancelled"); setSelected(null); }}
              />
            )}
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
