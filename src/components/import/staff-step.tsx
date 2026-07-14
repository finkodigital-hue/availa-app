import { useState } from "react";
import { Users, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dropzone, StepShell, UploadIcon } from "./dropzone";
import { useEntityUpload } from "./use-entity-upload";
import { describeImportError } from "./errors";
import { mapStaffRow, type ParsedStaffRow } from "@/lib/import/fresha";
import { commitStaff, type CommitResult } from "@/lib/import/commit";

export function StaffStep({
  businessId,
  sessionId,
  userId,
  onCommitted,
}: {
  businessId: string;
  sessionId: string;
  userId: string | null;
  onCommitted: () => void;
}) {
  const upload = useEntityUpload<ParsedStaffRow>("staff", businessId, mapStaffRow);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  const activeFor = (i: number, row: ParsedStaffRow) =>
    overrides[i] ?? row.sourceStatus?.toLowerCase() === "active";

  const commit = async () => {
    setCommitting(true);
    try {
      const rows = upload.rows.map((r, i) => ({ ...r, active: activeFor(i, r) }));
      const res = await commitStaff({
        businessId,
        sessionId,
        filename: upload.fileName!,
        fileHash: upload.fileHash!,
        totalRows: upload.totalRows,
        skippedNoName: upload.skipped,
        rows,
        createdBy: userId,
      });
      setResult(res);
      toast.success(`Imported ${res.imported} team members`);
      onCommitted();
    } catch (e) {
      toast.error(describeImportError(e));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <StepShell
      index={1}
      icon={<Users className="h-4 w-4" />}
      title="Team"
      subtitle="Fresha's team/staff export"
      done={!!result}
    >
      {result ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Imported {result.imported} team members
          {result.duplicate > 0 && (
            <span className="text-muted-foreground">· {result.duplicate} already existed</span>
          )}
        </div>
      ) : !upload.fileName ? (
        <Dropzone
          fileName={upload.fileName}
          parsing={upload.parsing}
          onFile={upload.load}
          onRemove={upload.reset}
          icon={<UploadIcon />}
          label="Drop your team export here"
          hint="or click to browse — the CSV from Fresha's team/staff export"
        />
      ) : (
        <div className="space-y-4">
          <Dropzone
            fileName={upload.fileName}
            parsing={upload.parsing}
            onFile={upload.load}
            onRemove={upload.reset}
            icon={<UploadIcon />}
            label=""
            hint=""
          />

          {upload.parseError && (
            <Alert variant="destructive">
              <AlertDescription>{upload.parseError}</AlertDescription>
            </Alert>
          )}
          {upload.headerMismatch && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This doesn't look like a Fresha team export — double-check you picked the right
                file.
              </AlertDescription>
            </Alert>
          )}
          {upload.existingBatch && !upload.overrideDuplicate && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  This exact file was already imported on{" "}
                  {new Date(upload.existingBatch.created_at).toLocaleDateString()}.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => upload.setOverrideDuplicate(true)}
                >
                  Import anyway
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!upload.parsing && upload.rows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{upload.rows.length} team members found</Badge>
                {upload.skipped > 0 && (
                  <Badge variant="secondary">{upload.skipped} skipped (no name)</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Toggle who's currently active — only active team members can be assigned to new
                bookings. This never hides or removes anyone's existing appointment history.
              </p>
              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upload.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.role ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={activeFor(i, r)}
                            onCheckedChange={(v) => setOverrides((o) => ({ ...o, [i]: v }))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={commit}
                  disabled={
                    committing ||
                    !!upload.parseError ||
                    (!!upload.existingBatch && !upload.overrideDuplicate)
                  }
                >
                  {committing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Import {upload.rows.length} team members
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </StepShell>
  );
}
