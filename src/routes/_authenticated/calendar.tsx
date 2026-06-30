import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, fmtTime } from "@/lib/format";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

const HOUR_PX = 56;
const START_HOUR = 7;
const END_HOUR = 21;

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function CalendarPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<any | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(anchor); d.setDate(d.getDate() + i); return d; }),
    [anchor],
  );

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["calendar", bid, anchor.toISOString()],
    enabled: !!bid,
    queryFn: async () => {
      const end = new Date(anchor); end.setDate(end.getDate() + 7);
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(name), staff(name)")
        .eq("business_id", bid!)
        .gte("starts_at", anchor.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const cancelBooking = async (id: string) => {
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled");
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const hasAny = (bookings ?? []).some((b: any) => b.status !== "cancelled");

  // "Now" indicator
  const now = new Date();
  const nowInWeek = days.findIndex((d) => d.toDateString() === now.toDateString());
  const nowTop =
    nowInWeek >= 0 && now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? ((now.getHours() - START_HOUR) + now.getMinutes() / 60) * HOUR_PX
      : null;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-7xl">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle={`${anchor.toLocaleDateString([], { month: "long", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`}
        action={
          <div className="flex items-center gap-1.5">
            <Button onClick={() => setNewOpen(true)} className="h-9 shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> New booking
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-9" onClick={() => setAnchor(startOfWeek(new Date()))}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
        <div className="grid sticky top-0 z-10 bg-card/95 backdrop-blur" style={{ gridTemplateColumns: "60px repeat(7, minmax(80px, 1fr))" }}>
          <div className="border-b border-r bg-muted/30 py-2" />
          {days.map((d) => {
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className="border-b py-3 text-center text-xs">
                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">
                  {d.toLocaleDateString([], { weekday: "short" })}
                </div>
                <div
                  className={`mt-1 mx-auto h-8 w-8 grid place-items-center rounded-full font-display text-base tabular-nums ${
                    isToday ? "bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid relative overflow-x-auto" style={{ gridTemplateColumns: "60px repeat(7, minmax(80px, 1fr))" }}>
          <div className="border-r">
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-muted-foreground text-right pr-2 -mt-1.5 tabular-nums" style={{ height: HOUR_PX }}>
                {h % 12 || 12}{h < 12 ? "a" : "p"}
              </div>
            ))}
          </div>
          {days.map((d, di) => {
            const dayBookings = (bookings ?? []).filter(
              (b: any) =>
                new Date(b.starts_at).toDateString() === d.toDateString() &&
                b.status !== "cancelled",
            );
            return (
              <div key={d.toISOString()} className="relative border-r last:border-r-0">
                {hours.map((h) => (
                  <div key={h} className="border-b border-border/60" style={{ height: HOUR_PX }} />
                ))}
                {di === nowInWeek && nowTop !== null && (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: nowTop }}>
                    <div className="h-px bg-primary relative">
                      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-primary animate-pulse-ring" />
                    </div>
                  </div>
                )}
                {dayBookings.map((b: any) => {
                  const s = new Date(b.starts_at);
                  const e = new Date(b.ends_at);
                  const top = ((s.getHours() - START_HOUR) + s.getMinutes() / 60) * HOUR_PX;
                  const height = Math.max(28, ((e.getTime() - s.getTime()) / 3600000) * HOUR_PX);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelected(b)}
                      className="absolute left-1 right-1 rounded-lg bg-primary/15 hover:bg-primary/25 border-l-2 border-primary px-2 py-1 text-left overflow-hidden transition-all animate-rise"
                      style={{ top, height }}
                    >
                      <div className="text-[11px] font-medium truncate">{b.customer_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{b.services?.name}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {!isLoading && !hasAny && (
        <div className="mt-6">
          <EmptyState
            icon={CalendarIcon}
            title="No bookings this week"
            description="When customers book through your public page, their appointments appear here."
          />
        </div>
      )}
      {isLoading && (
        <div className="mt-4">
          <Skeleton className="h-3 w-32" />
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
            <div className="rounded-xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <Row label="Service" value={selected.services?.name} />
              <Row label="With" value={<span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{selected.staff?.name}</span>} />
              <Row label="Contact" value={selected.customer_email || selected.customer_phone || "—"} />
              <Row label="Price" value={fmtMoney(selected.price_cents ?? 0)} />
              <Row
                label="Status"
                value={
                  <Badge variant={selected.status === "confirmed" ? "default" : "secondary"} className="capitalize">
                    {selected.status}
                  </Badge>
                }
              />
              {selected.notes && (
                <div className="pt-2 mt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm text-pretty">{selected.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            {selected?.status === "confirmed" && (
              <Button variant="destructive" onClick={() => cancelBooking(selected.id)}>
                Cancel booking
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-4 items-center">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium text-sm text-right">{value}</span>
    </div>
  );
}
