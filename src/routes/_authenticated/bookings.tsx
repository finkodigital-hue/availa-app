import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  Search,
  Filter,
  Clock,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  fmtMoney as formatMoney,
  fmtTime,
  BOOKING_STATUSES,
  statusMeta,
  type BookingStatus,
} from "@/lib/format";
import { BookingBalanceCheckout } from "@/components/booking-balance-checkout";
import { BookingConsultationStatus } from "@/components/booking-consultation-status";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { BookingCustomerNotes } from "@/components/booking-customer-notes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/_authenticated/bookings")({
  validateSearch: (search: Record<string, unknown>): { bookingId?: string } => ({
    bookingId:
      typeof search.bookingId === "string" && UUID_PATTERN.test(search.bookingId)
        ? search.bookingId
        : undefined,
  }),
  component: BookingsPage,
});

const STATUSES = ["all", ...BOOKING_STATUSES.map((s) => s.id)] as const;
const PAGE_SIZE = 50;

function BookingsPage() {
  const { bookingId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: biz } = useMyBusiness();
  const fmtMoney = (cents: number) =>
    formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");
  const [selected, setSelected] = useState<any | null>(null);
  const [rebooking, setRebooking] = useState<{
    customerId: string;
    serviceId: string;
    staffId?: string;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLock = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const linkedBooking = useQuery({
    queryKey: ["booking-details", bid, bookingId],
    enabled: !!bid && !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(name, color), staff(name)")
        .eq("business_id", bid!)
        .eq("id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!bookingId || !bid || linkedBooking.isPending) return;
    if (linkedBooking.isError || !linkedBooking.data)
      toast.error(
        "This booking could not be opened. Try finding it in the list.",
      );
    else setSelected(linkedBooking.data);
    void navigate({ search: {}, replace: true });
  }, [
    bookingId,
    bid,
    linkedBooking.isPending,
    linkedBooking.isError,
    linkedBooking.data,
    navigate,
  ]);

  const refreshBookings = () => {
    for (const key of [
      "bookings-list",
      "booking-details",
      "calendar",
      "dashboard-overview",
    ]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
  const openRebooking = (booking: NonNullable<typeof selected>) => {
    setRebooking({
      customerId: booking.customer_id,
      serviceId: booking.service_id,
      staffId: booking.staff_id ?? undefined,
    });
    setSelected(null);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["bookings-list", bid, status, period, search, page],
    enabled: !!bid,
    queryFn: async () => {
      let qb = supabase
        .from("bookings")
        .select("*, services(name, color), staff(name)", { count: "exact" })
        .eq("business_id", bid!);
      if (search) {
        const { data: services, error: serviceError } = await supabase
          .from("services")
          .select("id")
          .eq("business_id", bid!)
          .ilike("name", `%${search}%`);
        if (serviceError) throw serviceError;
        // PostgREST's OR syntax requires quoted, escaped values. Service IDs
        // are UUIDs returned by the database, so they are safe in the IN list.
        const pattern = `"%${search.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}%"`;
        const conditions = [
          `customer_name.ilike.${pattern}`,
          `customer_email.ilike.${pattern}`,
          `customer_phone.ilike.${pattern}`,
        ];
        if (services?.length) conditions.push(`service_id.in.(${services.map((s) => s.id).join(",")})`);
        qb = qb.or(conditions.join(","));
      }
      const now = new Date().toISOString();
      if (period === "upcoming")
        qb = qb.gte("starts_at", now).order("starts_at", { ascending: true });
      else if (period === "past")
        qb = qb.lt("starts_at", now).order("starts_at", { ascending: false });
      else qb = qb.order("starts_at", { ascending: false });
      if (status !== "all") qb = qb.eq("status", status);
      const { data, count, error } = await qb
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const setBookingStatus = async (id: string, next: BookingStatus) => {
    if (actionLock.current || !bid) return false;
    actionLock.current = true;
    setActionBusy(true);
    try {
      const { data: updated, error } = await supabase
        .from("bookings")
        .update({ status: next })
        .eq("id", id)
        .eq("business_id", bid)
        .eq("status", selected?.status ?? "")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated)
        throw new Error(
          "The booking could not be updated. Refresh and try again.",
        );
      toast.success(`Marked as ${statusMeta(next).label}`);
      setSelected((s: any) => (s && s.id === id ? { ...s, status: next } : s));
      refreshBookings();
      return true;
    } catch (error: any) {
      toast.error(error.message ?? "Could not update booking.");
      return false;
    } finally {
      actionLock.current = false;
      setActionBusy(false);
    }
  };

  const rows = data?.rows ?? [];
  const totalPages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);
  useEffect(() => {
    if (data && page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [data, page, totalPages]);

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Bookings"
        title="All bookings"
        subtitle="Search, filter and review every appointment."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer, email, phone, service…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
        <Select value={period} onValueChange={(v: any) => { setPeriod(v); setPage(0); }}>
          <SelectTrigger
            className="w-[140px] h-10"
            aria-label="Filter bookings by period"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="past">Past</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(0); }}>
          <SelectTrigger
            className="w-[150px] h-10"
            aria-label="Filter bookings by status"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {BOOKING_STATUSES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={CalendarCheck} title="Could not load bookings" description="Please refresh and try again." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={search ? "No matching bookings" : "No bookings in this view"}
          description={search ? "Try a different name, email, phone or service." : "Try another date or status filter."}
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden divide-y">
          {rows.map((b: any) => {
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
                <div
                  className="w-1 h-10 rounded-full"
                  style={{ background: color }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">
                      {b.customer_name}
                    </div>
                    <Badge
                      variant="outline"
                      className="capitalize text-[10px]"
                      style={{
                        background: meta.tint,
                        color: meta.color,
                        borderColor: meta.color,
                      }}
                    >
                      {meta.label}
                    </Badge>
                    {b.source === "walkin" && (
                      <Badge variant="secondary" className="text-[10px]">
                        Walk-in
                      </Badge>
                    )}
                    {b.client_confirmed_at && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-[color:var(--confirmed)] border-[color:var(--confirmed)]"
                      >
                        Client confirmed
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {b.services?.name} · {b.staff?.name} ·{" "}
                    {new Date(b.starts_at).toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {fmtTime(b.starts_at)}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {fmtMoney(b.price_cents ?? 0)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && !isError && (data?.count ?? 0) > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data!.count)} of {data!.count} bookings</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && !actionBusy && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {selected?.customer_name}
            </DialogTitle>
            <DialogDescription>
              {selected && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Clock className="h-3 w-3" />
                  {new Date(selected.starts_at).toLocaleDateString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {fmtTime(selected.starts_at)} – {fmtTime(selected.ends_at)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Service
                </span>
                <span className="font-medium text-sm text-right">
                  {selected.services?.name}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  With
                </span>
                <span className="font-medium text-sm text-right inline-flex items-center gap-1 justify-end">
                  <UserIcon className="h-3 w-3" />
                  {selected.staff?.name}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Contact
                </span>
                <span className="font-medium text-sm text-right">
                  {selected.customer_email || selected.customer_phone || "—"}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Price
                </span>
                <span className="font-medium text-sm text-right">
                  {fmtMoney(selected.price_cents ?? 0)}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Paid
                </span>
                <span className="font-medium text-sm text-right">
                  {fmtMoney(selected.amount_paid_cents ?? 0)}
                </span>
              </div>
              <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Balance
                </span>
                <span className="font-medium text-sm text-right">
                  {fmtMoney(
                    Math.max(
                      0,
                      (selected.price_cents ?? 0) -
                        (selected.amount_paid_cents ?? 0),
                    ),
                  )}
                </span>
              </div>
              {selected.source === "walkin" && (
                <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Source
                  </span>
                  <span className="text-right">
                    <Badge variant="secondary">Walk-in</Badge>
                  </span>
                </div>
              )}
              {selected.notes && (
                <div className="pt-2 mt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">
                    Notes
                  </div>
                  <p className="text-sm text-pretty">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
          {selected?.customer_id && bid && (
            <BookingCustomerNotes
              businessId={bid}
              customerId={selected.customer_id}
            />
          )}
          {selected && <BookingConsultationStatus bookingId={selected.id} />}
          {selected && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Change status
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {BOOKING_STATUSES.map((s) => {
                  const on = selected.status === s.id;
                  return (
                    <button
                      key={s.id}
                      disabled={actionBusy}
                      onClick={() => setBookingStatus(selected.id, s.id)}
                      className={`text-xs rounded-xl border px-2 py-1.5 transition-all ${on ? "ring-2 ring-offset-1 ring-offset-background font-medium" : "hover:bg-secondary/60"}`}
                      style={
                        on
                          ? {
                              background: s.tint,
                              color: s.color,
                              borderColor: s.color,
                              ["--tw-ring-color" as any]: s.color,
                            }
                          : { borderColor: "var(--color-border)" }
                      }
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle"
                        style={{ background: s.color }}
                      />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {selected?.customer_id &&
              selected?.service_id &&
              !selected.is_custom && (
                <Button
                  variant="outline"
                  disabled={actionBusy}
                  onClick={() => openRebooking(selected)}
                >
                  <CalendarCheck className="h-4 w-4 mr-1.5" /> Book again
                </Button>
              )}
            {selected?.customer_id &&
              selected?.service_id &&
              !selected.is_custom &&
              ["confirmed", "checked_in", "in_progress"].includes(
                selected.status,
              ) &&
              new Date(selected.starts_at).getTime() <= Date.now() && (
                <div className="w-full rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <Button
                    className="w-full"
                    disabled={actionBusy}
                    onClick={async () => {
                      const booking = selected;
                      if (await setBookingStatus(booking.id, "completed"))
                        openRebooking(booking);
                    }}
                  >
                    Finish appointment & rebook
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Marks this visit completed, then opens the next booking. Any
                    unpaid balance stays due.
                  </p>
                </div>
              )}
            {selected &&
              selected.payment_status !== "paid" &&
              (selected.price_cents ?? 0) >
                (selected.amount_paid_cents ?? 0) && (
                <BookingBalanceCheckout key={selected.id} bookingId={selected.id} businessId={bid!} disabled={actionBusy} onUpdated={(updated) => {
                  setSelected((current: any) => current?.id === updated.id ? { ...current, ...updated } : current);
                  refreshBookings();
                }} />
              )}
            {selected && selected.status !== "cancelled" && (
              <ConfirmDialog
                trigger={
                  <Button
                    disabled={actionBusy}
                    variant="destructive"
                    className="rounded-full"
                  >
                    <XCircle className="h-4 w-4 mr-1.5" /> Cancel booking
                  </Button>
                }
                title="Cancel this booking?"
                description="The customer will be notified if reminders are enabled."
                confirmLabel="Cancel booking"
                onConfirm={async () => {
                  if (await setBookingStatus(selected.id, "cancelled"))
                    setSelected(null);
                }}
              />
            )}
            <Button
              disabled={actionBusy}
              variant="ghost"
              onClick={() => setSelected(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {bid && (
        <NewBookingDialog
          open={!!rebooking}
          onOpenChange={(open) => {
            if (!open) setRebooking(null);
          }}
          businessId={bid}
          prefill={rebooking ?? undefined}
          onCreated={refreshBookings}
        />
      )}
    </div>
  );
}
