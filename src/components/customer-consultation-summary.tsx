import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, TriangleAlert } from "lucide-react";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { getCustomerConsultationStatus } from "@/lib/consultations.functions";

export function CustomerConsultationSummary({ customerId }: { customerId: string }) {
  const query = useQuery({
    queryKey: ["customer-consultations", customerId],
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return getCustomerConsultationStatus({ data: { customerId }, headers });
    },
  });
  if (query.isLoading || !query.data?.length) return null;
  const current = query.data.filter((row: any) => row.status === "signed" && (!row.expires_at || new Date(row.expires_at) > new Date())).length;
  const attention = query.data.filter((row: any) => {
    const template = Array.isArray(row.consultation_templates) ? row.consultation_templates[0] : row.consultation_templates;
    const kind = template?.kind ?? row.template_snapshot?.kind;
    return row.status === "pending" || row.status === "withdrawn" || (row.status === "signed" && kind === "patch_test" && row.patch_test_outcome !== "passed");
  }).length;
  return (
    <Link to="/consultations" className={`mt-5 flex items-center gap-3 rounded-xl border p-4 transition hover:border-foreground/20 ${attention ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-emerald-50/60 dark:bg-emerald-950/20"}`}>
      <div className={`h-9 w-9 rounded-lg grid place-items-center ${attention ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
        {attention ? <TriangleAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold flex items-center gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />Consultation records</div>
        <div className="text-xs text-muted-foreground mt-0.5">{current} current{attention ? ` · ${attention} needs attention` : " · everything up to date"}</div>
      </div>
      <span className="text-xs text-muted-foreground">Open</span>
    </Link>
  );
}
