import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [statsError, setStatsError] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ApptCommitResult | null>(null);
  const [reconciliation, setReconciliation] =
    useState<ReconciliationResult | null>(null);
  const [verificationError, setVerificationError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [acknowledgedStatuses, setAcknowledgedStatuses] = useState(false);

  useEffect(() => {
    setReconciliation(null);
    setVerificationError(false);
    setAcknowledgedStatuses(false);
  }, [upload.rows]);

  useEffect(() => {
    if (upload.rows.length === 0) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);
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
    ])
      .then(([s, c, sv]) => {
        if (cancelled) return;
        setStats(computeApptPreview(upload.rows, s, c, sv));
      })
      .catch(() => {
        if (!cancelled) {
          setStats(null);
          setStatsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
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
  const unknownStatuses = upload.rows.filter((row) => !row.statusRecognized);
  const unknownStatusLabels = [
    ...new Set(unknownStatuses.map((row) => row.sourceStatus ?? "blank")),
  ];

  const runVerification = async () => {
    setVerifying(true);
    setVerificationError(false);
    setReconciliation(null);
    try {
      setReconciliation(await verifyUpcomingImport(businessId, upload.rows));
    } catch {
      setVerificationError(true);
    } finally {
      setVerifying(false);
    }
  };

  const downloadIssues = () => {
    if (!reconciliation) return;
    const cell = (value: string) => {
      const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [
      "Client,Appointment time,Issue",
      ...reconciliation.issues.map((issue) =>
        [
          cell(issue.clientName),
          cell(issue.startsAt.toISOString()),
          cell(
            issue.reason === "missing"
              ? "Not found in Bookzenvo"
              : `${issue.reason === "duplicate" ? "Duplicate" : "Different"}: ${issue.differences.join(", ")}`,
          ),
        ].join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "bookzenvo-import-check.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

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
      await runVerification();
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runVerification}
            disabled={verifying}
          >
            {verifying ? "Checking…" : "Check again"}
          </Button>
          {reconciliation ? (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="font-medium">Upcoming booking check</p>
              <p className="text-muted-foreground text-xs">
                {reconciliation.matched} of {reconciliation.sourceCount}{" "}
                upcoming confirmed appointments in this file match Bookzenvo on
                time, client, service and team member.
              </p>
              {reconciliation.sourceCount === 0 ? (
                <p className="text-xs text-destructive font-medium">
                  No upcoming confirmed appointments were found in this file.
                  Check whether your old system exported future bookings
                  separately before switching.
                </p>
              ) : reconciliation.issues.length > 0 ? (
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
                          : issue.reason === "duplicate"
                            ? issue.differences.join(", ")
                            : `different ${issue.differences.join(", ")}`}
                      </li>
                    ))}
                  </ul>
                  {reconciliation.issues.length > 10 && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first 10 of {reconciliation.issues.length}{" "}
                      issues.
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={downloadIssues}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" /> Download all
                    issues (CSV)
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    The download contains client names. Keep it private.
                  </p>
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={runVerification}
                    disabled={verifying}
                  >
                    {verifying ? "Checking…" : "Check saved bookings"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => upload.setOverrideDuplicate(true)}
                  >
                    Import anyway
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {upload.existingBatch &&
            (reconciliation || verificationError || verifying) && (
              <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
                <p className="font-medium">Saved booking check</p>
                {verifying ? (
                  <p>Checking upcoming bookings…</p>
                ) : verificationError ? (
                  <p className="text-destructive">
                    The check could not finish. Try again or compare both
                    diaries manually.
                  </p>
                ) : reconciliation ? (
                  <>
                    <p>
                      {reconciliation.matched} of {reconciliation.sourceCount}{" "}
                      upcoming confirmed bookings in this file match Bookzenvo.
                    </p>
                    {reconciliation.sourceCount === 0 ? (
                      <p className="text-destructive">
                        No upcoming confirmed bookings were found in this
                        export.
                      </p>
                    ) : null}
                    {reconciliation.issues.length > 0 && (
                      <>
                        <p className="text-destructive">
                          {reconciliation.issues.length} need attention. Check
                          the saved diary before switching.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={downloadIssues}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> Download all
                          issues (CSV)
                        </Button>
                        <p className="text-muted-foreground">
                          The download contains client names. Keep it private.
                        </p>
                      </>
                    )}
                  </>
                ) : null}
              </div>
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

              {unknownStatuses.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-2 text-xs">
                    <p>
                      {unknownStatuses.length.toLocaleString()} appointment
                      status{unknownStatuses.length === 1 ? "" : "es"} could not
                      be recognised. They will be treated as confirmed:{" "}
                      {unknownStatusLabels.slice(0, 5).join(", ")}
                      {unknownStatusLabels.length > 5 ? "…" : ""}. Check the
                      Status column mapping or your export before importing,
                      especially if these could be cancelled bookings.
                    </p>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="import-status-ack"
                        checked={acknowledgedStatuses}
                        onCheckedChange={(checked) =>
                          setAcknowledgedStatuses(checked === true)
                        }
                      />
                      <label
                        htmlFor="import-status-ack"
                        className="cursor-pointer"
                      >
                        I checked these statuses and want to import them as
                        confirmed.
                      </label>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

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
              ) : statsError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Bookzenvo couldn't check your team, clients and services
                    against this file. Try uploading it again before importing.
                  </AlertDescription>
                </Alert>
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
                    statsLoading ||
                    statsError ||
                    !stats ||
                    !upload.fileHash ||
                    !!upload.parseError ||
                    upload.missingRequired.length > 0 ||
                    (unknownStatuses.length > 0 && !acknowledgedStatuses) ||
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
