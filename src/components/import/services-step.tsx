import { useState } from "react";
import { Scissors, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
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
import { Dropzone, StepShell, UploadIcon } from "./dropzone";
import { ColumnMapper } from "./column-mapper";
import { useEntityUpload } from "./use-entity-upload";
import { describeImportError } from "./errors";
import { mapServiceRow, type ParsedServiceRow } from "@/lib/import/fresha";
import { commitServices, type CommitResult } from "@/lib/import/commit";
import { fmtMoney } from "@/lib/format";

export function ServicesStep({
  businessId,
  sessionId,
  userId,
  currency,
  onCommitted,
}: {
  businessId: string;
  sessionId: string;
  userId: string | null;
  currency: string;
  onCommitted: () => void;
}) {
  const upload = useEntityUpload<ParsedServiceRow>("services", businessId, mapServiceRow);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  const guessedDurations = upload.rows.filter((r) => r.durationGuessed).length;

  const commit = async () => {
    setCommitting(true);
    try {
      const res = await commitServices({
        businessId,
        sessionId,
        filename: upload.fileName!,
        fileHash: upload.fileHash!,
        totalRows: upload.totalRows,
        skippedNoName: upload.skipped,
        rows: upload.rows,
        createdBy: userId,
      });
      setResult(res);
      toast.success(`Imported ${res.imported} services`);
      onCommitted();
    } catch (e) {
      toast.error(describeImportError(e));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <StepShell
      index={3}
      icon={<Scissors className="h-4 w-4" />}
      title="Services"
      subtitle="Your service list export"
      done={!!result}
    >
      {result ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Imported {result.imported} services
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
          label="Drop your service list export here"
          hint="or click to browse — a CSV of your services, from any booking system"
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
          {upload.headers.length > 0 && (
            <ColumnMapper
              fields={upload.fields}
              headers={upload.headers}
              mapping={upload.mapping}
              onChange={upload.setMapping}
              problem={
                upload.missingRequired.length > 0
                  ? `We couldn't find: ${upload.missingRequired.join(", ")}. Pick the right column below.`
                  : null
              }
            />
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
                <Badge variant="secondary">{upload.rows.length} services found</Badge>
                {upload.skipped > 0 && (
                  <Badge variant="secondary">{upload.skipped} skipped (no name)</Badge>
                )}
                {guessedDurations > 0 && (
                  <Badge variant="secondary">
                    {guessedDurations} with an unreadable duration (defaulted to 60 min)
                  </Badge>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upload.rows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.durationMinutes} min
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtMoney(r.priceCents, currency)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {upload.rows.length > 10 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                    Showing 10 of {upload.rows.length}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={commit}
                  disabled={
                    committing ||
                    !!upload.parseError ||
                    upload.missingRequired.length > 0 ||
                    (!!upload.existingBatch && !upload.overrideDuplicate)
                  }
                >
                  {committing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Import {upload.rows.length} services
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </StepShell>
  );
}
