import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { getCustomerConsultationStatus } from "@/lib/consultations.functions";
import {
  consultationStatus,
  type RecordStatus,
} from "@/lib/consultation-status";

export function CustomerConsultationSummary({
  customerId,
}: {
  customerId: string;
}) {
  const query = useQuery({
    queryKey: ["customer-consultations", customerId],
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return getCustomerConsultationStatus({ data: { customerId }, headers });
    },
  });
  if (query.isLoading)
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        Loading consultation records…
      </p>
    );
  if (query.isError)
    return (
      <p className="mt-5 text-sm text-destructive">
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
  const attention = (query.data ?? []).filter(
    (row: RecordStatus) => consultationStatus(row).attention,
  ).length;
  const current = (query.data?.length ?? 0) - attention;
  return (
    <Link
      to="/consultations"
      search={{ customerId, tab: "records" }}
      className={`mt-5 flex items-center gap-3 rounded-xl border p-4 transition hover:border-foreground/20 ${attention ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-secondary/30"}`}
    >
      <div
        className={`h-9 w-9 rounded-lg grid place-items-center ${attention ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
      >
        {attention ? (
          <TriangleAlert className="h-4 w-4" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Consultation records
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">
          {query.data?.length
            ? `${current} signed/current · ${attention} to review`
            : "No consultation records found"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Latest 20 records. These do not confirm clearance for a particular
          service.
        </p>
      </div>
      <span className="text-xs text-muted-foreground">Open</span>
    </Link>
  );
}
