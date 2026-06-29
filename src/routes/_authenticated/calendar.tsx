import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtTime } from "@/lib/format";
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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor); d.setDate(d.getDate() + i); return d;
  }), [anchor]);

  const { data: bookings } = useQuery({
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

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <PageHeader
        title="Calendar"
        subtitle={`${anchor.toLocaleDateString([], { month: "long", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => setAnchor(startOfWeek(new Date()))}>Today</Button>
            <Button variant="outline" size="icon" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div className="border-b border-r bg-muted/30 py-2" />
          {days.map((d) => {
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={d.toISOString()} className="border-b py-2 text-center text-xs">
                <div className="text-muted-foreground uppercase">{d.toLocaleDateString([], { weekday: "short" })}</div>
                <div className={`font-display text-lg ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="grid relative" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div className="border-r">
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-muted-foreground text-right pr-2 -mt-1.5" style={{ height: HOUR_PX }}>
                {h % 12 || 12}{h < 12 ? "a" : "p"}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayBookings = (bookings ?? []).filter((b: any) => new Date(b.starts_at).toDateString() === d.toDateString() && b.status !== "cancelled");
            return (
              <div key={d.toISOString()} className="relative border-r last:border-r-0">
                {hours.map((h) => (
                  <div key={h} className="border-b" style={{ height: HOUR_PX }} />
                ))}
                {dayBookings.map((b: any) => {
                  const s = new Date(b.starts_at);
                  const e = new Date(b.ends_at);
                  const top = ((s.getHours() - START_HOUR) + s.getMinutes() / 60) * HOUR_PX;
                  const height = Math.max(24, ((e.getTime() - s.getTime()) / 3600000) * HOUR_PX);
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelected(b)}
                      className="absolute left-1 right-1 rounded-lg bg-primary/15 border-l-2 border-primary px-2 py-1 text-left overflow-hidden hover:bg-primary/25 transition-colors"
                      style={{ top, height }}
                    >
                      <div className="text-xs font-medium truncate">{b.customer_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{b.services?.name}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selected?.customer_name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <Row label="Service" value={selected.services?.name} />
              <Row label="Staff" value={selected.staff?.name} />
              <Row label="When" value={`${new Date(selected.starts_at).toLocaleDateString()} · ${fmtTime(selected.starts_at)} – ${fmtTime(selected.ends_at)}`} />
              <Row label="Contact" value={selected.customer_email || selected.customer_phone || "—"} />
              <Row label="Status" value={selected.status} />
              {selected.notes && <Row label="Notes" value={selected.notes} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
            {selected?.status === "confirmed" && <Button variant="destructive" onClick={() => cancelBooking(selected.id)}>Cancel booking</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>;
}
