import { useMemo, useState } from "react";
import { UserRound, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { Dropzone, StepShell, UploadIcon } from "./dropzone";
import { useEntityUpload } from "./use-entity-upload";
import { describeImportError } from "./errors";
import { mapCustomerRow, type ParsedCustomerRow } from "@/lib/import/fresha";
import { dedupeCustomerRows } from "@/lib/import/matching";
import { commitCustomers, type CommitResult } from "@/lib/import/commit";

export function CustomersStep({
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
  const upload = useEntityUpload<ParsedCustomerRow>("customers", businessId, mapCustomerRow);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CommitResult | null>(null);

  const { rows: deduped, mergedCount } = useMemo(
    () => dedupeCustomerRows(upload.rows),
    [upload.rows],
  );
  const noEmail = deduped.filter((r) => !r.email).length;
  const noPhone = deduped.filter((r) => !r.phone).length;

  const commit = async () => {
    setCommitting(true);
    setProgress(0);
    try {
      const res = await commitCustomers({
        businessId,
        sessionId,
        filename: upload.fileName!,
        fileHash: upload.fileHash!,
        totalRows: upload.totalRows,
        skippedNoName: upload.skipped,
        mergedWithinFile: mergedCount,
        rows: deduped,
        createdBy: userId,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
      setResult(res);
      toast.success(`Imported ${res.imported} clients`);
      onCommitted();
    } catch (e) {
      toast.error(describeImportError(e));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <StepShell
      index={2}
      icon={<UserRound className="h-4 w-4" />}
      title="Clients"
      subtitle="Fresha's client list export"
      done={!!result}
    >
      {result ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Imported {result.imported} clients
          {result.duplicate > 0 && (
            <span className="text-muted-foreground">· {result.duplicate} duplicates skipped</span>
          )}
        </div>
      ) : !upload.fileName ? (
        <Dropzone
          fileName={upload.fileName}
          parsing={upload.parsing}
          onFile={upload.load}
          onRemove={upload.reset}
          icon={<UploadIcon />}
          label="Drop your client list export here"
          hint="or click to browse — Fresha's client list CSV"
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
                This doesn't look like a Fresha client list export — double-check you picked the
                right file.
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

          {!upload.parsing && deduped.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{upload.totalRows} rows in file</Badge>
                <Badge variant="secondary">{deduped.length} unique clients</Badge>
                {mergedCount > 0 && (
                  <Badge variant="secondary">{mergedCount} duplicate entries merged</Badge>
                )}
                {upload.skipped > 0 && (
                  <Badge variant="secondary">{upload.skipped} skipped (no name)</Badge>
                )}
                {noEmail > 0 && <Badge variant="secondary">{noEmail} with no email</Badge>}
                {noPhone > 0 && <Badge variant="secondary">{noPhone} with no phone</Badge>}
              </div>
              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deduped.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {deduped.length > 10 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                    Showing 10 of {deduped.length}
                  </div>
                )}
              </div>
              {committing && <Progress value={progress} />}
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
                  Import {deduped.length} clients
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </StepShell>
  );
}
