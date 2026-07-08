import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  DollarSign,
  UserCircle,
  Clock,
  Users,
  ArrowRight,
  ExternalLink,
  XCircle,
  TrendingUp,
  Target,
  Sparkles,
  Trophy,
  Plus,
  Award,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { fmtMoney, fmtTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Range = "today" | "week" | "month" | "year";

function rangeFor(r: Range): { start: Date; end: Date; prevStart: Date; prevEnd: Date; bucket: "hour" | "day" | "month" } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (r === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
    const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 1);
    return { start, end, prevStart, prevEnd, bucket: "hour" };
  }
  if (r === "week") {
    const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 7);
    return { start, end, prevStart, prevEnd, bucket: "day" };
  }
  if (r === "month") {
    const start = new Date(); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 30);
    const prevEnd = new Date(end); prevEnd.setDate(prevEnd.getDate() - 30);
    return { start, end, prevStart, prevEnd, bucket: "day" };
  }
  const start = new Date(); start.setMonth(start.getMonth() - 11); start.setDate(1); start.setHours(0, 0, 0, 0);
  const prevStart = new Date(start); prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(end); prevEnd.setFullYear(prevEnd.getFullYear() - 1);
  return { start, end, prevStart, prevEnd, bucket: "month" };
}

function Dashboard() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("month");
  const [newOpen, setNewOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  const { data: today, isLoading: tLoading } = useQuery({
    queryKey: ["dash-today", bid],
    enabled: !!bid,
    queryFn: async () => {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      const e = new Date(); e.setHours(23, 59, 59, 999);
      const [bookings, newCusts] = await Promise.all([
        supabase.from("bookings").select("*, services(name), staff(name)").eq("business_id", bid!).gte("starts_at", s.toISOString()).lte("starts_at", e.toISOString()).order("starts_at"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", bid!).gte("created_at", s.toISOString()),
      ]);
      const data = bookings.data ?? [];
      const confirmed = data.filter((b: any) => b.status !== "cancelled");
      const cancelled = data.filter((b: any) => b.status === "cancelled");
      const revenue = confirmed.reduce((a, b: any) => a + (b.price_cents ?? 0), 0);
      const now = new Date();
      const upcoming = confirmed.filter((b: any) => new Date(b.starts_at) >= now);
      return {
        revenue,
        bookings: confirmed.length,
        upcoming: upcoming.length,
        upcomingList: upcoming.slice(0, 6),
        cancelled: cancelled.length,
        newCustomers: newCusts.count ?? 0,
        avg: confirmed.length ? Math.round(revenue / confirmed.length) : 0,
      };
    },
  });

  const { data: trends, isLoading: trLoading } = useQuery({
    queryKey: ["dash-trends", bid, range],
    enabled: !!bid,
    queryFn: async () => {
      const { start, end, prevStart, prevEnd, bucket } = rangeFor(range);
      const [cur, prev] = await Promise.all([
        supabase.from("bookings").select("starts_at, price_cents, status, staff_id, service_id, customer_id, services(name, color, duration_minutes, price_cents), staff(name)").eq("business_id", bid!).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).neq("status", "cancelled"),
        supabase.from("bookings").select("price_cents").eq("business_id", bid!).gte("starts_at", prevStart.toISOString()).lte("starts_at", prevEnd.toISOString()).neq("status", "cancelled"),
      ]);

      const data = cur.data ?? [];
      const total = data.reduce((a, b: any) => a + (b.price_cents ?? 0), 0);
      const prevTotal = (prev.data ?? []).reduce((a, b: any) => a + (b.price_cents ?? 0), 0);
      const trend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : total > 0 ? 100 : 0;
      const bookingsTrend = prev.data?.length ? ((data.length - prev.data.length) / prev.data.length) * 100 : data.length > 0 ? 100 : 0;

      // bucketize
      const buckets = new Map<string, { revenue: number; bookings: number; label: string; sortKey: string }>();
      const fmtKey = (d: Date) => {
        if (bucket === "hour") return d.toISOString().slice(0, 13);
        if (bucket === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return d.toISOString().slice(0, 10);
      };
      const fmtLabel = (d: Date) =>
        bucket === "hour"
          ? `${d.getHours()}h`
          : bucket === "month"
            ? d.toLocaleDateString([], { month: "short" })
            : d.toLocaleDateString([], { month: "short", day: "numeric" });

      // seed buckets
      const cursor = new Date(start);
      while (cursor <= end) {
        const k = fmtKey(cursor);
        buckets.set(k, { revenue: 0, bookings: 0, label: fmtLabel(cursor), sortKey: k });
        if (bucket === "hour") cursor.setHours(cursor.getHours() + 1);
        else if (bucket === "month") cursor.setMonth(cursor.getMonth() + 1);
        else cursor.setDate(cursor.getDate() + 1);
      }
      data.forEach((b: any) => {
        const k = fmtKey(new Date(b.starts_at));
        const cur = buckets.get(k);
        if (cur) {
          cur.revenue += (b.price_cents ?? 0) / 100;
          cur.bookings += 1;
        }
      });
      const chart = Array.from(buckets.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      // staff perf
      const staffMap = new Map<string, { name: string; revenue: number; bookings: number; durationMin: number; customers: Set<string> }>();
      data.forEach((b: any) => {
        if (!b.staff_id) return;
        const cur = staffMap.get(b.staff_id) ?? { name: b.staff?.name ?? "—", revenue: 0, bookings: 0, durationMin: 0, customers: new Set() };
        cur.revenue += b.price_cents ?? 0;
        cur.bookings += 1;
        cur.durationMin += b.services?.duration_minutes ?? 0;
        if (b.customer_id) cur.customers.add(b.customer_id);
        staffMap.set(b.staff_id, cur);
      });
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
      const staff = Array.from(staffMap.values()).map((s) => ({
        ...s,
        repeat: s.customers.size,
        avg: s.bookings ? Math.round(s.revenue / s.bookings) : 0,
        avgDuration: s.bookings ? Math.round(s.durationMin / s.bookings) : 0,
        utilisation: Math.min(100, Math.round((s.durationMin / (days * 8 * 60)) * 100)),
      }));

      // service perf
      const svcMap = new Map<string, { name: string; revenue: number; bookings: number; price: number; duration: number }>();
      data.forEach((b: any) => {
        if (!b.service_id) return;
        const cur = svcMap.get(b.service_id) ?? {
          name: b.services?.name ?? "—",
          revenue: 0,
          bookings: 0,
          price: b.services?.price_cents ?? 0,
          duration: b.services?.duration_minutes ?? 0,
        };
        cur.revenue += b.price_cents ?? 0;
        cur.bookings += 1;
        svcMap.set(b.service_id, cur);
      });
      const services = Array.from(svcMap.values()).sort((a, b) => b.bookings - a.bookings);

      // insights
      const dayCount = [0, 0, 0, 0, 0, 0, 0];
      const hourCount = new Array(24).fill(0);
      data.forEach((b: any) => {
        const d = new Date(b.starts_at);
        dayCount[d.getDay()] += 1;
        hourCount[d.getHours()] += 1;
      });
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const busiestDay = dayCount.indexOf(Math.max(...dayCount));
      const quietestDay = dayCount.indexOf(Math.min(...dayCount.filter((c) => c > 0).length ? dayCount.filter((c) => c > 0) : dayCount));
      const busiestHour = hourCount.indexOf(Math.max(...hourCount));
      const quietestHourActive = hourCount.filter((c) => c > 0);
      const quietestHour = quietestHourActive.length ? hourCount.indexOf(Math.min(...quietestHourActive)) : -1;
      const bestStaff = staff.sort((a, b) => b.revenue - a.revenue)[0];
      const bestService = services[0];

      return {
        total,
        trend,
        bookingsTrend,
        chart,
        staff,
        services,
        insights: {
          busiestDay: dayCount.some((c) => c > 0) ? dayNames[busiestDay] : null,
          quietestDay: dayCount.some((c) => c > 0) ? dayNames[quietestDay] : null,
          busiestHour: hourCount.some((c) => c > 0) ? `${busiestHour}:00` : null,
          quietestHour: quietestHour >= 0 ? `${quietestHour}:00` : null,
          bestStaff: bestStaff?.name ?? null,
          bestService: bestService?.name ?? null,
        },
      };
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["dash-customers", bid, range],
    enabled: !!bid,
    queryFn: async () => {
      const { start, end } = rangeFor(range);
      const [bookings, all] = await Promise.all([
        supabase.from("bookings").select("customer_id, customer_name, price_cents, starts_at").eq("business_id", bid!).neq("status", "cancelled"),
        supabase.from("customers").select("id, name, created_at").eq("business_id", bid!),
      ]);
      const map = new Map<string, { name: string; spend: number; count: number; lastVisit: string }>();
      (bookings.data ?? []).forEach((b: any) => {
        if (!b.customer_id) return;
        const cur = map.get(b.customer_id) ?? { name: b.customer_name, spend: 0, count: 0, lastVisit: b.starts_at };
        cur.spend += b.price_cents ?? 0;
        cur.count += 1;
        if (new Date(b.starts_at) > new Date(cur.lastVisit)) cur.lastVisit = b.starts_at;
        map.set(b.customer_id, cur);
      });
      const arr = Array.from(map.values());
      const top = [...arr].sort((a, b) => b.spend - a.spend).slice(0, 5);
      const lapsed = arr.filter((c) => {
        const days = (Date.now() - new Date(c.lastVisit).getTime()) / 86400000;
        return days > 60;
      }).sort((a, b) => new Date(a.lastVisit).getTime() - new Date(b.lastVisit).getTime()).slice(0, 5);
      const isNew = (id: string) => {
        const c = (all.data ?? []).find((x: any) => x.id === id);
        return c && new Date(c.created_at) >= start && new Date(c.created_at) <= end;
      };
      const periodCustomers = (bookings.data ?? []).filter((b: any) => new Date(b.starts_at) >= start && new Date(b.starts_at) <= end);
      const uniqueInPeriod = new Set(periodCustomers.map((b: any) => b.customer_id).filter(Boolean));
      const newCount = Array.from(uniqueInPeriod).filter((id) => isNew(id as string)).length;
      const returningCount = uniqueInPeriod.size - newCount;
      const ltv = arr.length ? arr.reduce((a, c) => a + c.spend, 0) / arr.length : 0;
      return { top, lapsed, newCount, returningCount, ltv };
    },
  });

  const monthKey = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: goal } = useQuery({
    queryKey: ["dash-goal", bid, monthKey],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase.from("business_goals").select("*").eq("business_id", bid!).eq("month", monthKey).maybeSingle();
      const monthStart = new Date(monthKey);
      const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
      const [bookings, custs] = await Promise.all([
        supabase.from("bookings").select("price_cents, customer_id").eq("business_id", bid!).gte("starts_at", monthStart.toISOString()).lt("starts_at", monthEnd.toISOString()).neq("status", "cancelled"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", bid!).gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString()),
      ]);
      const revenue = (bookings.data ?? []).reduce((a, b: any) => a + (b.price_cents ?? 0), 0);
      return {
        target: data,
        progress: {
          revenue,
          bookings: bookings.data?.length ?? 0,
          customers: custs.count ?? 0,
        },
      };
    },
  });

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-7xl">
      <PageHeader
        eyebrow={new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        title={`Hello${biz?.name ? `, ${biz.name}` : ""}`}
        subtitle="Here's what's happening across your business."
        action={
          <div className="flex items-center gap-2">
            {biz?.slug && (
              <a
                href={`/book/${biz.slug}`}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-xl border bg-card hover:bg-secondary transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Booking page
              </a>
            )}
            <Button onClick={() => setNewOpen(true)} className="shadow-glow">
              <Plus className="h-4 w-4 mr-1" /> New booking
            </Button>
          </div>
        }
      />

      {/* Today's overview */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard accent loading={tLoading} icon={DollarSign} label="Revenue today" value={fmtMoney(today?.revenue ?? 0)} />
        <StatCard loading={tLoading} icon={CalendarCheck} label="Bookings today" value={today?.bookings ?? 0} />
        <StatCard loading={tLoading} icon={Clock} label="Upcoming" value={today?.upcoming ?? 0} />
        <StatCard loading={tLoading} icon={XCircle} label="Cancelled" value={today?.cancelled ?? 0} />
        <StatCard loading={tLoading} icon={Users} label="New customers" value={today?.newCustomers ?? 0} />
        <StatCard loading={tLoading} icon={TrendingUp} label="Avg value" value={fmtMoney(today?.avg ?? 0)} />
      </div>

      {/* Range toggle */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-tight">Performance</h2>
        <div className="inline-flex rounded-xl border bg-card p-0.5">
          {(["today", "week", "month", "year"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Revenue/Bookings charts */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-display text-xl">Revenue</h3>
              <p className="text-xs text-muted-foreground">
                {fmtMoney(trends?.total ?? 0)} · {typeof trends?.trend === "number" ? `${trends.trend >= 0 ? "+" : ""}${trends.trend.toFixed(0)}% vs prev` : "—"}
              </p>
            </div>
          </div>
          <div className="h-56 mt-4">
            {trLoading ? <Skeleton className="h-full w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends?.chart ?? []}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" fill="url(#rev)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-display text-xl">Bookings</h3>
              <p className="text-xs text-muted-foreground">
                Volume trend · {typeof trends?.bookingsTrend === "number" ? `${trends.bookingsTrend >= 0 ? "+" : ""}${trends.bookingsTrend.toFixed(0)}%` : "—"}
              </p>
            </div>
          </div>
          <div className="h-56 mt-4">
            {trLoading ? <Skeleton className="h-full w-full rounded-xl" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends?.chart ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="bookings" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Goals + Up next */}
      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-display text-xl flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Monthly goals</h3>
              <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setGoalOpen(true)}>
              {goal?.target ? "Edit" : "Set goals"}
            </Button>
          </div>
          <div className="mt-5 grid sm:grid-cols-3 gap-4">
            <GoalBar label="Revenue" cur={goal?.progress.revenue ?? 0} target={goal?.target?.revenue_cents_target ?? 0} money />
            <GoalBar label="Bookings" cur={goal?.progress.bookings ?? 0} target={goal?.target?.bookings_target ?? 0} />
            <GoalBar label="New customers" cur={goal?.progress.customers ?? 0} target={goal?.target?.customers_target ?? 0} />
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl">Up next</h3>
            <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="mt-4 space-y-1 max-h-[260px] overflow-y-auto overflow-x-hidden">
            {tLoading && Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </li>
            ))}
            {!tLoading && (today?.upcomingList ?? []).map((b: any) => (
              <li key={b.id} className="flex items-center gap-3 py-2 rounded-xl px-2 -mx-2 hover:bg-secondary/60">
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                  {b.customer_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{b.customer_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{b.services?.name} · {b.staff?.name}</div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(b.starts_at)}</div>
              </li>
            ))}
            {!tLoading && (today?.upcomingList?.length ?? 0) === 0 && (
              <li className="text-sm text-muted-foreground py-6 text-center">Free afternoon — share your booking page!</li>
            )}
          </ul>
        </div>
      </div>

      {/* Staff performance */}
      <div className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="font-display text-xl">Staff performance</h3>
            <p className="text-xs text-muted-foreground">Sorted by revenue · {range}</p>
          </div>
          <Link to="/staff" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {trLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (trends?.staff.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No staff bookings in this period.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trends!.staff.sort((a, b) => b.revenue - a.revenue).map((s, i) => (
              <div key={i} className="rounded-2xl border bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  {i === 0 && <Trophy className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="font-display text-2xl mt-1.5 tabular-nums">{fmtMoney(s.revenue)}</div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
                  <span>Bookings <span className="text-foreground font-medium ml-1">{s.bookings}</span></span>
                  <span>Avg <span className="text-foreground font-medium ml-1">{fmtMoney(s.avg)}</span></span>
                  <span>Duration <span className="text-foreground font-medium ml-1">{s.avgDuration}m</span></span>
                  <span>Repeat <span className="text-foreground font-medium ml-1">{s.repeat}</span></span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>Utilisation</span><span>{s.utilisation}%</span></div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${s.utilisation}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Services + Customers */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h3 className="font-display text-xl">Top services</h3>
          <p className="text-xs text-muted-foreground">{range}</p>
          <div className="mt-4 space-y-3">
            {(trends?.services ?? []).slice(0, 6).map((s, i) => {
              const max = trends!.services[0]?.bookings || 1;
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{fmtMoney(s.revenue)} · {s.bookings}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${(s.bookings / max) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{s.duration}m · {fmtMoney(s.price)} list</div>
                </div>
              );
            })}
            {!trLoading && (trends?.services.length ?? 0) === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No services booked yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h3 className="font-display text-xl">Customers</h3>
          <p className="text-xs text-muted-foreground">New vs returning · LTV</p>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Mini label="New" value={customers?.newCount ?? 0} />
            <Mini label="Returning" value={customers?.returningCount ?? 0} />
            <Mini label="Avg LTV" value={fmtMoney(customers?.ltv ?? 0)} />
          </div>
          <div className="mt-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top spenders</div>
            <ul className="space-y-1.5">
              {(customers?.top ?? []).map((c, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtMoney(c.spend)} · {c.count} visits</span>
                </li>
              ))}
              {(customers?.top.length ?? 0) === 0 && <li className="text-xs text-muted-foreground">No data yet.</li>}
            </ul>
          </div>
          {(customers?.lapsed.length ?? 0) > 0 && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Haven't returned in 60+ days</div>
              <ul className="space-y-1.5">
                {customers!.lapsed.map((c, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">{new Date(c.lastVisit).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Insights */}
      <div className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-display text-xl">Business insights</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Insight icon={CalendarCheck} label="Busiest day" value={trends?.insights.busiestDay ?? "—"} />
          <Insight icon={Clock} label="Quietest day" value={trends?.insights.quietestDay ?? "—"} />
          <Insight icon={TrendingUp} label="Busiest hour" value={trends?.insights.busiestHour ?? "—"} />
          <Insight icon={Clock} label="Quietest hour" value={trends?.insights.quietestHour ?? "—"} />
          <Insight icon={Award} label="Top staff" value={trends?.insights.bestStaff ?? "—"} />
          <Insight icon={Trophy} label="Top service" value={trends?.insights.bestService ?? "—"} />
        </div>
      </div>

      {bid && (
        <NewBookingDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          businessId={bid}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["dash-today"] });
            qc.invalidateQueries({ queryKey: ["dash-trends"] });
            qc.invalidateQueries({ queryKey: ["dash-goal"] });
          }}
        />
      )}

      <GoalEditor
        open={goalOpen}
        onOpenChange={setGoalOpen}
        businessId={bid}
        monthKey={monthKey}
        existing={goal?.target}
        onSaved={() => qc.invalidateQueries({ queryKey: ["dash-goal"] })}
      />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-xl tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Insight({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="font-display text-lg mt-1.5">{value}</div>
    </div>
  );
}

function GoalBar({ label, cur, target, money }: { label: string; cur: number; target: number; money?: boolean }) {
  const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
  const fmt = (n: number) => (money ? fmtMoney(n) : n.toLocaleString());
  return (
    <div className="rounded-xl border bg-secondary/30 p-4">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground"><span>{label}</span><span>{pct}%</span></div>
      <div className="font-display text-xl mt-1.5 tabular-nums">{fmt(cur)} <span className="text-xs text-muted-foreground">/ {target > 0 ? fmt(target) : "—"}</span></div>
      <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GoalEditor({
  open,
  onOpenChange,
  businessId,
  monthKey,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId?: string;
  monthKey: string;
  existing: any;
  onSaved: () => void;
}) {
  const [rev, setRev] = useState((existing?.revenue_cents_target ?? 0) / 100);
  const [bk, setBk] = useState(existing?.bookings_target ?? 0);
  const [cu, setCu] = useState(existing?.customers_target ?? 0);
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Monthly goals</DialogTitle>
          <DialogDescription>Set targets for this calendar month.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Revenue target ($)</Label>
            <Input type="number" min={0} value={rev} onChange={(e) => setRev(Number(e.target.value))} className="mt-1.5 h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bookings target</Label>
              <Input type="number" min={0} value={bk} onChange={(e) => setBk(Number(e.target.value))} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label>New customers target</Label>
              <Input type="number" min={0} value={cu} onChange={(e) => setCu(Number(e.target.value))} className="mt-1.5 h-10" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={saving || !businessId}
            onClick={async () => {
              if (!businessId) return;
              setSaving(true);
              const payload = {
                business_id: businessId,
                month: monthKey,
                revenue_cents_target: Math.round(rev * 100),
                bookings_target: bk,
                customers_target: cu,
              };
              const { error } = await supabase.from("business_goals").upsert(payload, { onConflict: "business_id,month" });
              setSaving(false);
              if (error) return toast.error(error.message);
              toast.success("Goals saved");
              onSaved();
              onOpenChange(false);
            }}
          >
            Save goals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
