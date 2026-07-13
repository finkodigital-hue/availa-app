import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserRound, Scissors, CalendarClock, History, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { listImportBatches, rollbackBatch } from "@/lib/import/commit";
import { ENTITY_LABELS, type ImportEntity } from "@/lib/import/fresha";

const ENTITY_ICONS: Record<ImportEntity, React.ReactNode> = {
  staff: <Users className="h-4 w-4" />,
  customers: <UserRound className="h-4 w-4" />,
  services: <Scissors className="h-4 w-4" />,
  bookings: <CalendarClock className="h-4 w-4" />,
};

export function ImportHistoryPanel({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const { data: batches } = useQuery({
    queryKey: ["import-batches", businessId],
    queryFn: () => listImportBatches(businessId),
  });

  if (!batches || batches.length === 0) return null;

  const undo = async (batchId: string) => {
    try {
      await rollbackBatch(batchId, businessId);
      toast.success("Import undone");
      qc.invalidateQueries({ queryKey: ["import-batches", businessId] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["bookings-list"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't undo this import");
    }
  };

  return (
    <div className="rounded-2xl border bg-card overflow-hidden mt-6">
      <div className="p-4 sm:p-5 border-b bg-muted/20 flex items-center gap-1.5 font-medium">
        <History className="h-4 w-4" /> Import history
      </div>
      <div className="divide-y">
        {batches.map((b) => (
          <div key={b.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {ENTITY_ICONS[b.entity_type as ImportEntity]}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {ENTITY_LABELS[b.entity_type as ImportEntity] ?? b.entity_type} ·{" "}
                  {b.source_filename}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()} · {b.imported_count} imported
                  {b.duplicate_count > 0 ? `, ${b.duplicate_count} duplicates skipped` : ""}
                </div>
              </div>
            </div>
            {b.status === "rolled_back" ? (
              <Badge variant="secondary">Undone</Badge>
            ) : (
              <ConfirmDialog
                trigger={
                  <button className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/5">
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                }
                title="Undo this import?"
                description={`This removes the ${b.imported_count} ${ENTITY_LABELS[b.entity_type as ImportEntity]?.toLowerCase() ?? "records"} it added. This can't be undone if other data now depends on them.`}
                confirmLabel="Undo import"
                onConfirm={() => undo(b.id)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
