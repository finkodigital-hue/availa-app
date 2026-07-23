// Seeds two fake, safe-to-email QA businesses for exercising the
// reminder/confirmation email pipeline without touching real customer data
// (see testshop — a real Fresha import, permanently email_suppressed).
// All customers use @example.com addresses. Idempotent: safe to re-run,
// skips anything that already exists.
//
// Usage: node --env-file=.env scripts/seed-qa-workspace.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. node --env-file=.env scripts/seed-qa-workspace.mjs)");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const PASSWORD = "QaWorkspace123!";
const CUSTOMER_NAMES = [
  "Ava Thompson", "Noah Bennett", "Isla Robertson", "Leo Campbell",
  "Mia Sinclair", "Oscar Whyte", "Freya Duncan", "Jack Ferguson",
];

async function ensureOwner(email, fullName) {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, { password: PASSWORD, email_confirm: true });
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

async function ensureBusiness({ ownerId, name, slug, plan, staffCount, reminderHoursBefore }) {
  let { data: biz } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  if (!biz) {
    const { data: created, error } = await supabase
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name,
        slug,
        email: `${slug}-owner@example.com`,
        currency: "GBP",
        timezone: "Europe/London",
        address: "12 Example Street, Edinburgh",
        plan,
        reminder_hours_before: reminderHoursBefore,
      })
      .select()
      .single();
    if (error) throw error;
    biz = created;
    await supabase.rpc("ensure_business_hours", { _business_id: biz.id });
  } else if (biz.plan !== plan || biz.reminder_hours_before !== reminderHoursBefore) {
    await supabase.from("businesses").update({ plan, reminder_hours_before: reminderHoursBefore }).eq("id", biz.id);
  }

  const { data: existingStaff } = await supabase.from("staff").select("id, name").eq("business_id", biz.id).order("name");
  const staffNames = ["Priya Nair", "Callum Reid", "Sophie Adams"].slice(0, staffCount);
  const staff = [...(existingStaff ?? [])];
  for (const name of staffNames) {
    if (staff.some((s) => s.name === name)) continue;
    const { data: created, error } = await supabase.from("staff").insert({ business_id: biz.id, name, email: null }).select("id, name").single();
    if (error) throw error;
    staff.push(created);
  }

  const { data: existingServices } = await supabase.from("services").select("id, name, duration_minutes, price_cents").eq("business_id", biz.id);
  let services = existingServices ?? [];
  if (services.length === 0) {
    const { data: created, error } = await supabase
      .from("services")
      .insert([
        { business_id: biz.id, name: "Cut & Finish", duration_minutes: 45, price_cents: 4500, active: true },
        { business_id: biz.id, name: "Colour", duration_minutes: 90, price_cents: 9000, active: true },
      ])
      .select("id, name, duration_minutes, price_cents");
    if (error) throw error;
    services = created;
  }

  const { data: existingCustomers } = await supabase.from("customers").select("id, name, email").eq("business_id", biz.id);
  let customers = existingCustomers ?? [];
  if (customers.length === 0) {
    const rows = CUSTOMER_NAMES.map((name, i) => ({
      business_id: biz.id,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      phone: `+4470000000${String(i).padStart(2, "0")}`,
    }));
    const { data: created, error } = await supabase.from("customers").insert(rows).select("id, name, email");
    if (error) throw error;
    customers = created;
  }

  return { biz, staff: staff.slice(0, staffCount), services, customers };
}

function at(hoursFromNow, minuteOfHour = 0) {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(minuteOfHour, 0, 0);
  return d;
}

async function seedBookings({ biz, staff, services, customers }) {
  const { count } = await supabase.from("bookings").select("id", { count: "exact", head: true }).eq("business_id", biz.id);
  if (count && count > 0) {
    console.log(`  bookings already seeded (${count} rows) — skipping`);
    return;
  }

  const svc = (i) => services[i % services.length];
  const staffFor = (i) => staff[i % staff.length];
  const cust = (i) => customers[i % customers.length];

  const rows = [];
  const mk = (customerIdx, staffIdx, serviceIdx, starts, status, opts = {}) => {
    const s = svc(serviceIdx);
    const c = cust(customerIdx);
    const ends = new Date(starts.getTime() + s.duration_minutes * 60000);
    rows.push({
      business_id: biz.id,
      staff_id: staffFor(staffIdx).id,
      service_id: s.id,
      customer_id: c.id,
      customer_name: c.name,
      customer_email: c.email,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      status,
      price_cents: s.price_cents,
      ...opts,
    });
  };

  // Past bookings — a realistic spread of outcomes over the last ~3 weeks.
  for (let d = 21; d >= 1; d -= 2) {
    mk(d % customers.length, d % staff.length, d % services.length, at(-24 * d, 30), d % 7 === 0 ? "no_show" : d % 5 === 0 ? "cancelled" : "completed");
  }

  // Due-now reminder case — inside the Studio business's reminder window,
  // not yet reminded. This is the row the sweep should actually claim+send
  // during the verification loop.
  mk(0, 0, 0, at(4), "confirmed");

  // Not-yet-due — further out than the reminder window, sweep must skip it.
  mk(1, 1, 1, at(24 * 10), "confirmed");

  // Already reminded — sweep must not double-send.
  mk(2, 0, 1, at(6), "confirmed", { reminder_sent_at: new Date().toISOString() });

  // Cancelled future booking — must never get a reminder.
  mk(3, 1, 0, at(8), "cancelled");

  // A few more ordinary upcoming bookings across the next two weeks.
  for (let d = 2; d <= 12; d += 3) {
    mk(d % customers.length, d % staff.length, d % services.length, at(24 * d, 15), "confirmed");
  }

  const { error } = await supabase.from("bookings").insert(rows);
  if (error) throw error;
  console.log(`  seeded ${rows.length} bookings`);
}

async function main() {
  console.log("Studio QA workspace (qa-studio-salon, plan=studio, 3 staff, reminders on)...");
  const studioOwnerId = await ensureOwner("qa-studio-owner@example.com", "QA Studio Owner");
  const studio = await ensureBusiness({
    ownerId: studioOwnerId,
    name: "QA Studio Salon",
    slug: "qa-studio-salon",
    plan: "studio",
    staffCount: 3,
    reminderHoursBefore: 24,
  });
  await seedBookings(studio);

  console.log("Free QA workspace (qa-free-salon, plan=free, 1 staff, reminders gated off)...");
  const freeOwnerId = await ensureOwner("qa-free-owner@example.com", "QA Free Owner");
  const free = await ensureBusiness({
    ownerId: freeOwnerId,
    name: "QA Free Salon",
    slug: "qa-free-salon",
    plan: "free",
    staffCount: 1,
    reminderHoursBefore: 24,
  });
  await seedBookings(free);

  console.log("\nDone.");
  console.log(`  Studio: qa-studio-owner@example.com / ${PASSWORD}  (business id ${studio.biz.id})`);
  console.log(`  Free:   qa-free-owner@example.com / ${PASSWORD}  (business id ${free.biz.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
