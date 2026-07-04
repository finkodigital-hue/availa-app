import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_EMAIL = "finko@au.com";
const DEMO_PASSWORD = "Money123!";

function assertDev() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev-only endpoint");
  }
}

export const devSeedProfessional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertDev();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: salon, error: salonErr } = await context.supabase
      .from("businesses")
      .select("id,name")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (salonErr) throw salonErr;
    if (!salon) throw new Error("No salon business found for current user");

    // Find or create the demo pro auth user
    let userId: string | null = null;
    // listUsers is paginated; scan first page (200) — good enough for dev
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (existing) {
      userId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Alex Rivera (Demo Pro)" },
      });
      if (error) throw error;
      userId = data.user!.id;
    }

    // Ensure profile exists
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name: "Alex Rivera (Demo Pro)" }, { onConflict: "id" });

    // Ensure pro's business
    let { data: proBiz } = await supabaseAdmin
      .from("businesses")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();

    if (!proBiz) {
      const slug = `demo-pro-${userId.slice(0, 8)}`;
      const { data: created, error: bErr } = await supabaseAdmin
        .from("businesses")
        .insert({
          owner_id: userId,
          name: "Alex Rivera",
          slug,
          email: DEMO_EMAIL,
          industry: "hair_salon",
          currency: "USD",
        } as any)
        .select()
        .single();
      if (bErr) throw bErr;
      proBiz = created;
      await supabaseAdmin.rpc("ensure_business_hours", { _business_id: proBiz.id });
    }

    // Link to salon
    const { data: existingLink } = await supabaseAdmin
      .from("salon_professionals")
      .select("id")
      .eq("salon_business_id", salon.id)
      .eq("pro_business_id", proBiz.id)
      .maybeSingle();

    if (!existingLink) {
      await supabaseAdmin.from("salon_professionals").insert({
        salon_business_id: salon.id,
        pro_business_id: proBiz.id,
        status: "active",
        chair_label: "Chair 3",
        rent_mode: "monthly",
        rent_amount_cents: 50000,
        rent_due_day: 1,
      } as any);
    }

    // Staff row for the pro
    const { data: staffRows } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("business_id", proBiz.id)
      .limit(1);
    if (!staffRows || staffRows.length === 0) {
      await supabaseAdmin.from("staff").insert({
        business_id: proBiz.id,
        name: "Alex Rivera",
        email: DEMO_EMAIL,
      } as any);
    }

    // Services
    const { count: svcCount } = await supabaseAdmin
      .from("services")
      .select("*", { count: "exact", head: true })
      .eq("business_id", proBiz.id);
    if (!svcCount) {
      await supabaseAdmin.from("services").insert([
        { business_id: proBiz.id, name: "Signature Haircut", duration_minutes: 45, price_cents: 6500, active: true },
        { business_id: proBiz.id, name: "Color & Gloss", duration_minutes: 90, price_cents: 14000, active: true },
        { business_id: proBiz.id, name: "Beard Trim", duration_minutes: 20, price_cents: 2500, active: true },
        { business_id: proBiz.id, name: "Blow Dry & Style", duration_minutes: 30, price_cents: 4500, active: true },
      ] as any);
    }

    // Customers
    const { count: custCount } = await supabaseAdmin
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("business_id", proBiz.id);
    if (!custCount) {
      await supabaseAdmin.from("customers").insert([
        { business_id: proBiz.id, name: "Jordan Lee", email: "jordan@example.com", phone: "+15551234567" },
        { business_id: proBiz.id, name: "Sam Patel", email: "sam@example.com", phone: "+15552345678" },
        { business_id: proBiz.id, name: "Riley Chen", email: "riley@example.com" },
        { business_id: proBiz.id, name: "Morgan Diaz", phone: "+15553456789" },
      ] as any);
    }

    return { email: DEMO_EMAIL, password: DEMO_PASSWORD, salon: salon.name };
  });

export const devMagicLink = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    assertDev();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (error) throw error;
    return {
      email: data.email,
      token_hash: link.properties?.hashed_token ?? "",
    };
  });
