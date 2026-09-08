import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type PublicBookingInput = {
  businessId: string;
  serviceId: string;
  staffId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
  gapMin?: number | null;
  activeAfterMin?: number | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: string | undefined, max: number) {
  const cleaned = value?.trim() ?? "";
  if (cleaned.length > max)
    throw new Error("One of the booking details is too long.");
  return cleaned;
}

function createPublicServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("The booking service is not configured.");

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * The browser posts booking details to Bookzenvo; only the server talks to
 * Supabase. The database RPC remains the final authority for service duration,
 * availability, ownership, duplicate slots, and rate limiting.
 */
export const createPublicBooking = createServerFn({ method: "POST" })
  .validator((data: PublicBookingInput) => {
    if (
      ![data.businessId, data.serviceId, data.staffId].every((id) =>
        UUID.test(id),
      )
    ) {
      throw new Error("That booking selection is invalid.");
    }
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime())
    ) {
      throw new Error("Choose a valid appointment time.");
    }
    const customerName = text(data.customerName, 120);
    if (!customerName) throw new Error("Enter your name.");
    return {
      ...data,
      customerName,
      customerEmail: text(data.customerEmail, 254),
      customerPhone: text(data.customerPhone, 50),
      notes: text(data.notes, 2000),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };
  })
  .handler(async ({ data }) => {
    const supabase = createPublicServerClient();
    const { data: bookingId, error } = await supabase.rpc(
      "create_public_booking",
      {
        p_business_id: data.businessId,
        p_service_id: data.serviceId,
        p_staff_id: data.staffId,
        p_customer_name: data.customerName,
        p_customer_email: data.customerEmail ?? "",
        p_customer_phone: data.customerPhone ?? "",
        p_starts_at: data.startsAt,
        p_ends_at: data.endsAt,
        p_notes: data.notes ?? "",
        p_gap_min: data.gapMin ?? null,
        p_active_after_min: data.activeAfterMin ?? null,
      },
    );
    if (error) throw error;
    return { bookingId };
  });
