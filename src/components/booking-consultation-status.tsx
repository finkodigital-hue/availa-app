import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { getBookingConsultationStatus } from "@/lib/consultations.functions";
import {
  consultationStatus,
  type RecordStatus,
} from "@/lib/consultation-status";

function relationOne(value: RecordStatus["consultation_templates"]) {
  return Array.isArray(value) ? value[0] : value;
}

export function BookingConsultationStatus({
  bookingId,
}: {
  bookingId: string;
}) {
  const query = useQuery({
    queryKey: ["booking-consultations", bookingId],
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return getBookingConsultationStatus({ data: { bookingId }, headers });
    },
  });
  if (query.isLoading) return <Skeleton className="h-16 rounded-xl" />;
  if (query.isError)
    return (
      <p className="text-sm text-destructive">
        Consultation records could not load.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => query.refetch()}
        >
          Try again
        </button>
      </p>
    );
  if (!query.data?.length) return null;
  const latestByTemplate = new Map<
    string,
    RecordStatus & { id: string; template_id?: string }
  >();
  for (const row of query.data) {
    const key = row.template_id ?? row.template_snapshot?.id ?? row.id;
    latestByTemplate.set(key, row);
  }
  const currentRows = Array.from(latestByTemplate.values());
  const needsAttention = currentRows.some(
    (row) => consultationStatus(row).attention,
  );
  return (
    <Link
      to="/consultations"
      search={{ bookingId, tab: "records" }}
      className={`block rounded-xl border p-3 transition hover:border-foreground/20 ${needsAttention ? "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20" : "border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20"}`}
    >
      <div className="flex items-center gap-2">
        {needsAttention ? (
          <TriangleAlert className="h-4 w-4 text-amber-700" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        )}
        <span className="text-sm font-semibold">Consultation safety</span>
        <span className="ml-auto text-xs text-muted-foreground">
          View records
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {currentRows.map((row) => {
          const template = relationOne(row.consultation_templates);
          const name = template?.name ?? row.template_snapshot?.name ?? "Form";
          const { label } = consultationStatus(row);
          return (
            <Badge
              key={row.id}
              variant={label === "Signed" ? "default" : "secondary"}
              className="text-[10px]"
            >
              <ClipboardCheck className="h-3 w-3 mr-1" />
              {name}: {label}
            </Badge>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Linked records only. Check service requirements before treatment.
      </p>
    </Link>
  );
}
