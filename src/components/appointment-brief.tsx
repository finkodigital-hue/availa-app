import { useQuery } from "@tanstack/react-query";
import { Clock3, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BookingConsultationStatus } from "@/components/booking-consultation-status";
import { BookingCustomerNotes } from "@/components/booking-customer-notes";

/** A read-only staff brief: recorded facts, never AI-generated treatment advice. */
export function AppointmentBrief({
  bookingId,
  businessId,
  customerId,
  startsAt,
}: {
  bookingId: string;
  businessId: string;
  customerId: string | null;
  startsAt: string;
}) {
  const history = useQuery({
    queryKey: [
      "appointment-brief-history",
      businessId,
      customerId,
      bookingId,
      startsAt,
    ],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, starts_at, services(name), staff(name)")
        .eq("business_id", businessId)
        .eq("customer_id", customerId!)
        .eq("status", "completed")
        .lt("starts_at", startsAt)
        .order("starts_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <section
      className="rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 space-y-3"
      aria-label="Before this appointment"
    >
      <div className="flex items-start gap-2.5">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <ClipboardList className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Before this appointment</h3>
          <p className="text-xs text-muted-foreground">
            A quick view of recorded details. Confirm anything that may have
            changed with the client.
          </p>
        </div>
      </div>
      {customerId ? (
        <div className="rounded-xl border bg-background/80 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Clock3 className="h-3.5 w-3.5 text-primary" /> Recent completed
            visits
          </div>
          {history.isPending && (
            <p className="mt-2 text-xs text-muted-foreground">
              Loading visit history…
            </p>
          )}
          {history.isError && (
            <p className="mt-2 text-xs text-muted-foreground">
              Visit history could not load. Check the customer record.
            </p>
          )}
          {history.isSuccess && history.data.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No completed visits recorded here.
            </p>
          )}
          {history.isSuccess && history.data.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-xs">
              {history.data.map((visit) => (
                <li key={visit.id} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {visit.services?.name ?? "Service not recorded"}
                    {visit.staff?.name ? ` · ${visit.staff.name}` : ""}
                  </span>
                  <time
                    className="shrink-0 text-muted-foreground"
                    dateTime={visit.starts_at}
                  >
                    {new Date(visit.starts_at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No linked customer record; visit history and private notes are
          unavailable.
        </p>
      )}
      {customerId && (
        <BookingCustomerNotes businessId={businessId} customerId={customerId} />
      )}
      <BookingConsultationStatus bookingId={bookingId} />
      <p className="text-xs text-muted-foreground">
        Linked forms and patch-test results are records, not clearance to
        perform a treatment. Check the service requirements yourself.
      </p>
    </section>
  );
}
