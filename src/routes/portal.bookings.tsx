import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Clock, MapPin, User as UserIcon, X, RotateCcw, Loader2,
  ChevronLeft, ChevronRight, Inbox, CheckCircle2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/format";
import { useAvailableSlots, buildDateStrip } from "@/lib/slots";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/bookings")({
  component: BookingsPage,
});

type Booking = {
  id: string;
  business_id: string;
  service_id: string;
  staff_id: string;
  customer_email: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  price_cents: number;
  notes: string | null;
  businesses: { id: string; name: string; slug: string; address: string | null; brand_color: string | null; cancellation_window_hours: number } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
  staff: { id: string; name: string } | null;
};

function BookingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/portal", replace: true });
  }, [loading, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-bookings", user?.email],
    enabled: !!user,
    queryFn: async () => {
      // bookings SELECT RLS OR-combines the customer-email-match policy
      // with is_business_owner()/salon_pro_permission() checks that can't
      // use the customer_email index — querying the table directly here
      // times out once it has real cross-tenant volume. This RPC applies
      // the one correct restriction directly instead of going through RLS.
      const { data, error } = await supabase.rpc("get_portal_bookings");
      if (error) throw error;
      return data as unknown as Booking[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: ["portal-bookings"] }); },
    onError: (e: any) => toast.error(e.message ?? "Could not cancel"),
  });

  const [rescheduleTarget, setRescheduleTarget] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = data ?? [];
    return {
      upcoming: list
        .filter((b) => new Date(b.starts_at).getTime() >= now && b.status !== "cancelled" && b.status !== "completed")
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
      past: list
        .filter((b) => new Date(b.starts_at).getTime() < now || b.status === "cancelled" || b.status === "completed")
        .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()),
    };
  }, [data]);

  if (loading || !user) return null;

  return (
    <div className="animate-rise">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl">Your bookings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage upcoming appointments or review your history. Signed in as {user.email}.
        </p>
      </div>

      <Tabs defaultValue="upcoming" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming {upcoming.length > 0 && <Badge variant="secondary" className="ml-2">{upcoming.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="past">History {past.length > 0 && <Badge variant="secondary" className="ml-2">{past.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-3">
          {isLoading && <SkeletonList />}
          {!isLoading && upcoming.length === 0 && (
            <EmptyState
              icon={Inbox}
              title="No upcoming bookings"
              body="When you book an appointment, it will appear here."
            />
          )}
          {upcoming.map((b) => (
            <BookingCard key={b.id} b={b} canManage onReschedule={() => setRescheduleTarget(b)} onCancel={() => setCancelTarget(b)} />
          ))}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          {isLoading && <SkeletonList />}
          {!isLoading && past.length === 0 && (
            <EmptyState icon={CalendarDays} title="No past bookings yet" body="Your booking history will live here." />
          )}
          {past.map((b) => <BookingCard key={b.id} b={b} canManage={false} />)}
        </TabsContent>
      </Tabs>

      <RescheduleDialog
        booking={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onDone={() => { setRescheduleTarget(null); qc.invalidateQueries({ queryKey: ["portal-bookings"] }); }}
      />

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  Your {cancelTarget.services?.name} on{" "}
                  {new Date(cancelTarget.starts_at).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}{" "}
                  with {cancelTarget.businesses?.name} will be cancelled. This can't be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep booking</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={async () => { if (cancelTarget) { await cancelMutation.mutateAsync(cancelTarget.id); setCancelTarget(null); } }}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function withinWindow(b: Booking): boolean {
  const win = b.businesses?.cancellation_window_hours ?? 24;
  return new Date(b.starts_at).getTime() - Date.now() > win * 3600_000;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    confirmed: { label: "Confirmed", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
    pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: Clock },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground line-through", Icon: X },
    completed: { label: "Completed", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", Icon: CheckCircle2 },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      <Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

function BookingCard({ b, canManage, onReschedule, onCancel }: { b: Booking; canManage: boolean; onReschedule?: () => void; onCancel?: () => void }) {
  const brand = b.businesses?.brand_color ?? "hsl(var(--primary))";
  const start = new Date(b.starts_at);
  const canModify = canManage && withinWindow(b) && b.status !== "cancelled" && b.status !== "completed";

  return (
    <div className="group rounded-2xl border bg-card p-5 sm:p-6 transition hover:shadow-elegant animate-rise">
      <div className="grid sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-6 items-start">
        <div
          className="hidden sm:flex h-16 w-16 rounded-xl shrink-0 flex-col items-center justify-center text-white shadow-sm"
          style={{ background: brand }}
        >
          <div className="text-[10px] uppercase tracking-wider opacity-80">{start.toLocaleDateString([], { month: "short" })}</div>
          <div className="font-display text-2xl leading-none">{start.getDate()}</div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-display text-lg truncate">{b.services?.name ?? "Service"}</h3>
            {statusBadge(b.status)}
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {start.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {" · "}{b.services?.duration_minutes ?? 0} min
            </div>
            <div className="flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              {b.staff?.name ?? "—"} at{" "}
              <Link to="/book/$slug" params={{ slug: b.businesses?.slug ?? "" }} className="text-foreground hover:underline">
                {b.businesses?.name}
              </Link>
            </div>
            {b.businesses?.address && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {b.businesses.address}
              </div>
            )}
          </div>
        </div>
        <div className="flex sm:flex-col items-stretch gap-2 sm:w-36">
          <div className="text-right font-medium sm:mb-1">{fmtMoney(b.price_cents)}</div>
          {canManage && canModify && (
            <>
              <Button size="sm" variant="outline" onClick={onReschedule}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reschedule
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onCancel}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
              </Button>
            </>
          )}
          {canManage && !canModify && b.status !== "cancelled" && (
            <div className="text-xs text-muted-foreground flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Within the {b.businesses?.cancellation_window_hours ?? 24}h window — contact the business.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
    </>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/40 p-16 text-center">
      <div className="h-12 w-12 mx-auto rounded-full bg-muted grid place-items-center mb-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">{body}</p>
    </div>
  );
}

function RescheduleDialog({ booking, onClose, onDone }: { booking: Booking | null; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [stripStart, setStripStart] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (booking) {
      const d = new Date(booking.starts_at); d.setHours(0, 0, 0, 0);
      setDate(d); setStripStart(0); setPicking(null);
    }
  }, [booking?.id]);

  const { slots, isLoading } = useAvailableSlots({
    businessId: booking?.business_id,
    staffId: booking?.staff_id,
    service: booking?.services ? { duration_minutes: booking.services.duration_minutes } : undefined,
    date,
    excludeBookingId: booking?.id,
  });

  const days = useMemo(() => buildDateStrip(28).slice(stripStart, stripStart + 7), [stripStart]);

  const submit = async () => {
    if (!booking || !picking) return;
    setSubmitting(true);
    try {
      const starts_at = picking;
      const ends_at = new Date(new Date(starts_at).getTime() + (booking.services?.duration_minutes ?? 30) * 60000).toISOString();
      const { data: clash } = await supabase.from("bookings").select("id").eq("staff_id", booking.staff_id).neq("status", "cancelled").neq("id", booking.id).lt("starts_at", ends_at).gt("ends_at", starts_at);
      if (clash && clash.length > 0) { toast.error("Slot just taken — pick another"); setPicking(null); return; }
      const { error } = await supabase.from("bookings").update({ starts_at, ends_at }).eq("id", booking.id);
      if (error) throw error;
      toast.success("Booking rescheduled");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not reschedule");
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => ({
    morning: slots.filter((s) => s.hour < 12),
    afternoon: slots.filter((s) => s.hour >= 12 && s.hour < 17),
    evening: slots.filter((s) => s.hour >= 17),
  }), [slots]);

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reschedule booking</DialogTitle>
          <DialogDescription>
            {booking && (
              <>
                {booking.services?.name} with {booking.staff?.name} at {booking.businesses?.name}.
                Currently: {new Date(booking.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date strip */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setStripStart(Math.max(0, stripStart - 7))} disabled={stripStart === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 grid grid-cols-7 gap-1.5">
              {days.map((d) => {
                const active = d.toDateString() === date.toDateString();
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => { setDate(d); setPicking(null); }}
                    className={`rounded-lg border p-2 text-center transition ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary/50"}`}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-70">
                      {d.toLocaleDateString([], { weekday: "short" })}
                    </div>
                    <div className="font-display text-base mt-0.5">{d.getDate()}</div>
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setStripStart(Math.min(21, stripStart + 7))} disabled={stripStart >= 21}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Slots */}
          <div className="min-h-[180px] max-h-[280px] overflow-y-auto pr-1">
            {isLoading && (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            )}
            {!isLoading && slots.length === 0 && (
              <div className="rounded-xl border border-dashed bg-card/40 p-8 text-center text-sm text-muted-foreground">
                No available times on this day. Try another date.
              </div>
            )}
            {!isLoading && slots.length > 0 && (
              <div className="space-y-4">
                {(["morning", "afternoon", "evening"] as const).map((part) =>
                  grouped[part].length > 0 ? (
                    <div key={part}>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{part}</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {grouped[part].map((s) => (
                          <button
                            key={s.iso}
                            onClick={() => setPicking(s.iso)}
                            className={`h-10 rounded-md border text-sm transition ${picking === s.iso ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary/50"}`}
                          >
                            {s.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!picking || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm new time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
