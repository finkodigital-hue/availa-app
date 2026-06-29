import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Users, DollarSign, Scissors, UserCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { fmtMoney, fmtTime } from "@/lib/format";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", bid],
    enabled: !!bid,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);

      const [today, upcoming, monthly, customers, staff, services] = await Promise.all([
        supabase.from("bookings").select("id, price_cents, starts_at, customer_name, service_id, services(name)").eq("business_id", bid!).gte("starts_at", start.toISOString()).lte("starts_at", end.toISOString()).order("starts_at"),
        supabase.from("bookings").select("id, starts_at, customer_name, services(name)").eq("business_id", bid!).gt("starts_at", end.toISOString()).eq("status", "confirmed").order("starts_at").limit(5),
        supabase.from("bookings").select("starts_at, price_cents, service_id, services(name)").eq("business_id", bid!).gte("starts_at", monthAgo.toISOString()).neq("status", "cancelled"),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("business_id", bid!),
        supabase.from("staff").select("id", { count: "exact", head: true }).eq("business_id", bid!),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", bid!),
      ]);
      const revenue = (monthly.data ?? []).reduce((s, b) => s + (b.price_cents ?? 0), 0);
      const todayRevenue = (today.data ?? []).reduce((s, b) => s + (b.price_cents ?? 0), 0);

      // Weekly chart (last 14 days)
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

      // Popular services
      const svc = new Map<string, { name: string; count: number }>();
      (monthly.data ?? []).forEach((b: any) => {
        const id = b.service_id;
        const name = b.services?.name ?? "Unknown";
        const cur = svc.get(id) ?? { name, count: 0 };
        cur.count += 1; svc.set(id, cur);
      });
      const popular = Array.from(svc.values()).sort((a, b) => b.count - a.count).slice(0, 5);

      return {
        todayCount: today.data?.length ?? 0,
        todayRevenue,
        upcoming: upcoming.data ?? [],
        revenue,
        customers: customers.count ?? 0,
        staff: staff.count ?? 0,
        services: services.count ?? 0,
        chart, popular,
      };
    },
  });

  const currency = biz?.brand_color ? "USD" : "USD";

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <PageHeader
        title={`Hello${biz?.name ? `, ${biz.name}` : ""}`}
        subtitle="Here's what's on the books."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CalendarCheck} label="Today's bookings" value={stats?.todayCount ?? 0} />
        <StatCard icon={DollarSign} label="Today's revenue" value={fmtMoney(stats?.todayRevenue ?? 0, currency)} />
        <StatCard icon={DollarSign} label="30d revenue" value={fmtMoney(stats?.revenue ?? 0, currency)} />
        <StatCard icon={Users} label="Customers" value={stats?.customers ?? 0} />
        <StatCard icon={UserCircle} label="Staff" value={stats?.staff ?? 0} />
        <StatCard icon={Scissors} label="Services" value={stats?.services ?? 0} />
        <StatCard icon={Clock} label="Upcoming" value={stats?.upcoming.length ?? 0} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2 rounded-2xl border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl">Bookings · last 14 days</h3>
            <span className="text-xs text-muted-foreground">Daily</span>
          </div>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chart ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="bookings" stroke="var(--color-primary)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="font-display text-xl">Upcoming</h3>
          <ul className="mt-4 space-y-3">
            {(stats?.upcoming ?? []).map((b: any) => (
              <li key={b.id} className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{b.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{b.services?.name}</div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  <div>{new Date(b.starts_at).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                  <div>{fmtTime(b.starts_at)}</div>
                </div>
              </li>
            ))}
            {(!stats || stats.upcoming.length === 0) && (
              <li className="text-sm text-muted-foreground">No upcoming bookings.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="font-display text-xl">Revenue · last 14 days</h3>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="font-display text-xl">Popular services</h3>
          <ul className="mt-4 space-y-3">
            {(stats?.popular ?? []).map((s, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{s.name}</span>
                <span className="text-muted-foreground">{s.count} bookings</span>
              </li>
            ))}
            {(!stats || stats.popular.length === 0) && (
              <li className="text-sm text-muted-foreground">No data yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="font-display text-3xl mt-3">{value}</div>
    </div>
  );
}
