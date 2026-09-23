import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Private customer notes stay behind the existing customer RLS policies. */
export function BookingCustomerNotes({
  businessId,
  customerId,
}: {
  businessId: string;
  customerId: string;
}) {
  const query = useQuery({
    queryKey: ["booking-customer-notes", businessId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("notes")
        .eq("business_id", businessId)
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (query.isPending)
    return (
      <p className="text-sm text-muted-foreground">Loading customer notes…</p>
    );
  if (query.isError)
    return (
      <p className="text-sm text-muted-foreground">
        Customer notes could not load.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => query.refetch()}
        >
          Try again
        </button>
      </p>
    );
  if (!query.data?.notes) return null;
  return (
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Private customer notes
      </summary>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm">
        {query.data.notes}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        For your team only. Confirm anything that may have changed with the
        customer.
      </p>
    </details>
  );
}
