import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// A signed-in portal customer (see routes/portal.*.tsx — passwordless via
// Supabase Auth email OTP, same account used across every business they've
// booked with). This hook lets the *public booking page* recognize that
// same signed-in visitor and offer to prefill their contact details, without
// requiring any change to how bookings are created — create_public_booking
// already matches/creates a `customers` row by email, and the portal's own
// booking list already matches by email, so simply reusing their signed-in
// email as the booking email is enough to link everything up automatically.
export type PortalCustomerRecord = {
  id: string;
  business_id: string;
  name: string;
  email: string;
  phone: string | null;
  businesses: { name: string } | null;
};

// Returns the signed-in visitor's saved details, preferring a record from
// this specific business (their real history here) and falling back to
// their most recently-created record anywhere (best-guess name/phone for a
// business they haven't booked with yet). Returns null while signed out or
// once loaded with no saved records at all (brand-new account).
export function usePortalCustomer(businessId: string | undefined) {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["portal-customer-for-booking", user?.email],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_portal_customer_records");
      if (error) throw error;
      return (data ?? []) as PortalCustomerRecord[];
    },
  });

  const records = query.data ?? [];
  const match =
    records.find((r) => r.business_id === businessId) ??
    records[0] ??
    null;

  return {
    user,
    isSignedIn: !!user,
    loading: authLoading || (!!user && query.isLoading),
    profile: match,
  };
}
