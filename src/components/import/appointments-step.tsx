import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
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
import { ColumnMapper } from "./column-mapper";
import { useEntityUpload } from "./use-entity-upload";
import { describeImportError } from "./errors";
import { mapApptRow, type ParsedApptRow } from "@/lib/import/fresha";
import {
  computeApptPreview,
  type ApptPreviewStats,
} from "@/lib/import/preview";
import {
  commitAppointments,
  fetchAllRows,
  verifyUpcomingImport,
  type ApptCommitResult,
} from "@/lib/import/commit";
import type { ReconciliationResult } from "@/lib/import/reconcile";
import { fmtMoney, statusMeta } from "@/lib/format";

export function AppointmentsStep({
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
  onCommitted?: () => void;
}) {
  const upload = useEntityUpload<ParsedApptRow>(
    "bookings",
    businessId,
    mapApptRow,
  );
  const [stats, setStats] = useState<ApptPreviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ApptCommitResult | null>(null);
  const [reconciliation, setReconciliation] =
    useState<ReconciliationResult | null>(null);
  const [verificationError, setVerificationError] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  useEffect(() => {
    if (upload.rows.length === 0) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    Promise.all([
      fetchAllRows<{ id: string; name: string }>(
        "staff",
        "id, name",
        businessId,
      ),
      fetchAllRows<{ id: string; name: string }>(
        "customers",
        "id, name",
        businessId,
      ),
      fetchAllRows<{ id: string; name: string }>(
        "services",
        "id, name",
        businessId,
      ),
    ]).then(([s, c, sv]) => {
      if (cancelled) return;
      setStats(computeApptPreview(upload.rows, s, c, sv));
      setStatsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [upload.rows, businessId]);

  const unparsedDates = upload.rows.filter(
    (r) => !r.startsAt || !r.endsAt,
  ).length;
  const upcomingRows = upload.rows.filter(
    (r) =>
      r.startsAt &&
      r.startsAt.getTime() > Date.now() &&
      r.status === "confirmed",
  );
  const visibleRows = showUpcoming ? upcomingRows : upload.rows;

  const commit = async () => {
    setCommitting(true);
    setProgress(0);
    try {
      const res = await commitAppointments({
        businessId,
        sessionId,
        filename: upload.fileName!,
        fileHash: upload.fileHash!,
        totalRows: upload.totalRows,
        skippedInvalid: upload.skipped,
        rows: upload.rows,
        createdBy: userId,
        onProgress: (done, total) =>
          setProgress(Math.round((done / total) * 100)),
      });
      setResult(res);
      onCommitted?.();
      toast.success(`Imported ${res.imported} appointments`);
      try {
        setReconciliation(await verifyUpcomingImport(businessId, upload.rows));
      } catch {
        setVerificationError(true);
      }
    } catch (e) {
      toast.error(describeImportError(e));
    } finally {
      setCommitting(false);
    }
  };

  return (
    <StepShell
      index={4}
      icon={<CalendarClock className="h-4 w-4" />}
      title="Appointments"
      subtitle="Past and upcoming appointments from your old diary"
      done={!!result}
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Imported {result.imported.toLocaleString()} appointments
          </div>
          <p className="text-muted-foreground text-xs">
            {result.linkedToCustomer.toLocaleString()} linked to a client record
            · {result.placeholderStaffCreated} team member
            {result.placeholderStaffCreated === 1 ? "" : "s"} auto-added
            (inactive) · {result.placeholderServicesCreated} service
            {result.placeholderServicesCreated === 1 ? "" : "s"} auto-added
            (inactive) · {result.duplicate.toLocaleString()} already imported,
            skipped
          </p>
          {reconciliation ? (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="font-medium">Upcoming booking check</p>
              <p className="text-muted-foreground text-xs">
                {reconciliation.matched} of {reconciliation.sourceCount}{" "}
                upcoming confirmed appointments in this file match Bookzenvo on
                time, client, service and team member.
              </p>
              {reconciliation.issues.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive font-medium">
                    {reconciliation.issues.length} need a closer look before
                    switching.
                  </p>
                  <ul className="space-y-1 text-xs">
                    {reconciliation.issues.slice(0, 10).map((issue, index) => (
                      <li key={index}>
                        {issue.clientName} · {issue.startsAt.toLocaleString()} —{" "}
                        {issue.reason === "missing"
                          ? "not found in Bookzenvo"
                          : "details differ in Bookzenvo"}
                      </li>
                    ))}
                  </ul>
                  {reconciliation.issues.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first 10 of {reconciliation.issues.length}{" "}
                      issues.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  These appointments match. Still compare the file with your old
                  diary: Bookzenvo cannot detect bookings that were left out of
                  the export.
                </p>
              )}
            </div>
          ) : verificationError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Appointments were imported, but Bookzenvo could not complete the
                automatic check. Compare your upcoming diary manually before
                switching.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking upcoming appointments…
            </p>
          )}
        </div>
      ) : !upload.fileName ? (
        <Dropzone
          fileName={upload.fileName}
          parsing={upload.parsing}
          onFile={upload.load}
          onRemove={upload.reset}
          icon={<UploadIcon />}
          label="Drop your appointment export here"
          hint="Include future bookings as well as history. Check your old system's export settings before uploading."
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
              source={upload.source}
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
                  {new Date(
                    upload.existingBatch.created_at,
                  ).toLocaleDateString()}
                  .
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
                <Badge variant="secondary">
                  {upload.rows.length.toLocaleString()} appointments found
                </Badge>
                <Badge variant="secondary">
                  {upcomingRows.length.toLocaleString()} upcoming confirmed in
                  this file
                </Badge>
                {upload.skipped > 0 && (
                  <Badge variant="secondary">
                    {upload.skipped.toLocaleString()} skipped (incomplete row)
                  </Badge>
                )}
                {unparsedDates > 0 && (
                  <Badge variant="secondary">
                    {unparsedDates.toLocaleString()} with an unreadable date —
                    will be skipped
                  </Badge>
                )}
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs leading-relaxed">
                  <strong>Before you switch:</strong> compare the{" "}
                  {upcomingRows.length.toLocaleString()} upcoming confirmed
                  appointments in this file with your old diary. If any are
                  missing, export them again before relying on this calendar.
                  After import, spot-check dates, times, services and team
                  members in Bookzenvo. Importing does not cancel bookings or
                  reminders in your old system.
                </AlertDescription>
              </Alert>

              {statsLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching
                  against your team, clients and services…
                </div>
              ) : stats ? (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(stats.statusCounts).map(([id, count]) => (
                      <Badge key={id} variant="secondary">
                        {statusMeta(id).label}: {count!.toLocaleString()}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {stats.linkedToCustomer.toLocaleString()} matched to one
                    client · {stats.ambiguousCustomer.toLocaleString()} had more
                    than one client with that name (kept as name only, not
                    linked) · {stats.unmatchedCustomer.toLocaleString()} matched
                    no client (kept as name only)
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {stats.linkedToService.toLocaleString()} matched a current
                    service · {stats.newPlaceholderServiceNames.length} service
                    name
                    {stats.newPlaceholderServiceNames.length === 1
                      ? ""
                      : "s"}{" "}
                    no longer in your current list — they'll be added
                    automatically as inactive (price and duration kept)
                  </p>
                  {stats.newPlaceholderStaffNames.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {stats.newPlaceholderStaffNames.length} team member
                      {stats.newPlaceholderStaffNames.length === 1
                        ? ""
                        : "s"}{" "}
                      appear only in this history, not your team list — they'll
                      be added automatically as inactive:{" "}
                      {stats.newPlaceholderStaffNames.slice(0, 8).join(", ")}
                      {stats.newPlaceholderStaffNames.length > 8 ? "…" : ""}
                    </p>
                  )}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Preview the appointments before importing.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={showUpcoming ? "secondary" : "outline"}
                  aria-pressed={showUpcoming}
                  onClick={() => setShowUpcoming((value) => !value)}
                >
                  {showUpcoming ? "Show all" : "Show upcoming only"}
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Team member</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.slice(0, 10).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {r.clientName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.staffName}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[160px] truncate">
                          {r.serviceName}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {r.startsAt ? r.startsAt.toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtMoney(r.priceCents, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                  Showing {Math.min(10, visibleRows.length).toLocaleString()} of{" "}
                  {visibleRows.length.toLocaleString()}
                  {showUpcoming ? " upcoming confirmed" : ""}
                </div>
              </div>

              {committing && (
                <div className="space-y-1">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Importing… this can take a minute for large histories.
                  </p>
                </div>
              )}
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
                  {committing && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Import {upload.rows.length.toLocaleString()} appointments
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </StepShell>
  );
}
