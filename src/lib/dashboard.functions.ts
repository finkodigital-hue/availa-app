import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardBooking = {
  id: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  status: string;
  paymentStatus: string;
  serviceName: string;
  staffName: string;
};

export type DashboardAttentionItem = {
  id: string;
  kind: "consultation" | "booking" | "stock" | "payment";
  title: string;
  description: string;
  href: string;
  action: string;
};

type DashboardOverview = {
  business: {
    id: string;
    name: string;
    slug: string | null;
    currency: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  nextBooking: DashboardBooking | null;
  today: {
    bookings: number;
    expectedTakingsCents: number;
    upcoming: number;
    staffWorking: number;
  };
  attention: DashboardAttentionItem[];
  setup: {
    profile: boolean;
    openingHours: boolean;
    staff: boolean;
    services: boolean;
    appearance: boolean;
    imported: boolean;
    ready: boolean;
  };
};

function firstRelation(value: unknown) {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return (value as Record<string, unknown> | null) ?? null;
}

function firstRelationName(value: unknown) {
  return String(firstRelation(value)?.name ?? "");
}

async function ownedBusiness(context: any) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id, name, slug, currency, address, phone, email")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No business is connected to this account.");
  return data as DashboardOverview["business"];
}

export const getDashboardOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const business = await ownedBusiness(context);
    // Keep dashboard reads scoped to the signed-in owner and enforced by RLS.
    // The authenticated client is created on the server by requireSupabaseAuth.
    const db = context.supabase as any;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const nowIso = new Date().toISOString();

    // Consultation records are deliberately restricted to the service role.
    // Local development can run without that secret, so omit only this optional
    // attention card instead of failing the entire dashboard.
    let consultationPromise: Promise<any> = Promise.resolve({ data: null, error: null });
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      consultationPromise = (supabaseAdmin as any)
        .from("consultation_submissions")
        .select("id, created_at, customers(name), bookings(customer_name, starts_at)")
        .eq("business_id", business.id)
        .eq("status", "pending")
        .order("created_at")
        .limit(1)
        .maybeSingle();
    }

    const [bookingsResult, staffResult, stockResult, consultationResult, pendingResult, failedPaymentResult, hoursResult, servicesResult, layoutResult, importsResult] =
      await Promise.all([
        db
          .from("bookings")
          .select("id, customer_name, starts_at, ends_at, price_cents, status, payment_status, services(name), staff(name)")
          .eq("business_id", business.id)
          .gte("starts_at", start.toISOString())
          .lt("starts_at", end.toISOString())
          .neq("status", "cancelled")
          .order("starts_at"),
        db
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("active", true)
          .eq("bookable", true)
          .is("archived_at", null),
        db
          .from("inventory_items")
          .select("id, name, current_stock, low_stock_threshold, unit")
          .eq("business_id", business.id)
          .not("low_stock_threshold", "is", null)
          .order("current_stock")
          .limit(40),
        consultationPromise,
        db
          .from("bookings")
          .select("id, customer_name, starts_at")
          .eq("business_id", business.id)
          .eq("status", "pending")
          .gte("starts_at", nowIso)
          .order("starts_at")
          .limit(1)
          .maybeSingle(),
        db
          .from("bookings")
          .select("id, customer_name, starts_at")
          .eq("business_id", business.id)
          .eq("payment_status", "failed")
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("business_hours")
          .select("weekday, open_time, close_time, closed")
          .eq("business_id", business.id),
        db
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("active", true),
        db
          .from("page_layouts")
          .select("id")
          .eq("business_id", business.id)
          .maybeSingle(),
        db
          .from("import_batches")
          .select("id", { count: "exact", head: true })
          .eq("business_id", business.id)
          .eq("status", "completed"),
      ]);

    for (const result of [bookingsResult, staffResult, stockResult, consultationResult, pendingResult, failedPaymentResult, hoursResult, servicesResult, layoutResult, importsResult]) {
      if (result.error) throw result.error;
    }

    const setup = {
      profile: Boolean(
        business.name.trim() &&
          business.slug &&
          business.address?.trim() &&
          (business.phone?.trim() || business.email?.trim()),
      ),
      openingHours: (hoursResult.data ?? []).some((day: any) => !day.closed && day.open_time && day.close_time),
      staff: (staffResult.count ?? 0) > 0,
      services: (servicesResult.count ?? 0) > 0,
      appearance: Boolean(layoutResult.data),
      imported: (importsResult.count ?? 0) > 0,
      ready: false,
    };
    setup.ready = setup.profile && setup.openingHours && setup.staff && setup.services && setup.appearance;

    const bookings: DashboardBooking[] = (bookingsResult.data ?? []).map((booking: any) => ({
      id: booking.id,
      customerName: booking.customer_name,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      priceCents: booking.price_cents ?? 0,
      status: booking.status,
      paymentStatus: booking.payment_status,
      serviceName: firstRelationName(booking.services) || "Appointment",
      staffName: firstRelationName(booking.staff) || "Unassigned",
    }));
    const upcoming = bookings.filter((booking) => new Date(booking.startsAt).getTime() >= Date.now());
    const attention: DashboardAttentionItem[] = [];

    if (consultationResult.data) {
      const submission = consultationResult.data as any;
      const consultationBooking = firstRelation(submission.bookings);
      const customerName = firstRelationName(submission.customers) || String(consultationBooking?.customer_name ?? "") || "A customer";
      attention.push({
        id: `consultation-${submission.id}`,
        kind: "consultation",
        title: "Unsigned consultation",
        description: `${customerName}'s form is waiting for a signature.`,
        href: "/consultations",
        action: "Open",
      });
    }

    if (pendingResult.data) {
      const booking = pendingResult.data as any;
      const date = new Date(booking.starts_at).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      attention.push({
        id: `booking-${booking.id}`,
        kind: "booking",
        title: "Booking needs confirming",
        description: `${booking.customer_name}'s appointment on ${date} is still pending.`,
        href: "/bookings",
        action: "Review",
      });
    }

    const lowStock = (stockResult.data ?? [])
      .filter((item: any) => Number(item.current_stock) <= Number(item.low_stock_threshold))
      .slice(0, 2);
    for (const item of lowStock) {
      attention.push({
        id: `stock-${item.id}`,
        kind: "stock",
        title: "Low stock",
        description: `${item.name} has ${Number(item.current_stock)} ${item.unit || "units"} left.`,
        href: "/stock",
        action: "Review",
      });
    }

    if (failedPaymentResult.data) {
      const payment = failedPaymentResult.data as any;
      attention.push({
        id: `payment-${payment.id}`,
        kind: "payment",
        title: "Payment needs attention",
        description: `${payment.customer_name}'s payment was not completed.`,
        href: "/payments",
        action: "Review",
      });
    }

    return {
      business,
      nextBooking: upcoming[0] ?? null,
      today: {
        bookings: bookings.length,
        expectedTakingsCents: bookings.reduce((total, booking) => total + booking.priceCents, 0),
        upcoming: upcoming.length,
        staffWorking: staffResult.count ?? 0,
      },
      attention: attention.slice(0, 5),
      setup,
    } satisfies DashboardOverview;
  });

export const checkInDashboardBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { bookingId: string }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.bookingId)) {
      throw new Error("That booking could not be found.");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const { data: booking, error } = await context.supabase
      .from("bookings")
      .update({ status: "checked_in" })
      .eq("id", data.bookingId)
      .eq("business_id", business.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!booking) throw new Error("That booking could not be found.");
    return { ok: true };
  });
