import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Search, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney, fmtTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

const STATUSES = ["all", "confirmed", "completed", "cancelled", "no_show"] as const;

function BookingsPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");

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
            {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
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
            const color = b.services?.color || "var(--color-primary)";
            return (
              <div key={b.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors">
                <div className="w-1 h-10 rounded-full" style={{ background: color }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{b.customer_name}</div>
                    <Badge variant={b.status === "confirmed" ? "default" : b.status === "cancelled" ? "destructive" : "secondary"} className="capitalize text-[10px]">
                      {String(b.status).replace("_", " ")}
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
    </div>
  );
}
