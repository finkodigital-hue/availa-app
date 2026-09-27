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
  reason: "missing" | "different";
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
  for (const row of saved) {
    if (row.external_id) byExternalId.set(row.external_id, row);
  }

  const issues: ReconciliationIssue[] = [];
  let matched = 0;
  for (const row of upcoming) {
    const actual = byExternalId.get(row.externalId);
    if (!actual) {
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "missing",
      });
      continue;
    }
    const same =
      actual.status === row.status &&
      actual.starts_at === row.startsAt!.toISOString() &&
      actual.ends_at === row.endsAt?.toISOString() &&
      normalizeName(actual.customer_name) === normalizeName(row.clientName) &&
      normalizeName(actual.staff?.name) === normalizeName(row.staffName) &&
      normalizeName(actual.services?.name) === normalizeName(row.serviceName);
    if (same) matched++;
    else
      issues.push({
        clientName: row.clientName,
        startsAt: row.startsAt!,
        reason: "different",
      });
  }
  return { sourceCount: upcoming.length, matched, issues };
}
