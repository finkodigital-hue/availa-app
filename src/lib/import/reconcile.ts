import type { ParsedApptRow } from "./fresha";
import { normalizeName } from "./parse";

export type SavedAppointment = {
  external_id: string | null;
  customer_name: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  staff: { name: string } | null;
  services: { name: string } | null;
};

export type ReconciliationIssue = {
  clientName: string;
  startsAt: Date;
  reason: "missing" | "different" | "duplicate";
  differences: string[];
};

export type ReconciliationResult = {
  sourceCount: number;
  matched: number;
  issues: ReconciliationIssue[];
};

// Compare by source booking ID, then check the fields staff will rely on in
// the diary. A matching count alone would miss an appointment at the wrong time.
export function reconcileUpcomingAppointments(
  source: ParsedApptRow[],
  saved: SavedAppointment[],
  now = new Date(),
): ReconciliationResult {
  const upcoming = source.filter(
    (row) => row.startsAt && row.startsAt > now && row.status === "confirmed",
  );
  const byExternalId = new Map<string, SavedAppointment>();
  const savedCounts = new Map<string, number>();
  for (const row of saved) {
    if (row.external_id) {
      byExternalId.set(row.external_id, row);
      savedCounts.set(
        row.external_id,
        (savedCounts.get(row.external_id) ?? 0) + 1,
      );
    }
  }

  const issues: ReconciliationIssue[] = [];
  let matched = 0;
  const seenSourceIds = new Set<string>();
  for (const row of upcoming) {
    if (seenSourceIds.has(row.externalId)) {
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "duplicate",
        differences: ["booking reference appears more than once in the file"],
      });
      continue;
    }
    seenSourceIds.add(row.externalId);
    const actual = byExternalId.get(row.externalId);
    if (!actual) {
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "missing",
        differences: [],
      });
      continue;
    }
    if ((savedCounts.get(row.externalId) ?? 0) > 1) {
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "duplicate",
        differences: ["booking reference appears more than once in Bookzenvo"],
      });
      continue;
    }
    const differences: string[] = [];
    if (actual.status !== row.status) differences.push("status");
    if (
      new Date(actual.starts_at).getTime() !== row.startsAt!.getTime() ||
      new Date(actual.ends_at).getTime() !== row.endsAt?.getTime()
    )
      differences.push("date or time");
    if (normalizeName(actual.customer_name) !== normalizeName(row.clientName))
      differences.push("client");
    if (normalizeName(actual.staff?.name) !== normalizeName(row.staffName))
      differences.push("team member");
    if (normalizeName(actual.services?.name) !== normalizeName(row.serviceName))
      differences.push("service");
    if (differences.length === 0) matched++;
    else
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "different",
        differences,
      });
  }
  return { sourceCount: upcoming.length, matched, issues };
}
