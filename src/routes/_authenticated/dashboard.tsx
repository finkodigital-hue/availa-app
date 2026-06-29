import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  DollarSign,
  Scissors,
  UserCircle,
  Clock,
  TrendingUp,
  Users,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney, fmtTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", bid],
    enabled: !!bid,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      const prevMonthAgo = new Date(); prevMonthAgo.setDate(prevMonthAgo.getDate() - 60);

      const [today, upcoming, monthly, prev, customers, staff, services] = await Promise.all([
        supabase.from("bookings").select("id, price_cents, starts_at, customer_name, service_id, services(name)").eq("business_id", bid!).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at"),
        supabase.from("bookings").select("id, starts_at, customer_name, services(name), staff(name)").eq("business_id", bid!).gt("starts_at", end.toISOString()).eq("status", "confirmed").order("starts_at").limit(6),
        supabase.from("bookings").select("starts_at, price_cents, service_id, services(name)").eq("business_id", bid!).gte("starts_at", monthAgo.toISOString()).neq("status", "cancelled"),
        supabase.from("bookings").select("price_cents").eq("business_id", bid!).gte("starts_at", prevMonthAgo.toISOString()).lt("starts_at", monthAgo.toISOString()).neq("status", "cancelled"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", bid!),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", bid!),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", bid!),
      ]);
      const revenue = (monthly.data ?? []).reduce((s, b) => s + (b.price_cents ?? 0), 0);
      const prevRevenue = (prev.data ?? []).reduce((s, b) => s + (b.price_cents ?? 0), 0);
      const todayRevenue = (today.data ?? []).reduce((s, b) => s + (b.price_cents ?? 0), 0);
      const trend = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : revenue > 0 ? 100 : 0;

      const byDay = new Map<string, number>();
      const weeklyRev = new Map<string, number>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        const k = d.toISOString().slice(0, 10);
        byDay.set(k, 0); weeklyRev.set(k, 0);
      }
      (monthly.data ?? []).forEach((b) => {
        const k = new Date(b.starts_at).toISOString().slice(0, 10);
        if (byDay.has(k)) {
          byDay.set(k, (byDay.get(k) ?? 0) + 1);
          weeklyRev.set(k, (weeklyRev.get(k) ?? 0) + (b.price_cents ?? 0));
        }
      });
      const chart = Array.from(byDay.entries()).map(([d, count]) => ({
        date: new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }),
        bookings: count,
        revenue: (weeklyRev.get(d) ?? 0) / 100,
      }));

      const svc = new Map<string, { name: string; count: number }>();
      (monthly.data ?? []).forEach((b: any) => {
        const id = b.service_id;
        const name = b.services?.name ?? "Unknown";
        const cur = svc.get(id) ?? { name, count: 0 };
        cur.count += 1; svc.set(id, cur);
      });
      const popular = Array.from(svc.values()).sort((a, b) => b.count - a.count).slice(0, 5);
      const maxPop = popular[0]?.count ?? 1;

      return {
        todayCount: today.data?.length ?? 0,
        todayRevenue,
        upcoming: upcoming.data ?? [],
        revenue,
        trend,
        customers: customers.count ?? 0,
        staff: staff.count ?? 0,
        services: services.count ?? 0,
        chart, popular, maxPop,
      };
    },
  });

  const isEmpty = !isLoading && stats && stats.todayCount === 0 && stats.upcoming.length === 0 && stats.revenue === 0;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-7xl">
      <PageHeader
        eyebrow={new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
        title={`Hello${biz?.name ? `, ${biz.name}` : ""}`}
        subtitle="Here's what's on the books today."
        action={
          biz?.slug && (
            <a
              href={`/book/${biz.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-xl border bg-card hover:bg-secondary transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Booking page
            </a>
          )
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard accent loading={isLoading} icon={CalendarCheck} label="Today's bookings" value={stats?.todayCount ?? 0} hint={`${fmtMoney(stats?.todayRevenue ?? 0)} in revenue`} />
        <StatCard loading={isLoading} icon={DollarSign} label="30-day revenue" value={fmtMoney(stats?.revenue ?? 0)} trend={stats?.trend} />
        <StatCard loading={isLoading} icon={Users} label="Customers" value={stats?.customers ?? 0} />
        <StatCard loading={isLoading} icon={Clock} label="Upcoming" value={stats?.upcoming.length ?? 0} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between mb-1">
            <div>
              <h3 className="font-display text-xl">Bookings</h3>
              <p className="text-xs text-muted-foreground">Last 14 days · daily</p>
            </div>
            <div className="inline-flex items-center gap-1 text-xs text-success bg-success/10 rounded-full px-2 py-1">
              <TrendingUp className="h-3 w-3" /> Trending
            </div>
          </div>
          <div className="h-56 mt-4">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.chart ?? []}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ stroke: "var(--color-primary)", strokeOpacity: 0.2, strokeWidth: 2 }}
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-elegant)" }}
                  />
                  <Area type="monotone" dataKey="bookings" stroke="var(--color-primary)" fill="url(#g1)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="font-display text-xl">Up next</h3>
            <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="mt-4 space-y-1">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </li>
              ))}
            {!isLoading &&
              (stats?.upcoming ?? []).map((b: any) => (
                <li key={b.id} className="flex items-center gap-3 py-2 rounded-xl px-2 -mx-2 hover:bg-secondary/60 transition-colors">
                  <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                    {b.customer_name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{b.customer_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{b.services?.name}</div>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground tabular-nums">
                    <div>{new Date(b.starts_at).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                    <div>{fmtTime(b.starts_at)}</div>
                  </div>
                </li>
              ))}
            {!isLoading && (stats?.upcoming.length ?? 0) === 0 && (
              <li className="text-sm text-muted-foreground py-6 text-center">No upcoming bookings.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h3 className="font-display text-xl">Revenue</h3>
          <p className="text-xs text-muted-foreground">Last 14 days</p>
          <div className="h-56 mt-4">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.chart ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-elegant)" }} />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-soft">
          <h3 className="font-display text-xl">Popular services</h3>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <ul className="mt-5 space-y-3.5">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            {!isLoading &&
              (stats?.popular ?? []).map((s, i) => (
                <li key={i}>
                  <div className="flex items-baseline justify-between text-sm mb-1.5">
                    <span className="font-medium truncate">{s.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${(s.count / (stats?.maxPop || 1)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            {!isLoading && (stats?.popular.length ?? 0) === 0 && (
              <li className="text-sm text-muted-foreground py-6 text-center">No bookings yet.</li>
            )}
          </ul>
        </div>
      </div>

      {isEmpty && (
        <div className="mt-8">
          <EmptyState
            icon={Scissors}
            title="Your dashboard will come alive here."
            description="Add a service or two, then share your booking page to start taking your first appointments."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Link to="/services" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">
                  <Scissors className="h-4 w-4" /> Add services
                </Link>
                <Link to="/staff" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border bg-card text-sm">
                  <UserCircle className="h-4 w-4" /> Add staff
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
