import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RequestInput = {
  requestId: string;
};

type ExportBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  amount_paid_cents: number;
  amount_refunded_cents: number;
  payment_status: string;
  status: string;
  services: { name: string } | null;
};

type ExportPayment = {
  id: string;
  booking_id: string | null;
  type: string;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string;
};

export type CustomerDataExport = {
  generatedAt: string;
  business: { id: string; name: string };
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    notes: string | null;
    createdAt: string;
    photoStoragePath: string | null;
    authUserId: string | null;
    stripeCustomerId: string | null;
    externalId: string | null;
    importBatchId: string | null;
  };
  bookings: ExportBooking[];
  payments: ExportPayment[];
  notCovered: string[];
};

const NOT_COVERED_NOTICE = [
  "Page Builder testimonials: remove any testimonial that names this customer.",
  "Older bell notifications: remove any that mention this customer by name.",
];

// Export needs no new DB function: owners already have SELECT on their own
// customers/bookings/payments via existing RLS, same as every other page in
// the app. Streamed straight back as the response rather than written to
// Storage, so the file never exists anywhere except this one authenticated
// download — no bucket, no signed URL, nothing to clean up later.
export const generateCustomerDataExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: RequestInput) => {
    if (!data.requestId) throw new Error("Choose a request first.");
    return data;
  })
  .handler(async ({ data, context }): Promise<CustomerDataExport> => {
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("id, name")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) throw new Error("Business not found.");

    const { data: request, error: requestError } = await (context.supabase as any)
      .from("customer_data_requests")
      .select("id, customer_id, kind, status")
      .eq("id", data.requestId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!request) throw new Error("Request not found.");
    if (request.kind !== "export") throw new Error("This request isn't an export request.");
    if (request.status !== "pending") throw new Error("This request has already been resolved.");
    if (!request.customer_id) throw new Error("This customer's record could not be found. It may have already been merged or removed.");

    const { data: customer, error: customerError } = await context.supabase
      .from("customers")
      .select(
        "id, name, email, phone, address, notes, avatar_url, auth_user_id, stripe_customer_id, external_id, import_batch_id, created_at",
      )
      .eq("id", request.customer_id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("This customer's record could not be found. It may have already been merged or removed.");

    const { data: bookings, error: bookingsError } = await context.supabase
      .from("bookings")
      .select("id, starts_at, ends_at, price_cents, amount_paid_cents, amount_refunded_cents, payment_status, status, services(name)")
      .eq("customer_id", customer.id)
      .eq("business_id", business.id)
      .order("starts_at", { ascending: false });
    if (bookingsError) throw bookingsError;

    const bookingIds = (bookings ?? []).map((b: any) => b.id);
    let payments: ExportPayment[] = [];
    if (bookingIds.length > 0) {
      const { data: paymentRows, error: paymentsError } = await (context.supabase as any)
        .from("payments")
        .select("id, booking_id, type, status, amount_cents, currency, created_at")
        .in("booking_id", bookingIds)
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (paymentsError) throw paymentsError;
      payments = paymentRows ?? [];
    }

    const { error: resolveError } = await (context.supabase as any)
      .from("customer_data_requests")
      .update({ status: "completed", resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("id", request.id);
    if (resolveError) throw resolveError;

    return {
      generatedAt: new Date().toISOString(),
      business: { id: business.id, name: business.name },
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
        createdAt: customer.created_at,
        // The path itself, not a working link — an export file can be
        // forwarded, and a live signed URL to a private photo shouldn't
        // travel with it.
        photoStoragePath: customer.avatar_url,
        authUserId: customer.auth_user_id,
        stripeCustomerId: customer.stripe_customer_id,
        externalId: customer.external_id,
        importBatchId: customer.import_batch_id,
      },
      bookings: (bookings ?? []) as ExportBooking[],
      payments,
      notCovered: NOT_COVERED_NOTICE,
    };
  });

export type EraseCustomerResult = {
  bookingsScrubbed: number;
  paymentsScrubbed: number;
  notificationsDeleted: number;
  photosDeleted: number;
  authAccountStatus: "removed" | "preserved_shared" | "not_found" | "not_applicable";
  manualCheckNotice: string[];
};

// Anonymises a customer in place rather than deleting rows — bookings and
// payments are kept (UK financial record retention) with identity fields
// stripped, so reports keep working. Never touches upcoming bookings; the
// owner has to cancel/reassign those first. See the migration for why the
// portal auth account is only removed when no other business still needs
// it, and why testimonials/notifications aren't claimed as fully scrubbed.
export const eraseCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: RequestInput) => {
    if (!data.requestId) throw new Error("Choose a request first.");
    return data;
  })
  .handler(async ({ data, context }): Promise<EraseCustomerResult> => {
    const { data: business, error: businessError } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) throw new Error("Business not found.");

    const { data: request, error: requestError } = await (context.supabase as any)
      .from("customer_data_requests")
      .select("id, customer_id, kind, status")
      .eq("id", data.requestId)
      .eq("business_id", business.id)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!request) throw new Error("Request not found.");
    if (request.kind !== "deletion") throw new Error("This request isn't a deletion request.");
    if (request.status !== "pending") throw new Error("This request has already been resolved.");
    if (!request.customer_id) throw new Error("This customer's record could not be found. It may have already been merged or removed.");

    const { data: customer, error: customerError } = await context.supabase
      .from("customers")
      .select("id, name, email")
      .eq("id", request.customer_id)
      .eq("business_id", business.id)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("This customer's record could not be found. It may have already been merged or removed.");
    // erase_customer nulls customers.email as part of anonymising the row,
    // so this is the only chance to capture it — needed afterward to decide
    // whether the shared portal auth account is safe to remove.
    const customerEmail = customer.email;

    // Cheap pre-flight read before anything irreversible happens. The RPC
    // below re-checks this itself (authoritative, race-safe) — this first
    // check exists so a blocked erasure never gets as far as deleting a
    // photo for nothing.
    const { count: upcomingCount, error: upcomingError } = await context.supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id)
      .neq("status", "cancelled")
      .gt("starts_at", new Date().toISOString());
    if (upcomingError) throw upcomingError;
    if ((upcomingCount ?? 0) > 0) {
      throw new Error(
        `This customer has ${upcomingCount} upcoming booking${upcomingCount === 1 ? "" : "s"}. Cancel or reassign ${upcomingCount === 1 ? "it" : "them"} first, then try again.`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const photoPrefix = `${business.id}/customers`;
    const { data: photoFiles, error: listError } = await supabaseAdmin.storage
      .from("business-assets")
      .list(photoPrefix, { search: customer.id });
    if (listError) throw listError;
    let photosDeleted = 0;
    if (photoFiles && photoFiles.length > 0) {
      const paths = photoFiles.map((f) => `${photoPrefix}/${f.name}`);
      const { error: removeError } = await supabaseAdmin.storage.from("business-assets").remove(paths);
      if (removeError) throw removeError;
      photosDeleted = paths.length;
    }

    const { data: result, error: eraseError } = await (supabaseAdmin as any).rpc("erase_customer", {
      p_business_id: business.id,
      p_customer_id: customer.id,
      p_request_id: request.id,
      p_resolved_by: context.userId,
    });
    if (eraseError) {
      const match = /^UPCOMING_BOOKINGS:(\d+)/.exec(eraseError.message ?? "");
      if (match) {
        const n = Number(match[1]);
        throw new Error(`This customer has ${n} upcoming booking${n === 1 ? "" : "s"}. Cancel or reassign ${n === 1 ? "it" : "them"} first, then try again.`);
      }
      throw eraseError;
    }

    let authAccountStatus: EraseCustomerResult["authAccountStatus"] = result.had_email
      ? result.other_business_has_live_email
        ? "preserved_shared"
        : "not_found"
      : "not_applicable";
    if (result.had_email && !result.other_business_has_live_email && customerEmail) {
      // No other business still has a live customers row for this email —
      // safe to remove the shared portal auth account. If some other
      // business still needs it, we deliberately leave it alone: deleting
      // it would sign that person out of an unrelated salon that never
      // asked for their data to be erased. Nulling this business's
      // customers.email (already done above) is enough on its own — it's
      // the join key get_portal_customer_records() matches on, so this
      // business's history simply stops appearing to them.
      const { data: authUserId, error: lookupError } = await (supabaseAdmin as any).rpc(
        "find_auth_user_id_by_email",
        { p_email: customerEmail },
      );
      if (lookupError) throw lookupError;
      if (authUserId) {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (deleteError) throw deleteError;
        authAccountStatus = "removed";
      }
    }

    return {
      bookingsScrubbed: result.bookings_scrubbed ?? 0,
      paymentsScrubbed: result.payments_scrubbed ?? 0,
      notificationsDeleted: result.notifications_deleted ?? 0,
      photosDeleted,
      authAccountStatus,
      manualCheckNotice: NOT_COVERED_NOTICE,
    };
  });
