import { createClient } from "@supabase/supabase-js";

export async function buildAssistantContext(accessToken: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    },
  );

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Unauthorized");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!business) return { business: null, summary: "No business workspace found." };

  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1);
  const in14 = new Date(startToday); in14.setDate(in14.getDate() + 14);
  const past30 = new Date(startToday); past30.setDate(past30.getDate() - 30);

  const [todayQ, upcomingQ, recentQ, servicesQ, staffQ, customersQ, hoursQ] = await Promise.all([
    supabase.from("bookings").select("id, starts_at, ends_at, status, price_cents, service_id, staff_id, customer_id, customers(name,email), services(name), staff(name)")
      .eq("business_id", business.id)
      .gte("starts_at", startToday.toISOString())
      .lt("starts_at", endToday.toISOString())
      .order("starts_at"),
    supabase.from("bookings").select("id, starts_at, status, service_id, staff_id, services(name), staff(name)")
      .eq("business_id", business.id)
      .gte("starts_at", endToday.toISOString())
      .lt("starts_at", in14.toISOString())
      .neq("status", "cancelled")
      .order("starts_at"),
    supabase.from("bookings").select("id, starts_at, status, price_cents, service_id, staff_id, services(name)")
      .eq("business_id", business.id)
      .gte("starts_at", past30.toISOString())
      .lt("starts_at", endToday.toISOString()),
    supabase.from("services").select("id, name, duration_minutes, price_cents").eq("business_id", business.id),
    supabase.from("staff").select("id, name, role").eq("business_id", business.id),
    supabase.from("customers").select("id, name, email").eq("business_id", business.id).limit(200),
    supabase.from("business_hours").select("*").eq("business_id", business.id),
  ]);

  const today = todayQ.data ?? [];
  const upcoming = upcomingQ.data ?? [];
  const recent = recentQ.data ?? [];

  // Day-of-week popularity (past 30d)
  const dayCounts = [0,0,0,0,0,0,0];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  recent.forEach((b: { starts_at: string; status: string }) => {
    if (b.status === "cancelled") return;
    dayCounts[new Date(b.starts_at).getDay()]++;
  });
  const busiest = dayNames
    .map((n, i) => ({ day: n, bookings: dayCounts[i] }))
    .sort((a, b) => b.bookings - a.bookings);

  // Service popularity
  const svcCount: Record<string, number> = {};
  recent.forEach((b: any) => {
    if (b.status === "cancelled") return;
    const svc = Array.isArray(b.services) ? b.services[0] : b.services;
    const name = svc?.name ?? b.service_id;
    svcCount[name] = (svcCount[name] ?? 0) + 1;
  });
  const topServices = Object.entries(svcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const revenue30 = recent
    .filter((b) => b.status !== "cancelled")
    .reduce((sum, b) => sum + (b.price_cents ?? 0), 0);

  // Empty slots — find upcoming weekdays in next 7d with fewest bookings
  const slotsByDay: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(startToday); d.setDate(d.getDate() + i);
    slotsByDay[d.toISOString().slice(0, 10)] = 0;
  }
  upcoming.forEach((b) => {
    const k = new Date(b.starts_at).toISOString().slice(0, 10);
    if (k in slotsByDay) slotsByDay[k]++;
  });
  const quietDays = Object.entries(slotsByDay).sort((a, b) => a[1] - b[1]).slice(0, 5);

  const currency = business.currency ?? "GBP";
  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);

  const summary = [
    `Business: ${business.name} (${business.timezone ?? "UTC"}, ${currency}).`,
    `Today: ${today.length} bookings.`,
    today.length
      ? "Today's schedule:\n" + today.map((b: any) => {
          const svc = Array.isArray(b.services) ? b.services[0] : b.services;
          const st = Array.isArray(b.staff) ? b.staff[0] : b.staff;
          const c = Array.isArray(b.customers) ? b.customers[0] : b.customers;
          return `  • ${new Date(b.starts_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})} — ${svc?.name ?? "Service"} with ${st?.name ?? "staff"} for ${c?.name ?? "customer"} [${b.status}]`;
        }).join("\n")
      : "No bookings today.",
    `Next 14 days: ${upcoming.length} upcoming bookings.`,
    `Past 30 days: ${recent.length} bookings, ${fmt(revenue30)} revenue.`,
    `Busiest days (past 30d): ${busiest.slice(0, 3).map(d => `${d.day} (${d.bookings})`).join(", ")}.`,
    `Quietest upcoming days (next 7d): ${quietDays.map(([d, n]) => `${d} (${n})`).join(", ")}.`,
    `Top services: ${topServices.map(([n, c]) => `${n} (${c})`).join(", ") || "n/a"}.`,
    `Services offered: ${(servicesQ.data ?? []).map((s: {name:string;duration_minutes:number;price_cents:number}) => `${s.name} ${s.duration_minutes}min ${fmt(s.price_cents)}`).join("; ") || "none"}.`,
    `Staff: ${(staffQ.data ?? []).map((s: {name:string}) => s.name).join(", ") || "none"}.`,
    `Customer count: ${(customersQ.data ?? []).length}.`,
    `Business hours rows: ${(hoursQ.data ?? []).length}.`,
  ].join("\n");

  return { business, summary };
}
